import test from 'node:test';
import assert from 'node:assert/strict';
import {roundUrl,sharedRound,preferredResult} from '../dist/round.js';
import {DEFAULT_WINDOW,filterCourses} from '../dist/explore.js';

const knownIds=new Set(['bethpage-black','lido','middle-bay']);
const round={course:'bethpage-black',date:'2026-10-10',players:3,window:{from:615,to:855},time:645};
const validHash=()=>new URL(roundUrl('https://example.test/golf/',round)).hash;
function changedHash(name,value){
  const params=new URLSearchParams(validHash().slice(1));
  if(value===null)params.delete(name);else params.set(name,value);
  return '#'+params.toString();
}

test('shared links strip existing query and legacy origin hash and exclude private fields',()=>{
  const url=new URL(roundUrl('https://example.test/golf/?origin=Private+Address&search=private-query#start=Private+Station',{
    ...round,origin:'123 Private Street',search:'private course query',query:'private search',favorites:['lido'],
  }));
  assert.equal(url.origin,'https://example.test');
  assert.equal(url.pathname,'/golf/');
  assert.equal(url.search,'');
  const params=new URLSearchParams(url.hash.slice(1));
  assert.deepEqual([...params.keys()].sort(),['date','from','players','round','time','to']);
  assert.doesNotMatch(decodeURIComponent(url.href),/private|origin|start|search|favorites/i);
});

test('known course, date, party, custom window and selected time round-trip exactly',()=>{
  const url=roundUrl('https://example.test/golf/',round);
  assert.deepEqual(sharedRound(new URL(url).hash,knownIds),round);
  assert.deepEqual(sharedRound(new URL(url).hash.slice(1),knownIds),round);
});

test('omitted window uses defaults and an unselected time remains null',()=>{
  const input={course:'lido',date:'2028-02-29',players:1};
  const result={...input,window:DEFAULT_WINDOW,time:null};
  const url=new URL(roundUrl('https://example.test/',input));
  assert.equal(new URLSearchParams(url.hash.slice(1)).has('time'),false);
  assert.deepEqual(sharedRound(url.hash,knownIds),result);
  assert.deepEqual(sharedRound('#round=lido&date=2028-02-29&players=1',knownIds),result);
});

test('whole-day clock boundaries and a single-minute preferred window are valid',()=>{
  for(const time of [0,1439]){
    const input={...round,window:{from:time,to:time},time};
    assert.deepEqual(sharedRound(new URL(roundUrl('https://example.test/',input)).hash,knownIds),input);
  }
});

test('shared rounds reject unknown courses, missing required fields and invalid party sizes',()=>{
  for(const course of ['unknown-course','Bethpage-Black','',null])assert.equal(sharedRound(changedHash('round',course),knownIds),null,`course ${course}`);
  for(const players of ['0','5','2.5','02','two','',null])assert.equal(sharedRound(changedHash('players',players),knownIds),null,`players ${players}`);
  assert.equal(sharedRound(changedHash('date',null),knownIds),null);
  assert.equal(sharedRound('',knownIds),null);
});

test('both shared-link parsing and generation reject malformed or impossible dates',()=>{
  for(const date of ['2026-02-29','2026-02-30','2026-04-31','2026-13-01','2026-00-10','2026-10-00','2026-1-10','2026-10-10junk','']){
    assert.equal(sharedRound(changedHash('date',date),knownIds),null,date);
    assert.throws(()=>roundUrl('https://example.test/',{...round,date}),/Invalid round/,date);
  }
});

test('shared rounds reject malformed, out-of-range or reversed windows',()=>{
  for(const [field,value] of [['from','9:00'],['from','24:00'],['from','12:60'],['from',''],['to','-1:00'],['to','25:00'],['to','10:00']]){
    assert.equal(sharedRound(changedHash(field,value),knownIds),null,`${field}=${value}`);
  }
  for(const window of [{from:-1,to:780},{from:540,to:1440},{from:780,to:540},{from:540.5,to:780},{from:NaN,to:780},{from:540,to:Infinity}]){
    assert.throws(()=>roundUrl('https://example.test/',{...round,window}),/Invalid round/);
  }
});

test('shared rounds reject invalid selected times rather than coercing them',()=>{
  for(const time of ['-1','1440','99999','615.5','10:15','NaN','Infinity','', ' 615 ']){
    assert.equal(sharedRound(changedHash('time',time),knownIds),null,time);
  }
  for(const time of [-1,1440,615.5,NaN,Infinity,'615']){
    assert.throws(()=>roundUrl('https://example.test/',{...round,time}),/Invalid round/);
  }
});

