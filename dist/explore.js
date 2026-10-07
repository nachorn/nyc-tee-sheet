import {nyDate,shiftDate} from './booking.js';

export const DEFAULT_WINDOW={from:540,to:780};
export function timeMinutes(value){
  if(!/^\d{2}:\d{2}$/.test(value||''))return null;
  const [hour,minute]=value.split(':').map(Number);
  return hour<24&&minute<60?hour*60+minute:null;
}
export function timeLabel(minutes){
  const hour=Math.floor(minutes/60),minute=minutes%60;
  return `${hour%12||12}${minute?':'+String(minute).padStart(2,'0'):''} ${hour>=12?'PM':'AM'}`;
}
export function windowLabel(window=DEFAULT_WINDOW){return `${timeLabel(window.from)}–${timeLabel(window.to)}`;}
export function preferredTime(minutes,window=DEFAULT_WINDOW){return minutes>=window.from&&minutes<=window.to;}
export function quickDate(kind,today=nyDate()){
  if(kind==='today')return today;
  if(kind==='tomorrow')return shiftDate(today,1);
  const target=kind==='saturday'?6:0;
  const weekday=new Date(`${today}T12:00:00Z`).getUTCDay();
  return shiftDate(today,(target-weekday+7)%7);
}
export function liveDateSupported(date,now=new Date()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
  const parsed=new Date(`${date}T12:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return false;
  const today=nyDate(now);return date>=today&&date<=shiftDate(today,31);
}
export function filterCourses(courses,{region='All',favoritesOnly=false,favorites=new Set(),query='',liveOnly=false}={}){
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return courses.filter(c=>{
    const text=`${c.name} ${c.place} ${c.region} ${c.travel?.mode||''} ${c.travel?.station||''}`.toLowerCase();
    return (region==='All'||c.region===region)&&(!favoritesOnly||favorites.has(c.id))&&(!liveOnly||c.live)&&terms.every(term=>text.includes(term));
  });
}
export function sortCourses(courses,sort,favorites,availability=new Map()){
  return [...courses].sort((a,b)=>{
    if(sort==='name')return a.name.localeCompare(b.name);
    if(sort==='matches'){
      const aState=availability.get(a.id),bState=availability.get(b.id);
      const score=state=>state?.state==='ready'?state.preferred: -1;
      const difference=score(bState)-score(aState);
      if(difference)return difference;
    }
    return Number(favorites.has(b.id))-Number(favorites.has(a.id))||courses.indexOf(a)-courses.indexOf(b);
  });
}
