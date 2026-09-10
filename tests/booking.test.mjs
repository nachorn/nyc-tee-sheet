import test from 'node:test';
import assert from 'node:assert/strict';
import {nyDate,shiftDate,windowStatus} from '../dist/booking.js';
import {normalizeTimes,normalizeForeup,portalUrl} from '../dist/live.js';
import {courses,defaultFavorites} from '../dist/courses.js';
import {cleanTimes,validDate} from '../worker/index.js';

test('New York dates do not follow UTC midnight or DST offsets',()=>{
  assert.equal(nyDate(new Date('2026-09-10T02:00:00Z')),'2026-09-09');
  assert.equal(shiftDate('2026-03-09',-7),'2026-03-02');
  const c={days:7,release:{minutes:1140,label:'7:00 PM'}};
  assert.equal(windowStatus(c,'2026-09-17',new Date('2026-09-10T22:59:00Z')).kind,'waiting');
  assert.equal(windowStatus(c,'2026-09-17',new Date('2026-09-10T23:00:00Z')).kind,'open');
  assert.equal(windowStatus({days:3},'2026-09-13',new Date('2026-09-10T23:00:00Z')).kind,'unsure');
  assert.equal(windowStatus({days:14,conflict:true},'2026-09-13').kind,'unsure');
});
test('Live tee times enforce party size, hole count, facility and NY time boundaries',()=>{
  const rate={holes:18,allowedPlayers:[1,2],golfnow:{GolfFacilityId:10430}};
  const payload=[{teetimes:[
    {teetime:'2026-09-10T12:59:00Z',rates:[rate]},
    {teetime:'2026-09-10T13:00:00Z',rates:[rate]},
    {teetime:'2026-09-10T17:00:00Z',rates:[rate]},
    {teetime:'2026-09-10T17:01:00Z',rates:[rate]},
    {teetime:'2026-09-10T14:00:00Z',rates:[{...rate,holes:9}]},
    {teetime:'2026-09-10T15:00:00Z',rates:[{...rate,golfnow:{GolfFacilityId:999}}]},
  ]}];
  const slots=normalizeTimes(payload,10430,'2026-09-10',2,18,0);
  assert.equal(slots.length,4);assert.deepEqual(slots.map(s=>s.preferred),[false,true,true,false]);
  assert.equal(slots[1].label,'9:00 AM');assert.equal(slots[2].label,'1:00 PM');
  assert.equal(normalizeTimes(payload,10430,'2026-09-10',3,18,0).length,0);
  assert.throws(()=>normalizeTimes({error:true},10430,'2026-09-10',1,18,0));
  assert.throws(()=>normalizeTimes([{}],10430,'2026-09-10',1,18,0));
});
test('foreUP groups reflect actual remaining spaces and date',()=>{
  const cleaned=cleanTimes([{time:'2026-09-10 13:00',holes:18,available_spots_18:2,allowed_group_sizes:['1','2','3','4'],min:1,max:4}],'2026-09-10');
  assert.deepEqual(cleaned[0].allowedPlayers,[1,2]);
  const payload={date:'2026-09-10',times:cleaned};
  assert.equal(normalizeForeup(payload,'2026-09-10',2,18,new Date('2026-09-10T10:00:00Z'))[0].preferred,true);
  assert.equal(normalizeForeup(payload,'2026-09-10',3,18,new Date('2026-09-10T10:00:00Z')).length,0);
  assert.equal(normalizeForeup(payload,'2026-09-10',1,18,new Date('2026-09-10T18:00:00Z')).length,0);
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-09-10'),true);
});
test('Required courses and outgoing booking links stay distinct',()=>{
  assert.equal(courses.length,27);assert.equal(new Set(courses.map(c=>c.id)).size,courses.length);
  assert.deepEqual(defaultFavorites,['griffith-harris','bethpage-black','lido','middle-bay','pelham-bay','split-rock']);
  for(const id of defaultFavorites)assert.ok(courses.some(c=>c.id===id));
  const pelham=courses.find(c=>c.id==='pelham-bay');const split=courses.find(c=>c.id==='split-rock');
  assert.notEqual(portalUrl(pelham,'2026-09-10',2),portalUrl(split,'2026-09-10',2));
  assert.equal(new URL(portalUrl(pelham,'2026-09-10',2)).searchParams.get('golfers'),'2');
  for(const course of courses){assert.ok(course.rules.length&&course.sources.length&&course.travel);assert.equal(new URL(course.booking).protocol,'https:');}
});
