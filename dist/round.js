import {timeMinutes,timeLabel,DEFAULT_WINDOW} from './explore.js';

function realDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function clockValue(minutes){return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
export function sharedRound(hash,knownIds){
  const params=new URLSearchParams(hash.replace(/^#/,'')),course=params.get('round');
  if(!knownIds.has(course)||!realDate(params.get('date'))||!['1','2','3','4'].includes(params.get('players')))return null;
  const from=params.get('from')??clockValue(DEFAULT_WINDOW.from),to=params.get('to')??clockValue(DEFAULT_WINDOW.to);
  const start=timeMinutes(from),end=timeMinutes(to),time=params.get('time');
  if(start===null||end===null||start>end||(time!==null&&(!/^\d{1,4}$/.test(time)||Number(time)>1439)))return null;
  return {course,date:params.get('date'),players:Number(params.get('players')),window:{from:start,to:end},time:time===null?null:Number(time)};
}
export function roundUrl(base,{course,date,players,window=DEFAULT_WINDOW,time=null}){
  if(!/^[a-z0-9-]+$/.test(course)||!realDate(date)||![1,2,3,4].includes(players)||timeMinutes(clockValue(window.from))===null||timeMinutes(clockValue(window.to))===null||window.from>window.to||time!==null&&(!Number.isInteger(time)||time<0||time>1439))throw new Error('Invalid round');
  const url=new URL(base);url.search='';url.hash='';
  const params=new URLSearchParams({round:course,date,players:String(players),from:clockValue(window.from),to:clockValue(window.to)});
  if(time!==null)params.set('time',String(time));url.hash=params.toString();return url.href;
}
export function roundShareText(course,date,players,time){return `${course.name} · ${date}${time===null?'':` · ${timeLabel(time)} ET`} · ${players} ${players===1?'player':'players'}. Availability must be confirmed in the booking portal.`;}
export function preferredResult(state){return (state?.state==='ready'||state?.state==='loading')&&Number.isFinite(state.preferred)&&state.preferred>0;}
