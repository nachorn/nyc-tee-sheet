import test from 'node:test';
import assert from 'node:assert/strict';
import {timeMinutes,windowLabel,preferredTime,quickDate,liveDateSupported,filterCourses,sortCourses} from '../dist/explore.js';
import {normalizeTimes,normalizeForeup} from '../dist/live.js';
import {dateInRange} from '../worker/index.js';

const courses=Object.freeze([
  {id:'alpha',name:'Alpha',place:'Bronx',region:'NYC',live:{},travel:{mode:'Subway',station:'Woodlawn'}},
  {id:'beta',name:'Beta',place:'Yonkers',region:'Westchester',travel:{mode:'Metro-North',station:'Fleetwood'}},
  {id:'cedar',name:'Cedar',place:'Queens',region:'NYC',live:{},travel:{mode:'LIRR',station:'Bayside'}},
  {id:'delta',name:'Delta',place:'Yonkers',region:'Westchester',live:{},travel:{mode:'Metro-North',station:'Crestwood'}},
]);
const ids=items=>items.map(item=>item.id);
const favorites=new Set(['beta','delta']);

test('course filters combine favorites, region and feed support without hiding the source list',()=>{
  assert.deepEqual(ids(filterCourses(courses,{favoritesOnly:true,favorites})),['beta','delta']);
  assert.deepEqual(ids(filterCourses(courses,{favoritesOnly:true,favorites,region:'Westchester',liveOnly:true})),['delta']);
  assert.deepEqual(ids(filterCourses(courses,{favoritesOnly:true,favorites,region:'NYC'})),[]);
  assert.equal(courses.length,4);
});

test('search matches every case-insensitive term across course and travel fields',()=>{
  assert.deepEqual(ids(filterCourses(courses,{query:'  YONKERS   metro-NORTH  '})),['beta','delta']);
  assert.deepEqual(ids(filterCourses(courses,{query:'westchester fleetwood'})),['beta']);
  assert.deepEqual(ids(filterCourses(courses,{query:'Queens Woodlawn'})),[]);
  assert.deepEqual(ids(filterCourses(courses,{query:'  '})),ids(courses));
});

test('sorting prioritizes real matches, then favorites and stable course order',()=>{
  assert.deepEqual(ids(sortCourses(courses,'picks',favorites)),['beta','delta','alpha','cedar']);
  assert.deepEqual(ids(sortCourses([...courses].reverse(),'name',favorites)),['alpha','beta','cedar','delta']);
  const availability=new Map([
    ['alpha',{state:'ready',preferred:2}],
    ['beta',{state:'portal'}],
    ['cedar',{state:'ready',preferred:5}],
    ['delta',{state:'ready',preferred:0}],
  ]);
  assert.deepEqual(ids(sortCourses(courses,'matches',favorites,availability)),['cedar','alpha','delta','beta']);
  availability.set('beta',{state:'ready',preferred:2});
  availability.set('cedar',{state:'loading'});
  availability.set('delta',{state:'error'});
  assert.deepEqual(ids(sortCourses(courses,'matches',favorites,availability)),['beta','alpha','delta','cedar']);
  assert.deepEqual(ids(courses),['alpha','beta','cedar','delta']);
});

test('custom preferred windows include both endpoints and parse valid clock times only',()=>{
  assert.equal(timeMinutes('00:00'),0);
  assert.equal(timeMinutes('23:59'),1439);
  for(const value of ['24:00','12:60','9:00','-1:00','',undefined])assert.equal(timeMinutes(value),null);
  const window={from:690,to:735};
  assert.equal(windowLabel(window),'11:30 AM–12:15 PM');
  assert.deepEqual([689,690,735,736].map(minutes=>preferredTime(minutes,window)),[false,true,true,false]);
  assert.equal(preferredTime(720,{from:720,to:720}),true);
});

test('quick dates include the current weekend day and roll across month and year boundaries',()=>{
  assert.equal(quickDate('today','2026-10-10'),'2026-10-10');
  assert.equal(quickDate('saturday','2026-10-10'),'2026-10-10');
  assert.equal(quickDate('sunday','2026-10-10'),'2026-10-11');
  assert.equal(quickDate('sunday','2026-10-11'),'2026-10-11');
  assert.equal(quickDate('saturday','2026-10-11'),'2026-10-17');
  assert.equal(quickDate('tomorrow','2026-12-31'),'2027-01-01');
  assert.equal(quickDate('saturday','2026-12-31'),'2027-01-02');
});

