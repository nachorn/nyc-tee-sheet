import {shiftDate,shortDate} from './booking.js';

const MINUTE=60000;
const formatter=new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
const encoder=new TextEncoder();

function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const instant=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(instant.getTime())&&instant.toISOString().slice(0,10)===value;
}
function wallTime(instant){
  const parts=Object.fromEntries(formatter.formatToParts(instant).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`;
}
function releaseInstant(date,minutes){
  const wall=Date.parse(`${date}T00:00:00Z`)+minutes*MINUTE;
  // Probe both sides of a possible DST transition, then verify each candidate.
  // A repeated fall time uses its first occurrence; a nonexistent spring time
  // has no confirmed release instant, so no reminder is offered.
  const offsets=new Set([-36,-12,0,12,36].map(hours=>{
    const probe=wall+hours*60*MINUTE;
    return Date.parse(wallTime(new Date(probe)))-probe;
  }));
  const candidates=[...offsets].map(offset=>wall-offset)
    .filter(candidate=>Date.parse(wallTime(new Date(candidate)))===wall);
  return candidates.length?new Date(Math.min(...candidates)):null;
}
function bookingUrl(value){
  if(typeof value!=='string'||/[\r\n\u0000]/.test(value))return null;
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}
}

/** Build a 15-minute calendar event at a known, future booking release. */
export function bookingReminder(course,playDate,now=new Date()){
  if(!course||course.conflict||course.walkup||course.closed||!validDate(playDate)
    ||!(now instanceof Date)||!Number.isFinite(now.getTime())
    ||!Number.isInteger(course.days)||course.days<0
    ||!Number.isInteger(course.release?.minutes)||course.release.minutes<0||course.release.minutes>=1440)return null;
  if(course.dateNotices?.some(notice=>notice.closed&&playDate>=notice.from&&playDate<=notice.to))return null;
  const url=bookingUrl(course.booking);if(!url)return null;
  let opening;
  try{opening=shiftDate(playDate,-course.days);}catch{return null;}
  if(!validDate(opening))return null;
  const start=releaseInstant(opening,course.release.minutes);
  if(!start||start.getTime()<=now.getTime())return null;
  const end=new Date(start.getTime()+15*MINUTE);
  const clock=`${String(Math.floor(course.release.minutes/60)).padStart(2,'0')}:${String(course.release.minutes%60).padStart(2,'0')}`;
  return {
    start,end,
    title:`Book ${course.name} · play ${shortDate(playDate)}`,
    description:[
      `Reserve a tee time at ${course.name} for ${playDate}.`,
      `Booking opens ${opening} at ${clock} New York time.`,
      course.windowAudience?`Booking category: ${course.windowAudience}.`:'',
      course.rules?.[0]?`Booking rule: ${course.rules[0]}`:'',
      `Open the official booking portal: ${url}`,
      'This calendar event is a booking reminder. Complete your reservation in the course portal.',
    ].filter(Boolean).join('\n'),
    url,
  };
}

function utc(value){
  if(!(value instanceof Date)||!Number.isFinite(value.getTime())||value.getUTCFullYear()<1||value.getUTCFullYear()>9999)throw new TypeError('Calendar dates must be valid Date objects.');
  return value.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}
function text(value){
  return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'')
    .replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
}
function fold(line){
  const lines=[];let current='',bytes=0;
  for(const character of line){
    const length=encoder.encode(character).length;
    if(bytes+length>75){lines.push(current);current=' ';bytes=1;}
    current+=character;bytes+=length;
  }
  lines.push(current);return lines.join('\r\n');
}
function uid(reminder,start){
  // Stable identity keeps repeat downloads of the same release identifiable.
  let hash=0xcbf29ce484222325n;
  for(const byte of encoder.encode(`${reminder.url}\n${reminder.title}`))hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
  return `${start}-${hash.toString(16).padStart(16,'0')}@nyc-tee-sheet.local`;
}

/** Serialize an importable RFC 5545 calendar. No accounts or calendar writes. */
export function reminderIcs(reminder,now=new Date()){
  if(!reminder)throw new TypeError('A booking reminder is required.');
  const start=utc(reminder.start),end=utc(reminder.end),stamp=utc(now),url=bookingUrl(reminder.url);
  if(reminder.end<=reminder.start||!url)throw new TypeError('A reminder needs an end after its start and a valid booking URL.');
  // RFC 5545 sections 3.1, 3.3.11 and 3.6.1: CRLF, UTF-8 byte folding,
  // TEXT escaping, and required event metadata. URL is a URI, not TEXT.
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NYC Tee Sheet//Booking reminders//EN','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',`UID:${uid(reminder,start)}`,`DTSTAMP:${stamp}`,`DTSTART:${start}`,`DTEND:${end}`,
    `SUMMARY:${text(reminder.title)}`,`DESCRIPTION:${text(reminder.description)}`,`URL:${url}`,'TRANSP:TRANSPARENT',
    'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0S',`DESCRIPTION:${text(reminder.title)}`,'END:VALARM',
    'END:VEVENT','END:VCALENDAR',
  ].map(fold).join('\r\n')+'\r\n';
}
