import {courses,defaultFavorites} from './courses.js';
import {nyDate,shiftDate,shortDate,windowStatus} from './booking.js';
import {mountAvailability,portalUrl} from './live.js';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const readSaved=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const knownIds=new Set(courses.map(c=>c.id));
const storedFavorites=readSaved('nyc-tee-favorites',defaultFavorites);
let favorites=new Set(Array.isArray(storedFavorites)?storedFavorites.filter(id=>knownIds.has(id)):[]);
let favoritesOnly=false,region='All';
const dateInput=$('#play-date');
const originInput=$('#trip-origin');
dateInput.min=nyDate();
dateInput.value=shiftDate(nyDate(),3);
const initialOrigin=new URLSearchParams(location.hash.slice(1)).get('start');
originInput.value=initialOrigin||readSaved('nyc-tee-origin',null)||'Grand Central Terminal, New York, NY';
if(initialOrigin){save('nyc-tee-origin',initialOrigin);history.replaceState(null,'',location.pathname+location.search);}

function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function link(url,text,className=''){return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer"${className?` class="${className}"`:''}>${text}</a>`;}
function directions(destination,mode,origin=originInput.value.trim()){
  const url=new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api','1');url.searchParams.set('destination',destination);url.searchParams.set('travelmode',mode);
  if(origin)url.searchParams.set('origin',origin);
  return url.href;
}
function travel(course){
  const t=course.travel;
  if(!t)return '';
  const destination=course.destination||`${course.name} Golf Course, ${course.place}`;
  return `<details class="travel-details"><summary><span>Getting there <span class="transit-tag">${escape(t.mode)}</span></span></summary><div class="rules travel-content"><p class="route-line">${escape(t.line)}</p><div class="trip-leg"><span class="leg-number">1</span><div><strong>${escape(t.station)}</strong><p>${escape(t.first)}</p>${link(directions(t.stationQuery||t.station,'transit'),'Train / transit directions ↗')}</div></div><div class="trip-leg"><span class="leg-number">2</span><div><strong>${t.walk?'Walk to the course':'Uber or taxi to the course'}</strong><p>${escape(t.last)}</p>${link(directions(destination,t.walk?'walking':'driving',t.stationQuery||t.station),t.walk?'Walking directions ↗':'Station → course route ↗')}</div></div>${t.walk?'':`<p class="travel-tip">Choose the station as your pickup in Uber. Check the fare and allow time for pickup before committing to an early tee time.</p>`}${link(directions(destination,'transit'),'Compare full public-transit route ↗')}${t.source?`<p class="route-source">${link(t.source,'Travel source ↗')}</p>`:''}</div></details>`;
}
function card(course,date){
  const status=windowStatus(course,date);
  const saved=favorites.has(course.id);
  const dateText=status.opening?`${shortDate(status.opening)}${course.release?` · ${course.release.label} ET`:' · release time not published'}`:(course.windowNote||'Check the official portal for the current rule.');
  return `<article class="course-card" data-course="${escape(course.id)}"><div class="card-main"><div class="card-meta"><span>${escape(course.place)}</span><span class="separator">/</span><span>${escape(course.holes)} holes${course.pitch?' · pitch & putt':''}</span></div><button type="button" class="favorite-button${saved?' saved':''}" data-favorite="${escape(course.id)}" aria-pressed="${saved}" aria-label="${saved?'Remove':'Save'} ${escape(course.name)} ${saved?'from':'to'} favorites"><svg width="21" height="21" viewBox="0 0 24 24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L2.9 9.6l6.3-.9Z" stroke-linejoin="round"/></svg></button><h3>${escape(course.name)}</h3>${course.alert?`<p class="course-alert">${escape(course.alert)}</p>`:''}<div class="window-block"><span class="window-label">${escape(course.windowAudience||'RESERVATION WINDOW')}</span><div class="window-value">${escape(course.windowLabel||(course.days?`${course.days} days ahead`:'Confirm with course'))}</div><div class="window-date">${escape(dateText)}</div></div><p class="status ${status.kind}"><span class="status-icon" aria-hidden="true">${status.kind==='open'?'✓':status.kind==='waiting'?'◷':'ⓘ'}</span>${escape(status.text)}</p><div class="tee-times" data-slots="${escape(course.id)}"></div>${link(course.booking,`<span>${course.walkup?'Course info & hours':'Check tee times'}</span><span aria-hidden="true">↗</span>`,'book-link')}</div><details><summary>Booking rules & sources</summary><div class="rules"><ul>${course.rules.map(rule=>`<li>${escape(rule)}</li>`).join('')}</ul><span class="source-label">OFFICIAL SOURCES</span><div class="sources">${course.sources.map(s=>link(s.url,escape(s.label)+' ↗')).join('')}</div></div></details>${travel(course)}</article>`;
}
function render(){
  const date=dateInput.value;
  if(!date||date<nyDate()){$('#date-hint').textContent='Choose today or a future date to see booking windows.';$('#course-list').replaceChildren();$('#course-count').textContent='';$('#results-note').textContent='Select a valid play date to load courses and tee times.';return;}
  const players=Number(document.querySelector('#players').value);
  const filtered=courses.filter(c=>(region==='All'||c.region===region)&&(!favoritesOnly||favorites.has(c.id)));
  $('#course-count').textContent=`${filtered.length} ${filtered.length===1?'course':'courses'}`;
  $('#favorites-count').textContent=favorites.size;
  $('#date-hint').textContent=`Playing ${shortDate(date)} · booking dates below.`;
  $('#results-note').textContent=favoritesOnly?'Your saved courses. Live matches highlight 9 AM–1 PM; earlier and later times are below.':`Playing ${shortDate(date)} · live matches highlight 9 AM–1 PM. Some courses require a portal check.`;
  $('#course-list').innerHTML=filtered.length?filtered.map(c=>card(c,date)).join(''):`<div class="empty"><h3>${favoritesOnly?'Your next regular is out there.':'No courses in this region.'}</h3><p>${favoritesOnly?'Tap the star on a course to keep it here. Favorites are saved in this browser.':'Choose another region to browse courses.'}</p>${favoritesOnly?'<button class="text-button" id="browse-all">Browse all courses</button>':''}</div>`;
  $('#all-view').setAttribute('aria-pressed',String(!favoritesOnly));
  $('#favorites-view').setAttribute('aria-pressed',String(favoritesOnly));
  const browse=$('#browse-all');if(browse)browse.addEventListener('click',()=>{favoritesOnly=false;region='All';document.querySelector('input[name="region"][value="All"]').checked=true;render();});
  for(const course of filtered){const container=document.querySelector(`[data-slots="${course.id}"]`);mountAvailability(container,course,date,players);document.querySelector(`[data-course="${course.id}"] .book-link`).href=portalUrl(course,date,players);}
  document.dispatchEvent(new CustomEvent('courses-rendered',{detail:{courses:filtered,date}}));
}
dateInput.addEventListener('change',render);
document.querySelector('#players').addEventListener('change',render);
document.querySelectorAll('input[name="region"]').forEach(input=>input.addEventListener('change',()=>{region=input.value;render();}));
$('#all-view').addEventListener('click',()=>{favoritesOnly=false;render();});
$('#favorites-view').addEventListener('click',()=>{favoritesOnly=true;render();});
$('#course-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-favorite]');if(!button)return;
  const id=button.dataset.favorite,course=courses.find(c=>c.id===id);
  favorites.has(id)?favorites.delete(id):favorites.add(id);
  const persisted=save('nyc-tee-favorites',[...favorites]);
  $('#save-announcement').textContent=`${course.name} ${favorites.has(id)?'saved to':'removed from'} favorites.${persisted?'':' Browser storage is unavailable; this change will last only for this visit.'}`;
  if(favoritesOnly){render();$('#favorites-view').focus();return;}
  const saved=favorites.has(id);button.classList.toggle('saved',saved);button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',`${saved?'Remove':'Save'} ${course.name} ${saved?'from':'to'} favorites`);button.querySelector('svg').setAttribute('fill',saved?'currentColor':'none');$('#favorites-count').textContent=favorites.size;
});
originInput.addEventListener('change',()=>{save('nyc-tee-origin',originInput.value.trim());render();});
window.addEventListener('storage',event=>{if(event.key==='nyc-tee-favorites'){const values=readSaved('nyc-tee-favorites',[]);favorites=new Set(Array.isArray(values)?values.filter(id=>knownIds.has(id)):[]);render();}});
render();