test('generation rejects invalid party values and unsafe course identifiers',()=>{
  for(const players of [0,5,2.5,NaN,'2',null])assert.throws(()=>roundUrl('https://example.test/',{...round,players}),/Invalid round/);
  for(const course of ['', '../lido','https://example.test','lido&start=address','Lido'])assert.throws(()=>roundUrl('https://example.test/',{...round,course}),/Invalid round/);
});

const courses=Object.freeze([
  {id:'lirr18',name:'East Course',place:'Long Island',region:'Long Island',holes:18,live:{},travel:{mode:'LIRR',station:'East Station'}},
  {id:'metro18',name:'North Course',place:'Westchester',region:'Westchester',holes:18,travel:{mode:'Metro-North',station:'North Station'}},
  {id:'njt18',name:'Newark Course',place:'Newark',region:'New Jersey',holes:18,live:{},travel:{mode:'NJT',station:'Newark Penn'}},
  {id:'path9',name:'Jersey Course',place:'Jersey City',region:'New Jersey',holes:9,travel:{mode:'PATH',station:'Journal Square'}},
  {id:'subway9',name:'Bronx Course',place:'Bronx',region:'NYC',holes:9,live:{},travel:{mode:'Subway',station:'Woodlawn'}},
  {id:'ferry18',name:'Island Course',place:'Staten Island',region:'NYC',holes:18,travel:{mode:'Ferry + taxi',station:'St. George'}},
  {id:'unknown18',name:'Unknown Course',place:'NYC',region:'NYC',holes:18},
]);
const ids=items=>items.map(course=>course.id);

test('course-size filters distinguish nine- and eighteen-hole courses without mutating the list',()=>{
  assert.deepEqual(ids(filterCourses(courses,{holes:'9'})),['path9','subway9']);
  assert.deepEqual(ids(filterCourses(courses,{holes:18})),['lirr18','metro18','njt18','ferry18','unknown18']);
  assert.deepEqual(ids(filterCourses(courses,{holes:'All'})),ids(courses));
  assert.equal(courses.length,7);
});

test('New Jersey transit groups NJT and PATH while other rail modes remain distinct',()=>{
  assert.deepEqual(ids(filterCourses(courses,{transport:'New Jersey'})),['njt18','path9']);
  assert.deepEqual(ids(filterCourses(courses,{transport:'LIRR'})),['lirr18']);
  assert.deepEqual(ids(filterCourses(courses,{transport:'Metro-North'})),['metro18']);
  assert.deepEqual(ids(filterCourses(courses,{transport:'Subway'})),['subway9']);
  assert.deepEqual(ids(filterCourses(courses,{transport:'Ferry'})),['ferry18']);
  assert.deepEqual(ids(filterCourses(courses,{transport:'All'})),ids(courses));
});

test('size and travel filters combine with region, favorites, search and feed availability',()=>{
  const options={holes:'18',transport:'New Jersey',region:'New Jersey',favoritesOnly:true,favorites:new Set(['njt18','path9','lirr18']),query:'newark penn',liveOnly:true};
  assert.deepEqual(ids(filterCourses(courses,options)),['njt18']);
  assert.deepEqual(ids(filterCourses(courses,{...options,holes:'9'})),[]);
  assert.deepEqual(ids(filterCourses(courses,{...options,region:'NYC'})),[]);
});

test('preferred matches stay visible while refreshing the last ready result',()=>{
  const ready={state:'ready',preferred:3,total:5,checkedAt:123};
  assert.equal(preferredResult(ready),true);
  assert.equal(preferredResult({...ready,state:'loading'}),true);
  assert.equal(preferredResult({...ready,state:'ready',preferred:1}),true);
});

test('preferred-only results exclude errors, empty feeds and unchecked courses',()=>{
  for(const state of [undefined,null,{},
    {state:'idle'},{state:'loading'},{state:'portal'},{state:'future'},
    {state:'error',preferred:3},{state:'idle',preferred:3},
    {state:'ready',preferred:0},{state:'loading',preferred:0},
    {state:'ready',preferred:-1},{state:'ready',preferred:'3'},
    {state:'ready',preferred:NaN},{state:'ready',preferred:Infinity},
  ])assert.equal(preferredResult(state),false,JSON.stringify(state));
});