test('frontend and worker live-date limits agree across New York midnight',()=>{
  for(const instant of ['2026-10-08T03:59:59Z','2026-10-08T04:00:00Z']){
    const now=new Date(instant);
    for(const date of ['2026-10-06','2026-10-07','2026-10-08','2026-11-07','2026-11-08','2026-11-09']){
      assert.equal(liveDateSupported(date,now),dateInRange(date,now),`${instant}: ${date}`);
    }
  }
  assert.equal(liveDateSupported('2026-10-07',new Date('2026-10-08T03:59:59Z')),true);
  assert.equal(liveDateSupported('2026-11-07',new Date('2026-10-08T03:59:59Z')),true);
  assert.equal(liveDateSupported('2026-11-08',new Date('2026-10-08T03:59:59Z')),false);
});

test('live-date range rejects malformed and impossible dates',()=>{
  assert.equal(liveDateSupported('2026-10-08junk',new Date('2026-10-07T12:00:00Z')),false);
  assert.equal(liveDateSupported('2026-02-30',new Date('2026-02-28T12:00:00Z')),false);
  assert.equal(liveDateSupported('',new Date('2026-10-07T12:00:00Z')),false);
});

test('teeitup normalization honors custom windows, string party sizes and duplicate instants',()=>{
  const rate={holes:18,allowedPlayers:['2'],golfnow:{GolfFacilityId:123}};
  const payload=[{teetimes:[
    ...['15:29','15:30','16:15','16:16'].map(time=>({teetime:`2026-10-10T${time}:00Z`,rates:[rate]})),
    {teetime:'2026-10-10T11:30:00-04:00',rates:[rate]},
    {teetime:'2026-10-10T16:00:00Z',rates:[{...rate,isMemberRate:true}]},
  ]}];
  const times=normalizeTimes(payload,123,'2026-10-10',2,18,0,{from:690,to:735});
  assert.deepEqual(times.map(time=>time.minutes),[689,690,735,736]);
  assert.deepEqual(times.map(time=>time.preferred),[false,true,true,false]);
  assert.equal(normalizeTimes(payload,123,'2026-10-10',3,18,0).length,0);
});

test('foreUP normalization applies custom boundaries and deduplicates times',()=>{
  const date='2026-10-10',window={from:690,to:735};
  const times=['11:29','11:30','12:15','12:16','11:30'].map(time=>({localTime:`${date} ${time}`,holes:'18',allowedPlayers:['1','2'],remaining:'2'}));
  const result=normalizeForeup({date,times},date,2,18,new Date('2026-10-10T14:00:00Z'),window);
  assert.deepEqual(result.map(time=>time.minutes),[689,690,735,736]);
  assert.deepEqual(result.map(time=>time.preferred),[false,true,true,false]);
});

test('foreUP normalization skips malformed entries and requires valid remaining inventory',()=>{
  const date='2026-10-10';
  const valid={localTime:`${date} 11:30`,holes:18,allowedPlayers:[1,2],remaining:2};
  const malformed=[null,{},
    {...valid,localTime:`${date} 24:00`},
    {...valid,localTime:`${date} 11:60`},
    {...valid,allowedPlayers:null},
    {...valid,remaining:1},
    ...[undefined,'unknown',Infinity,NaN,2.5].map(remaining=>({...valid,localTime:`${date} 11:31`,remaining})),
    {...valid,localTime:'2026-10-11 11:30'},
    {...valid,localTime:`${date} 10:00`},
    {...valid,holes:9},
  ];
  const result=normalizeForeup({date,times:[...malformed,valid]},date,2,18,new Date('2026-10-10T14:00:00Z'));
  assert.deepEqual(result.map(time=>time.time),[valid.localTime]);
  assert.throws(()=>normalizeForeup({date,times:{}},date,2,18));
  assert.throws(()=>normalizeForeup({date:'2026-10-11',times:[]},date,2,18));
});
