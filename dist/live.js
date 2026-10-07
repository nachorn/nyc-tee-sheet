import {API_BASE} from './config.js';
import {DEFAULT_WINDOW,preferredTime,windowLabel,liveDateSupported} from './explore.js';
const API='https://phx-api-be-east-1b.kenna.io/v2/tee-times';
const pending=new Map(),cache=new Map(),queue=[];
let running=0;
function limited(task,signal){return new Promise((resolve,reject)=>{queue.push({task,signal,resolve,reject});drain();});}
function drain(){
  while(running<3&&queue.length){
    const job=queue.shift();
    if(job.signal.aborted){job.reject(new DOMException('Cancelled','AbortError'));continue;}
    running++;
    Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{running--;drain();});
  }
}
const timeFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
const partFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function normalizeTimes(payload,facility,date,players,holes,now=Date.now(),window=DEFAULT_WINDOW){
  if(!Array.isArray(payload))throw new Error('Unexpected response');
  const result=new Map();
  for(const course of payload){
    if(!Array.isArray(course.teetimes))throw new Error('Unexpected tee sheet');
    for(const tee of course.teetimes){
      if(!tee.teetime||!Array.isArray(tee.rates))throw new Error('Incomplete tee time');
      const instant=new Date(tee.teetime);
      if(!Number.isFinite(instant.getTime()))throw new Error('Invalid tee time');
      if(instant.getTime()<=now)continue;
      const parts=partFormat.formatToParts(instant),value=type=>parts.find(p=>p.type===type)?.value;
      if(`${value('year')}-${value('month')}-${value('day')}`!==date)continue;
      const eligible=tee.rates.some(rate=>Number(rate.holes)===holes&&Array.isArray(rate.allowedPlayers)&&rate.allowedPlayers.map(Number).includes(players)&&!rate.isMemberRate&&(!rate.golfnow?.GolfFacilityId||Number(rate.golfnow.GolfFacilityId)===facility));
      if(!eligible)continue;
      const minutes=Number(value('hour'))*60+Number(value('minute'));
      result.set(instant.getTime(),{time:tee.teetime,label:timeFormat.format(instant),minutes,preferred:preferredTime(minutes,window),holes,players});
    }
  }
  return [...result.values()].sort((a,b)=>a.minutes-b.minutes);
}
export function normalizeForeup(payload,date,players,holes,now=new Date(),window=DEFAULT_WINDOW){
  if(!payload||!Array.isArray(payload.times)||payload.date!==date)throw new Error('Unexpected feed');
  const parts=partFormat.formatToParts(now),v=t=>parts.find(p=>p.type===t).value;
  const current=`${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`;
  const result=new Map();
  for(const t of payload.times){
    if(!/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(t?.localTime)||!Array.isArray(t.allowedPlayers))continue;
    const remaining=Number(t.remaining);
    if(!Number.isInteger(remaining)||remaining<players||Number(t.holes)!==holes||!t.allowedPlayers.map(Number).includes(players)||!t.localTime.startsWith(date+' ')||t.localTime<=current)continue;
    const [hour,minute]=t.localTime.slice(11).split(':').map(Number),minutes=hour*60+minute;
    result.set(t.localTime,{time:t.localTime,label:`${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`,minutes,preferred:preferredTime(minutes,window),holes,players});
  }
  return [...result.values()].sort((a,b)=>a.minutes-b.minutes);
}
export function portalUrl(course,date,players){
  const url=new URL(course.booking);
  if(course.live&&course.live.provider!=='foreup'){
    url.searchParams.set('date',date);url.searchParams.set('golfers',String(players));
    url.searchParams.set('holes',String(course.holes));url.searchParams.set('course',String(course.live.facility));
  }
  return url.href;
}
async function fetchSheet(course,date,force,signal){
  const key=`${course.id}|${date}`,saved=cache.get(key);
  if(!force&&saved&&Date.now()-saved.fetchedAt<60000)return saved;
  let entry=pending.get(key);
  if(!entry||entry.controller.signal.aborted){
    entry={controller:new AbortController(),consumers:new Set()};
    const current=entry;
    entry.promise=limited(async()=>{
      if(current.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
      const foreup=course.live.provider==='foreup';
      const url=foreup?new URL(`${API_BASE}/api/tee-times`,location.origin):new URL(API);
      url.searchParams.set('date',date);url.searchParams.set(foreup?'course':'facilityIds',foreup?course.id:String(course.live.facility));
      const timer=setTimeout(()=>current.controller.abort(),12000);
      try{
        const response=await fetch(url,{method:'GET',credentials:'omit',headers:foreup?{}:{'x-be-alias':course.live.alias},signal:current.controller.signal});
        if(!response.ok)throw new Error(`Unavailable (${response.status})`);
        const payload=await response.json();
        if(foreup?!Array.isArray(payload.times):!Array.isArray(payload))throw new Error('Unexpected response');
        const fetchedAt=Date.now(),timestamp=Number(payload.checkedAt);
        const checkedAt=foreup&&Number.isFinite(timestamp)&&timestamp>0&&timestamp<=fetchedAt+60000?timestamp:fetchedAt;
        const value={payload,checkedAt,fetchedAt};cache.set(key,value);return value;
      }finally{clearTimeout(timer);}
    },entry.controller.signal).finally(()=>{if(pending.get(key)===current)pending.delete(key);});
    pending.set(key,entry);
  }
  const consumer={};entry.consumers.add(consumer);
  const cancel=()=>{entry.consumers.delete(consumer);if(!entry.consumers.size)entry.controller.abort();};
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted)cancel();
  try{return await entry.promise;}finally{signal.removeEventListener('abort',cancel);entry.consumers.delete(consumer);}
}
function element(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function slotGrid(slots,course,date,players){
  const grid=document.createElement('div');grid.className='slot-grid';
  for(const slot of slots){
    const button=element('button',slot.label,`slot${slot.preferred?' preferred':''}`);button.type='button';
    button.dataset.slotCourse=course.id;button.dataset.slotLabel=slot.label;button.dataset.slotMinutes=slot.minutes;button.dataset.slotDate=date;button.dataset.slotPlayers=players;
    button.setAttribute('aria-label',`Review ${slot.label} at ${course.name}, ${players} ${players===1?'player':'players'}`);grid.append(button);
  }
  return grid;
}
export function mountAvailability(container,course,date,players,{window=DEFAULT_WINDOW,onChange=()=>{}}={}){
  const lifecycle=new AbortController();let active=true,busy=null,latestCheck=0,observer,lastReady;
  const emit=value=>{if(value.state==='ready')lastReady=value;if(active)onChange(value.state==='loading'&&lastReady?{...lastReady,state:'loading'}:value);};
  const visible=()=>{const rect=container.getBoundingClientRect();return rect.bottom>0&&rect.top<globalThis.innerHeight+250;};
  const controller={load,refreshIfStale:(includeHidden=false)=>{if((includeHidden||visible())&&Date.now()-latestCheck>=60000)return load();},destroy:()=>{active=false;observer?.disconnect();lifecycle.abort();}};
  container.replaceChildren();
  if(!course.live){container.append(element('p','Check the official portal for tee times.','live-unavailable'));emit({state:'portal'});return controller;}
  if(!liveDateSupported(date)){container.append(element('p','Use the booking window to plan ahead. Live checks cover today through the next 31 days.','live-message'));emit({state:'future'});return controller;}
  async function load(force=false){
    if(!active||!course.live||!liveDateSupported(date))return;
    if(busy)return busy;
    observer?.disconnect();
    busy=(async()=>{
      const expanded=new Set([...container.querySelectorAll('.more-slots[open]')].map(details=>details.dataset.section));
      if(!container.querySelector('.live-heading'))container.replaceChildren(element('p','Checking tee times…','live-message loading'));
      else for(const button of container.querySelectorAll('.live-meta button')){button.disabled=true;button.textContent='Checking…';}
      container.setAttribute('aria-busy','true');emit({state:'loading'});
      try{
        const result=await fetchSheet(course,date,force,lifecycle.signal);
        if(!active)return;
        const slots=course.live.provider==='foreup'?normalizeForeup(result.payload,date,players,course.holes,new Date(),window):normalizeTimes(result.payload,course.live.facility,date,players,course.holes,Date.now(),window);
        latestCheck=result.checkedAt;
        const preferred=slots.filter(s=>s.preferred),other=slots.filter(s=>!s.preferred);
        container.replaceChildren();
        const heading=element('div',windowLabel(window)+' ET','live-heading');heading.append(element('span',`${preferred.length} ${preferred.length===1?'time':'times'}`,preferred.length?'match-count':'no-match-count'));container.append(heading);
        if(preferred.length){
          container.append(slotGrid(preferred.slice(0,6),course,date,players));
          if(preferred.length>6){const details=element('details','','more-slots');details.dataset.section='preferred';details.open=expanded.has('preferred');details.append(element('summary',`Show ${preferred.length-6} more in this window`),slotGrid(preferred.slice(6),course,date,players));container.append(details);}
        }else container.append(element('p',other.length?'No times in your preferred window. There are earlier or later options.':'No times returned. They may be booked, unreleased, or omitted from this feed.','live-message'));
        if(other.length){const details=element('details','','more-slots');details.dataset.section='other';details.open=expanded.has('other');details.append(element('summary',`Earlier / later · ${other.length} ${other.length===1?'time':'times'}`),slotGrid(other,course,date,players));container.append(details);}
        const meta=element('div','','live-meta');meta.append(element('span',`Checked ${timeFormat.format(new Date(result.checkedAt))} ET`));
        const refresh=element('button','Refresh');refresh.type='button';refresh.setAttribute('aria-label',`Refresh ${course.name} tee times`);refresh.addEventListener('click',()=>load(true));meta.append(refresh);container.append(meta);
        emit({state:'ready',preferred:preferred.length,total:slots.length,checkedAt:result.checkedAt});
      }catch{
        if(active){container.replaceChildren(element('p','Live check unavailable. Use the official portal for current times.','live-message'));const retry=element('button','Try again','retry-live');retry.type='button';retry.addEventListener('click',()=>load(true));container.append(retry);emit({state:'error'});}
      }finally{busy=null;if(active)container.removeAttribute('aria-busy');}
    })();
    return busy;
  }
  emit({state:'idle'});
  if('IntersectionObserver' in globalThis){
    container.append(element('p','Live times check as you browse.','live-message'));
    observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))load();},{rootMargin:'250px'});observer.observe(container);
  }else load();
  return controller;
}
