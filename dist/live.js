import {API_BASE} from './config.js';
const API='https://phx-api-be-east-1b.kenna.io/v2/tee-times';
const pending=new Map();
const cache=new Map();
let running=0;
const queue=[];
function limited(task){return new Promise((resolve,reject)=>{queue.push({task,resolve,reject});drain();});}
function drain(){while(running<3&&queue.length){const job=queue.shift();running++;Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{running--;drain();});}}
const timeFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
const partFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function normalizeTimes(payload,facility,date,players,holes,now=Date.now()){
  if(!Array.isArray(payload))throw new Error('Unexpected response');
  let recognized=false;
  const result=new Map();
  for(const course of payload){
    if(!Array.isArray(course.teetimes))throw new Error('Unexpected tee sheet');
    recognized=true;
    for(const tee of course.teetimes){
      if(!tee.teetime||!Array.isArray(tee.rates))throw new Error('Incomplete tee time');
      const instant=new Date(tee.teetime);
      if(!Number.isFinite(instant.getTime()))throw new Error('Invalid tee time');
      if(instant.getTime()<=now)continue;
      const parts=partFormat.formatToParts(instant),value=type=>parts.find(p=>p.type===type)?.value;
      if(`${value('year')}-${value('month')}-${value('day')}`!==date)continue;
      const eligible=tee.rates.filter(rate=>Number(rate.holes)===holes&&Array.isArray(rate.allowedPlayers)&&rate.allowedPlayers.includes(players)&&!rate.isMemberRate&&(!rate.golfnow?.GolfFacilityId||Number(rate.golfnow.GolfFacilityId)===facility));
      if(!eligible.length)continue;
      const minutes=Number(value('hour'))*60+Number(value('minute'));
      result.set(tee.teetime,{time:tee.teetime,label:timeFormat.format(instant),minutes,preferred:minutes>=540&&minutes<=780,holes,players});
    }
  }
  if(payload.length&&!recognized)throw new Error('Unrecognized tee sheet');
  return [...result.values()].sort((a,b)=>a.time.localeCompare(b.time));
}
export function normalizeForeup(payload,date,players,holes,now=new Date()){
  if(!payload||!Array.isArray(payload.times)||payload.date!==date)throw new Error('Unexpected feed');
  const parts=partFormat.formatToParts(now),v=t=>parts.find(p=>p.type===t).value;
  const current=`${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`;
  return payload.times.filter(t=>t.holes===holes&&t.allowedPlayers.includes(players)&&t.remaining>=players&&t.localTime.startsWith(date+' ')&&t.localTime>current).map(t=>{
    const [hour,minute]=t.localTime.slice(11).split(':').map(Number);const minutes=hour*60+minute;
    return {time:t.localTime,label:`${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`,minutes,preferred:minutes>=540&&minutes<=780,holes,players};
  }).sort((a,b)=>a.time.localeCompare(b.time));
}
export function portalUrl(course,date,players){
  const url=new URL(course.booking);
  if(course.live&&course.live.provider!=='foreup'){url.searchParams.set('date',date);url.searchParams.set('golfers',String(players));url.searchParams.set('holes',String(course.holes));url.searchParams.set('course',String(course.live.facility));}
  return url.href;
}
async function fetchSheet(course,date,force=false){
  const key=`${course.id}|${date}`;
  if(!force&&cache.has(key)&&Date.now()-cache.get(key).checkedAt<60000)return cache.get(key);
  if(pending.has(key))return pending.get(key);
  const promise=limited(async()=>{
    const foreup=course.live.provider==='foreup';
    const url=foreup?new URL(`${API_BASE}/api/tee-times`,location.origin):new URL(API);url.searchParams.set('date',date);url.searchParams.set(foreup?'course':'facilityIds',foreup?course.id:String(course.live.facility));
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(url,{method:'GET',credentials:'omit',headers:foreup?{}:{'x-be-alias':course.live.alias},signal:controller.signal});
      if(!response.ok)throw new Error(`Unavailable (${response.status})`);
      const payload=await response.json();
      if(foreup?!Array.isArray(payload.times):!Array.isArray(payload))throw new Error('Unexpected response');
      const value={payload,checkedAt:foreup?payload.checkedAt:Date.now()};cache.set(key,value);return value;
    }finally{clearTimeout(timer);}
  }).finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
}
function textElement(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function slotGrid(slots,course,date,players){
  const grid=document.createElement('div');grid.className='slot-grid';
  for(const slot of slots){const a=document.createElement('a');a.href=portalUrl(course,date,players);a.target='_blank';a.rel='noopener noreferrer';a.className=`slot${slot.preferred?' preferred':''}`;a.textContent=slot.label;a.setAttribute('aria-label',`${course.name}, ${slot.label} Eastern, ${date}, ${players} ${players===1?'player':'players'}. Open booking portal to confirm.`);grid.append(a);}
  return grid;
}
export function mountAvailability(container,course,date,players){
  container.replaceChildren();
  if(!course.live){container.append(textElement('p','Live times: check the official portal.','live-unavailable'));return;}
  let busy=false,latestCheck=0;
  async function load(force=false){
    if(busy||!container.isConnected)return;
    busy=true;container.replaceChildren(textElement('p','Checking live tee times…','live-message'));container.setAttribute('aria-busy','true');
    try{
      const result=await fetchSheet(course,date,force);
      if(!container.isConnected)return;
      const slots=course.live.provider==='foreup'?normalizeForeup(result.payload,date,players,course.holes):normalizeTimes(result.payload,course.live.facility,date,players,course.holes);
      latestCheck=result.checkedAt;
      const preferred=slots.filter(s=>s.preferred),other=slots.filter(s=>!s.preferred);
      container.replaceChildren();
      const heading=textElement('div','LIVE TEE TIMES','live-heading');heading.append(textElement('span',`${course.holes} holes · ${players} ${players===1?'player':'players'}`));container.append(heading);
      container.append(textElement('p',`9 AM–1 PM · ${preferred.length} ${preferred.length===1?'match':'matches'}`,'slot-section-title'));
      if(preferred.length){container.append(slotGrid(preferred.slice(0,6),course,date,players));if(preferred.length>6){const details=document.createElement('details');details.className='more-slots';details.append(textElement('summary',`${preferred.length-6} more preferred times`),slotGrid(preferred.slice(6),course,date,players));container.append(details);}}
      else container.append(textElement('p','No matching times returned in your preferred window.','live-message'));
      if(other.length){const details=document.createElement('details');details.className='more-slots';details.append(textElement('summary',`Earlier / later · ${other.length} ${other.length===1?'time':'times'}`),slotGrid(other,course,date,players));container.append(details);}
      else if(!slots.length)container.append(textElement('p','The feed may be empty, not yet released, or limited. Check the portal too.','live-footnote'));
      const meta=textElement('div','','live-meta');meta.append(textElement('span',`Checked ${timeFormat.format(new Date(result.checkedAt))} ET`));
      const refresh=textElement('button','Refresh');refresh.type='button';refresh.addEventListener('click',()=>{if(Date.now()-latestCheck<30000){refresh.textContent='Just checked';return;}load(true);});meta.append(refresh);container.append(meta,textElement('p','Times can change. Confirm rate eligibility and complete booking in the portal.','live-footnote'));
    }catch{if(container.isConnected){container.replaceChildren(textElement('p','Live check unavailable. Open the course portal for current times.','live-message'));const retry=textElement('button','Retry live check','retry-live');retry.type='button';retry.addEventListener('click',()=>load(true));container.append(retry);}}
    finally{busy=false;container.removeAttribute('aria-busy');}
  }
  if('IntersectionObserver' in window){container.append(textElement('p','Live times load as you browse.','live-message'));const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}},{rootMargin:'250px'});observer.observe(container);setTimeout(()=>{if(!container.isConnected)observer.disconnect();},30000);}else load();
}
