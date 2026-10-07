import {courses,defaultFavorites} from './courses.js';
import {nyDate,shortDate,windowStatus} from './booking.js';
import {mountAvailability,portalUrl} from './live.js';
import {DEFAULT_WINDOW,timeMinutes,windowLabel,quickDate,liveDateSupported,filterCourses,sortCourses} from './explore.js';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const readSaved=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const knownIds=new Set(courses.map(c=>c.id)),regions=new Set(['All',...courses.map(c=>c.region)]);
const storedFavorites=readSaved('nyc-tee-favorites',defaultFavorites);
let favorites=new Set(Array.isArray(storedFavorites)?storedFavorites.filter(id=>knownIds.has(id)):defaultFavorites);
const preferences=readSaved('nyc-tee-preferences',{});
let favoritesOnly=preferences?.favoritesOnly===true,region=regions.has(preferences?.region)?preferences.region:'All';
let preferred={...DEFAULT_WINDOW},filtered=[],controllers=new Map(),availability=new Map(),generation=0,checkingAll=false;
const dateInput=$('#play-date'),originInput=$('#trip-origin'),playersInput=$('#players'),searchInput=$('#course-search'),sortInput=$('#course-sort'),list=$('#course-list');
const defaultOrigin='Grand Central Terminal, New York, NY';
dateInput.min=nyDate();
dateInput.value=/^\d{4}-\d{2}-\d{2}$/.test(preferences?.date||'')&&preferences.date>=nyDate()?preferences.date:quickDate('saturday');
playersInput.value=[1,2,3,4].includes(Number(preferences?.players))?String(preferences.players):'1';
sortInput.value=['picks','matches','name'].includes(preferences?.sort)?preferences.sort:'picks';
if(timeMinutes(preferences?.from)!==null&&timeMinutes(preferences?.to)!==null&&timeMinutes(preferences.from)<=timeMinutes(preferences.to)){
  $('#time-from').value=preferences.from;$('#time-to').value=preferences.to;preferred={from:timeMinutes(preferences.from),to:timeMinutes(preferences.to)};
}
document.querySelector(`input[name="region"][value="${region}"]`).checked=true;
const initialOrigin=new URLSearchParams(location.hash.slice(1)).get('start'),savedOrigin=readSaved('nyc-tee-origin',null);
originInput.value=initialOrigin||(typeof savedOrigin==='string'&&savedOrigin.trim()?savedOrigin:defaultOrigin);
if(initialOrigin){save('nyc-tee-origin',initialOrigin);history.replaceState(null,'',location.pathname+location.search);}

