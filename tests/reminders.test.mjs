import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingReminder,reminderIcs} from '../dist/reminders.js';

const course={id:'example',name:'Example Golf',days:7,release:{minutes:1140,label:'7 PM'},booking:'https://example.com/book?players=2&date=2026-10-20',windowAudience:'VERIFIED NEW YORK STATE RESIDENT',rules:['Verified residents book 7 days ahead; visitors book 5 days ahead.']};
const early=new Date('2026-01-01T00:00:00Z');
const unfold=value=>value.replace(/\r\n[ \t]/g,'');
const property=(ics,name)=>unfold(ics).split('\r\n').find(line=>line.startsWith(`${name}:`))?.slice(name.length+1);

test('reminder is a future booking-release event with the play date and eligibility',()=>{
  const reminder=bookingReminder(course,'2026-10-20',new Date('2026-10-07T12:00:00Z'));
  assert.equal(reminder.start.toISOString(),'2026-10-13T23:00:00.000Z');
  assert.equal(reminder.end-reminder.start,15*60000);
  assert.match(reminder.title,/Book Example Golf/);
  assert.match(reminder.description,/2026-10-20/);
  assert.match(reminder.description,/VERIFIED NEW YORK STATE RESIDENT/);
  assert.match(reminder.description,/visitors book 5 days ahead/);
  assert.equal(reminder.url,course.booking);
  assert.equal(bookingReminder(course,'2026-10-20',reminder.start),null);
  assert.equal(bookingReminder(course,'2026-10-20',new Date('2026-10-13T23:01:00Z')),null);
});

test('release conversion uses the opening date offset across spring and fall DST',()=>{
  const morning={...course,release:{minutes:540}};
  for(const [playDate,expected] of [
    ['2026-03-14','2026-03-07T14:00:00.000Z'],
    ['2026-03-15','2026-03-08T13:00:00.000Z'],
    ['2026-11-07','2026-10-31T13:00:00.000Z'],
    ['2026-11-08','2026-11-01T14:00:00.000Z'],
  ])assert.equal(bookingReminder(morning,playDate,early).start.toISOString(),expected);
});

test('midnight releases and DST gaps or repeated times are handled explicitly',()=>{
  assert.equal(bookingReminder({...course,release:{minutes:0}},'2026-03-15',early).start.toISOString(),'2026-03-08T05:00:00.000Z');
  assert.equal(bookingReminder({...course,release:{minutes:0}},'2026-11-08',early).start.toISOString(),'2026-11-01T04:00:00.000Z');
  assert.equal(bookingReminder({...course,release:{minutes:150}},'2026-03-15',early),null);
  assert.equal(bookingReminder({...course,release:{minutes:90}},'2026-11-08',early).start.toISOString(),'2026-11-01T05:30:00.000Z');
  // Once the first 1:30 has passed, the repeated clock hour is not a new release.
  assert.equal(bookingReminder({...course,release:{minutes:90}},'2026-11-08',new Date('2026-11-01T06:00:00Z')),null);
});

test('unknown, conflicting, walk-up and closed-date windows do not produce reminders',()=>{
  for(const change of [
    {days:null},{days:-1},{days:1.5},{release:null},{release:{minutes:-1}},
    {release:{minutes:1440}},{release:{minutes:'540'}},{conflict:true},{walkup:true},{closed:true},
    {dateNotices:[{from:'2026-10-19',to:'2026-10-21',closed:true}]},
  ])assert.equal(bookingReminder({...course,...change},'2026-10-20',early),null);
  assert.ok(bookingReminder({...course,dateNotices:[{from:'2026-10-20',to:'2026-10-20',text:'Aeration notice'}]},'2026-10-20',early));
  assert.ok(bookingReminder({...course,dateNotices:[{from:'2026-10-19',to:'2026-10-19',closed:true}]},'2026-10-20',early));
  for(const date of ['2026-02-30','2026-10-20junk',''])assert.equal(bookingReminder(course,date,early),null);
  assert.equal(bookingReminder(course,'2026-10-20',new Date('invalid')),null);
  assert.equal(bookingReminder({...course,booking:'javascript:alert(1)'},'2026-10-20',early),null);
});

test('ICS carries UTC dates, stable unique event identity and an opening-time display alert',()=>{
  const reminder=bookingReminder(course,'2026-10-20',early),stamp=new Date('2026-10-07T14:15:16Z');
  const ics=reminderIcs(reminder,stamp);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  assert.equal(property(ics,'DTSTAMP'),'20261007T141516Z');
  assert.equal(property(ics,'DTSTART'),'20261013T230000Z');
  assert.equal(property(ics,'DTEND'),'20261013T231500Z');
  assert.match(property(ics,'UID'),/@nyc-tee-sheet\.local$/);
  assert.equal(property(ics,'UID'),property(reminderIcs(reminder,new Date('2026-10-08T12:00:00Z')),'UID'));
  assert.notEqual(property(ics,'UID'),property(reminderIcs({...reminder,title:'Another course'},stamp),'UID'));
  assert.match(ics,/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0S\r\n/);
  assert.equal(ics.replace(/\r\n/g,'').includes('\n'),false);
  assert.equal(ics.replace(/\r\n/g,'').includes('\r'),false);
});

test('ICS escapes text delimiters and newlines while keeping URL URI syntax',()=>{
  const reminder=bookingReminder(course,'2026-10-20',early);
  reminder.title='Golf, friends; \\ tee time: now';
  reminder.description='Line one\r\nLine two\nLine three\rLine four; comma, slash\\';
  reminder.url='https://example.com/book?a=1,2;b=3';
  const ics=reminderIcs(reminder,early);
  assert.equal(property(ics,'SUMMARY'),'Golf\\, friends\\; \\\\ tee time: now');
  assert.equal(property(ics,'DESCRIPTION'),'Line one\\nLine two\\nLine three\\nLine four\\; comma\\, slash\\\\');
  assert.equal(property(ics,'URL'),reminder.url);
  assert.throws(()=>reminderIcs({...reminder,url:'https://example.com/\r\nATTENDEE:bad'},early),TypeError);
  assert.throws(()=>reminderIcs({...reminder,end:reminder.start},early),TypeError);
});

test('ICS folds at 75 UTF-8 octets without splitting multibyte characters',()=>{
  const reminder=bookingReminder(course,'2026-10-20',early);
  reminder.title='Golf 🏌️ 東京 café '.repeat(12);
  reminder.description='é⛳😀'.repeat(70);
  const ics=reminderIcs(reminder,early),encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  assert.ok(ics.includes('\r\n '));
  for(const line of ics.split('\r\n')){
    assert.ok(encoder.encode(line).length<=75,`Oversized line: ${line}`);
    assert.equal(decoder.decode(encoder.encode(line)),line);
  }
  assert.equal(property(ics,'SUMMARY'),reminder.title);
  assert.equal(property(ics,'DESCRIPTION'),reminder.description);
});
