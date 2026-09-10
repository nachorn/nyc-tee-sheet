const COURSES=Object.freeze({lido:{schedule:'9011',bookingClass:'13654'},weequahic:{schedule:'11077',bookingClass:'49424'}});
const MAX_BYTES=1024*1024;
const json=(value,status=200,origin='')=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
export function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const date=new Date(`${value}T12:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function cleanTimes(payload,date){
  if(!Array.isArray(payload))throw new Error('Invalid tee sheet');
  return payload.map(tee=>{
    if(typeof tee.time!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(tee.time)||!Number.isFinite(Number(tee.available_spots_18))||!Array.isArray(tee.allowed_group_sizes))throw new Error('Invalid tee-time schema');
    const remaining=Number(tee.available_spots_18);
    const groups=tee.allowed_group_sizes.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=4&&n<=remaining&&n>=Number(tee.min||1)&&n<=Number(tee.max||4));
    return {localTime:tee.time,holes:Number(tee.holes),allowedPlayers:groups,remaining};
  }).filter(tee=>tee.localTime.startsWith(`${date} `)&&tee.holes===18&&tee.remaining>0);
}
async function readLimited(response){
  if(!response.body)throw new Error('No response body');
  const reader=response.body.getReader();const chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_BYTES){await reader.cancel();throw new Error('Response too large');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
  async fetch(request,env={},ctx={waitUntil:()=>{}}){
    const url=new URL(request.url);
    const origin=request.headers.get('Origin')||'';
    const allowed=origin===env.ALLOWED_ORIGIN||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if(origin&&!allowed)return json({error:'Origin not allowed'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||env.ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Max-Age':'86400','Vary':'Origin'}});
    if(request.method!=='GET')return json({error:'Read-only endpoint'},405,origin);
    if(url.pathname==='/health')return json({ok:true,service:'NYC Tee Sheet public availability'},200,origin);
    if(url.pathname!=='/api/tee-times')return json({error:'Not found'},404,origin);
    const courseId=url.searchParams.get('course'),date=url.searchParams.get('date'),course=COURSES[courseId];
    if(!course||!validDate(date))return json({error:'Choose a supported course and a valid date'},400,origin);
    const days=(new Date(`${date}T12:00:00Z`)-new Date())/86400000;
    if(days < -1||days > 31)return json({error:'Date must be within the next 30 days'},400,origin);
    const cacheUrl=new URL('/api/tee-times',url.origin);cacheUrl.searchParams.set('course',courseId);cacheUrl.searchParams.set('date',date);
    const cacheKey=new Request(cacheUrl.href);const edgeCache=globalThis.caches?.default;
    if(edgeCache){const hit=await edgeCache.match(cacheKey);if(hit){const response=new Response(hit.body,hit);response.headers.set('Cache-Control','no-store');if(origin)response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');return response;}}
    const [year,month,day]=date.split('-');
    const upstream=new URL('https://foreupsoftware.com/index.php/api/booking/times');
    for(const [key,value] of Object.entries({time:'all',date:`${month}-${day}-${year}`,holes:'18',players:'0',booking_class:course.bookingClass,schedule_id:course.schedule,specials_only:'0',api_key:''}))upstream.searchParams.set(key,value);
    try{
      const response=await fetch(upstream,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)return json({error:'The course feed is unavailable; check the official portal.'},502,origin);
      const times=cleanTimes(await readLimited(response),date);
      const result={course:courseId,date,times,checkedAt:Date.now()};
      const outgoing=json(result,200,origin);
      if(edgeCache){const cached=json(result);cached.headers.set('Cache-Control','public, max-age=60');ctx.waitUntil(edgeCache.put(cacheKey,cached));}
      return outgoing;
    }catch{return json({error:'The live check could not finish; check the official portal.'},502,origin);}
  }
};