function savePreferences(){save('nyc-tee-preferences',{favoritesOnly,region,date:dateInput.value,players:Number(playersInput.value),sort:sortInput.value,from:$('#time-from').value,to:$('#time-to').value});}
function link(url,text,className=''){return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer"${className?` class="${className}"`:''}>${text}</a>`;}
function directions(destination,mode,origin=originInput.value.trim()||defaultOrigin){
  const url=new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api','1');url.searchParams.set('destination',destination);url.searchParams.set('travelmode',mode);if(origin)url.searchParams.set('origin',origin);return url.href;
}
function travel(course){
  const t=course.travel;if(!t)return '';
  const destination=course.destination||`${course.name} Golf Course, ${course.place}`;
  const station=t.station.split(',')[0].replace(/ (?:Metro-North|LIRR|NJ Transit|PATH|subway) station$/i,'');
  return `<details class="travel-details"><summary><span><span class="transit-tag">${escape(t.mode)}</span><strong>${escape(station)}</strong><small>${t.walk?'then walk':'then Uber / taxi'}</small></span></summary><div class="rules travel-content"><p class="route-line">Suggested route from Grand Central</p><p>${escape(t.line)}</p><div class="trip-leg"><span class="leg-number">1</span><div><strong>Get to ${escape(t.station)}</strong><p>${escape(t.first)}</p>${link(directions(t.stationQuery||t.station,'transit'),'Directions from your starting point ↗')}</div></div><div class="trip-leg"><span class="leg-number">2</span><div><strong>${t.walk?'Walk to the course':'Uber or taxi to the course'}</strong><p>${escape(t.last)}</p>${link(directions(destination,t.walk?'walking':'driving',t.stationQuery||t.station),t.walk?'Walking directions ↗':'Station → course route ↗')}</div></div><p class="travel-tip">Set your play date and arrival time in Maps or TrainTime. ${t.walk?'Allow time to check in before your tee time.':'Allow time for train delays, taxi pickup, and course check-in.'}</p>${link(directions(destination,'transit'),'Compare the full route from your starting point ↗')}${t.source?`<p class="route-source">${link(t.source,'Travel source ↗')}</p>`:''}</div></details>`;
}
function bookingPreview(course,date){
  const notice=course.dateNotices?.find(notice=>date>=notice.from&&date<=notice.to);
  if(notice?.closed)return '<div class="booking-preview"><span>Course calendar</span><p class="status unsure"><span class="status-icon" aria-hidden="true">ⓘ</span>Closed on this play date.</p></div>';
  const status=windowStatus(course,date);
  return `<div class="booking-preview"><span>${escape(course.windowLabel||(course.days?`${course.days} days ahead`:'Confirm booking window'))}</span><p class="status ${status.kind}"><span class="status-icon" aria-hidden="true">${status.kind==='open'?'✓':status.kind==='waiting'?'◷':'ⓘ'}</span>${escape(status.text)}</p></div>`;
}
function card(course,date){
  const saved=favorites.has(course.id),status=windowStatus(course,date);
  const opening=status.opening?`${shortDate(status.opening)}${course.release?` at ${course.release.label} ET`:' · release time not published'}`:(course.windowNote||'Confirm in the official portal.');
  const dateNotice=course.dateNotices?.find(notice=>date>=notice.from&&date<=notice.to);
  return `<article class="course-card" data-course="${escape(course.id)}"><div class="card-main"><div class="card-meta"><span>${escape(course.place)} · ${escape(course.holes)} holes${course.pitch?' · pitch & putt':''}</span><span class="feed-badge" data-feed-badge>${course.live?'Live feed':'Portal check'}</span></div><button type="button" class="favorite-button${saved?' saved':''}" data-favorite="${escape(course.id)}" aria-pressed="${saved}" aria-label="${saved?'Remove':'Save'} ${escape(course.name)} ${saved?'from':'to'} favorites"><svg width="21" height="21" viewBox="0 0 24 24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L2.9 9.6l6.3-.9Z" stroke-linejoin="round"/></svg></button><h3>${escape(course.name)}</h3>${dateNotice?`<p class="course-alert">${escape(dateNotice.text)} ${link(dateNotice.url,'Course calendar ↗')}</p>`:course.alert?`<p class="course-alert">${escape(course.alert)}</p>`:''}<div data-booking-preview>${bookingPreview(course,date)}</div><div class="tee-times" data-slots="${escape(course.id)}"></div>${link(portalUrl(course,date,Number(playersInput.value)),`<span>${course.walkup?'Course info & hours':'Open booking portal'}</span><span aria-hidden="true">↗</span>`,'book-link')}</div>${travel(course)}<details class="rules-details"><summary>Booking rules & sources</summary><div class="rules"><div class="window-block"><span class="window-label">${escape(course.windowAudience||'RESERVATION WINDOW')}</span><strong>${escape(course.windowLabel||(course.days?`${course.days} days ahead`:'Confirm with course'))}</strong><p>For ${shortDate(date)}: ${escape(opening)}</p></div><ul>${course.rules.map(rule=>`<li>${escape(rule)}</li>`).join('')}</ul><span class="source-label">POLICIES CHECKED ${escape(shortDate(course.checked||'2026-09-09').toUpperCase())}</span><div class="sources">${course.sources.map(s=>link(s.url,escape(s.label)+' ↗')).join('')}</div></div></details></article>`;
}
function updateSummary(){
  const supported=filtered.filter(c=>c.live).length,states=[...availability.values()];
  const ready=states.filter(s=>s.state==='ready'),withMatches=ready.filter(s=>s.preferred>0).length,loading=states.filter(s=>s.state==='loading').length,errors=states.filter(s=>s.state==='error').length;
  const remaining=supported-ready.length-errors;
  let text;
  if(!filtered.length)text='No courses match your current filters.';
  else if(!liveDateSupported(dateInput.value))text='Planning ahead · live checks cover the next 31 days.';
  else if(!supported)text='These courses need a check in their official portal.';
  else if(ready.length||errors)text=`${withMatches} ${withMatches===1?'course has':'courses have'} ${windowLabel(preferred)} times · ${ready.length+errors}/${supported} checked${errors?` · ${errors} unavailable`:''}${loading?' · checking…':''}`;
  else text=loading?`Checking ${windowLabel(preferred)} times…`:`${supported} live ${supported===1?'feed':'feeds'} · ${windowLabel(preferred)} preferred`;
  $('#results-note').textContent=text;
  $('#refresh-all').disabled=checkingAll||!supported||!liveDateSupported(dateInput.value);
  $('#refresh-all').innerHTML=checkingAll?'Checking…':`${remaining||!ready.length?'Check all times':'Refresh all'} <span aria-hidden="true">↻</span>`;
  document.querySelector('.availability-dot').classList.toggle('checking',loading>0);
}
function sortCards(){
  const ordered=sortCourses(filtered,sortInput.value,favorites,availability);
  for(const course of ordered){const node=list.querySelector(`[data-course="${course.id}"]`);if(node)list.append(node);}
}
async function checkAll(force=false){
  if(checkingAll)return;
  const current=generation;checkingAll=true;updateSummary();
  await Promise.allSettled([...controllers.values()].map(controller=>controller.load(force)));
  if(current!==generation)return;
  checkingAll=false;if(sortInput.value==='matches')sortCards();updateSummary();
}
function resetFilters(){region='All';searchInput.value='';$('#live-only').checked=false;document.querySelector('input[name="region"][value="All"]').checked=true;render();}
function render(){
  const expanded=new Map([...list.querySelectorAll('.course-card')].map(node=>[node.dataset.course,{travel:node.querySelector('.travel-details')?.open,rules:node.querySelector('.rules-details')?.open}]));
  generation++;checkingAll=false;for(const controller of controllers.values())controller.destroy();controllers=new Map();availability=new Map();
  const date=dateInput.value;dateInput.min=nyDate();
  $('#favorites-count').textContent=favorites.size;$('#all-view').setAttribute('aria-pressed',String(!favoritesOnly));$('#favorites-view').setAttribute('aria-pressed',String(favoritesOnly));
  $('#preferred-label').textContent=windowLabel(preferred);
  document.querySelectorAll('[data-quick]').forEach(button=>button.setAttribute('aria-pressed',String(quickDate(button.dataset.quick)===date)));
  $('#clear-filters').hidden=region==='All'&&!searchInput.value&&!$('#live-only').checked;
  if(!date||!dateInput.validity.valid||date<nyDate()){list.replaceChildren();filtered=[];$('#course-count').textContent='';$('#date-hint').textContent='Choose today or a future date.';$('#results-note').textContent='Select a valid play date to load courses and tee times.';$('#refresh-all').disabled=true;return;}
  savePreferences();
  filtered=filterCourses(courses,{region,favoritesOnly,favorites,query:searchInput.value,liveOnly:$('#live-only').checked});
  filtered=sortCourses(filtered,sortInput.value,favorites);
  $('#course-count').textContent=`${filtered.length} ${filtered.length===1?'course':'courses'}`;
  $('#date-hint').textContent=`${shortDate(date)} · ${playersInput.value} ${playersInput.value==='1'?'player':'players'}`;
  if(!filtered.length){
    const narrowed=region!=='All'||searchInput.value||$('#live-only').checked;
    list.innerHTML=`<div class="empty"><span aria-hidden="true">⚑</span><h3>${favoritesOnly&&!favorites.size?'Build your shortlist.':'No courses match these filters.'}</h3><p>${favoritesOnly&&!favorites.size?'Tap a course’s star to save it here.':favoritesOnly?'Your other favorites are still saved. Try another region or clear the filters.':'Try a course name, a nearby town, or another region.'}</p><button class="text-button" data-empty-action="${narrowed?'clear':'browse'}">${narrowed?'Clear filters':'Browse all courses'}</button></div>`;
  }else list.innerHTML=filtered.map(c=>card(c,date)).join('');
  const current=generation;
  for(const course of filtered){
    const node=list.querySelector(`[data-course="${course.id}"]`),open=expanded.get(course.id);
    if(open?.travel)node.querySelector('.travel-details').open=true;if(open?.rules)node.querySelector('.rules-details').open=true;
    const controller=mountAvailability(node.querySelector('[data-slots]'),course,date,Number(playersInput.value),{window:preferred,onChange:state=>{
      if(current!==generation)return;availability.set(course.id,state);
      const badge=node.querySelector('[data-feed-badge]');
      badge.textContent=state.state==='ready'?(state.preferred?`${state.preferred} preferred`:'No preferred times'):state.state==='error'?'Use portal':state.state==='future'?'Plan ahead':state.state==='loading'?'Checking…':course.live?'Live feed':'Portal check';
      badge.classList.toggle('has-matches',state.state==='ready'&&state.preferred>0);updateSummary();
      if(sortInput.value==='matches'&&!checkingAll&&filtered.every(c=>!c.live||['ready','error','future'].includes(availability.get(c.id)?.state)))sortCards();
    }});controllers.set(course.id,controller);
  }
  updateSummary();if(sortInput.value==='matches')checkAll();
}
function updateOrigin(){
  originInput.value=originInput.value.trim()||defaultOrigin;save('nyc-tee-origin',originInput.value);
  $('#origin-label').textContent=originInput.value===defaultOrigin?'Grand Central':originInput.value;
  for(const course of filtered){const details=list.querySelector(`[data-course="${course.id}"] .travel-details`);if(!details)continue;const open=details.open;details.outerHTML=travel(course);list.querySelector(`[data-course="${course.id}"] .travel-details`).open=open;}
}
dateInput.addEventListener('change',render);playersInput.addEventListener('change',render);
let searchTimer;searchInput.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(render,160);});
$('#live-only').addEventListener('change',render);$('#clear-filters').addEventListener('click',resetFilters);
sortInput.addEventListener('change',()=>{savePreferences();if(sortInput.value==='matches')checkAll();else sortCards();});
document.querySelectorAll('input[name="region"]').forEach(input=>input.addEventListener('change',()=>{region=input.value;render();}));
document.querySelectorAll('[data-quick]').forEach(button=>button.addEventListener('click',()=>{dateInput.value=quickDate(button.dataset.quick);render();}));
$('#all-view').addEventListener('click',()=>{favoritesOnly=false;render();});$('#favorites-view').addEventListener('click',()=>{favoritesOnly=true;render();});
$('#refresh-all').addEventListener('click',()=>checkAll(true));
for(const input of [$('#time-from'),$('#time-to')])input.addEventListener('change',()=>{
  const from=timeMinutes($('#time-from').value),to=timeMinutes($('#time-to').value),valid=from!==null&&to!==null&&from<=to;
  $('#time-to').setCustomValidity(valid?'':'End time must be at or after the start time.');
  $('#time-hint').textContent=valid?'Earlier and later times stay available on each card.':'Choose an end time at or after the start time.';
  if(valid){preferred={from,to};render();}
});
list.addEventListener('click',event=>{
  const empty=event.target.closest('[data-empty-action]');if(empty){if(empty.dataset.emptyAction==='browse')favoritesOnly=false;resetFilters();return;}
  const slot=event.target.closest('[data-slot-course]');if(slot){
    const course=courses.find(c=>c.id===slot.dataset.slotCourse);$('#booking-title').textContent=course.name;
    $('#booking-details').textContent=`${shortDate(slot.dataset.slotDate)} · ${slot.dataset.slotLabel} ET\n${slot.dataset.slotPlayers} ${slot.dataset.slotPlayers==='1'?'player':'players'} · ${course.holes} holes`;
    $('#continue-booking').href=portalUrl(course,slot.dataset.slotDate,Number(slot.dataset.slotPlayers));$('#booking-dialog').showModal();return;
  }
  const button=event.target.closest('[data-favorite]');if(!button)return;
  const id=button.dataset.favorite,course=courses.find(c=>c.id===id);favorites.has(id)?favorites.delete(id):favorites.add(id);
  const persisted=save('nyc-tee-favorites',[...favorites]);$('#save-announcement').textContent=`${course.name} ${favorites.has(id)?'saved to':'removed from'} favorites.${persisted?'':' Browser storage is unavailable; saved for this visit only.'}`;
  if(favoritesOnly){render();$('#favorites-view').focus();return;}
  const saved=favorites.has(id);button.classList.toggle('saved',saved);button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',`${saved?'Remove':'Save'} ${course.name} ${saved?'from':'to'} favorites`);button.querySelector('svg').setAttribute('fill',saved?'currentColor':'none');$('#favorites-count').textContent=favorites.size;
  if(sortInput.value==='picks')sortCards();
});
$('#close-booking').addEventListener('click',()=>$('#booking-dialog').close());
originInput.addEventListener('input',updateOrigin);originInput.addEventListener('change',updateOrigin);$('#reset-origin').addEventListener('click',()=>{originInput.value=defaultOrigin;updateOrigin();});
window.addEventListener('storage',event=>{if(event.key==='nyc-tee-favorites'){const values=readSaved('nyc-tee-favorites',[]);favorites=new Set(Array.isArray(values)?values.filter(id=>knownIds.has(id)):[]);render();}});
function refreshVisible(){
  if(document.hidden)return;
  if(dateInput.value<nyDate()){render();return;}
  for(const course of filtered){const node=list.querySelector(`[data-course="${course.id}"] [data-booking-preview]`);if(node)node.innerHTML=bookingPreview(course,dateInput.value);}
  for(const controller of controllers.values())controller.refreshIfStale();
}
document.addEventListener('visibilitychange',refreshVisible);window.addEventListener('focus',refreshVisible);setInterval(refreshVisible,60000);
updateOrigin();render();
