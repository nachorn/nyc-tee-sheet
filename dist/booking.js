export function nyDate(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=type=>parts.find(p=>p.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function shiftDate(value,days) {
  const date=new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function shortDate(value) {
  return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
}
export function windowStatus(course,date,now=new Date()) {
  const today=nyDate(now);
  if(date<today)return {kind:'unsure',text:'Choose today or a future play date.',opening:null};
  if(course.walkup)return {kind:'unsure',text:'Walk-up play · call to confirm hours.',opening:null};
  if(course.conflict)return {kind:'unsure',text:'Published rules conflict · confirm with course.',opening:null};
  if(!Number.isInteger(course.days))return {kind:'unsure',text:'Confirm booking window in the portal.',opening:null};
  const opening=shiftDate(date,-course.days);
  if(opening>today)return {kind:'waiting',text:`Booking opens ${shortDate(opening)}.`,opening};
  if(opening===today){
    if(!course.release)return {kind:'unsure',text:'Window starts today · release time unconfirmed.',opening};
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const minute=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
    if(minute<course.release.minutes)return {kind:'waiting',text:`Booking opens today at ${course.release.label}.`,opening};
  }
  return {kind:'open',text:'Within booking window · check tee times.',opening};
}
