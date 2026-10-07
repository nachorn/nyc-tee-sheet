import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{dateInRange} from '../worker/index.js';

test('worker range follows New York midnight and includes the entire 31st day',()=>{
  const beforeMidnight=new Date('2026-10-08T03:59:59Z');
  assert.equal(dateInRange('2026-10-06',beforeMidnight),false);
  assert.equal(dateInRange('2026-10-07',beforeMidnight),true);
  assert.equal(dateInRange('2026-11-07',beforeMidnight),true);
  assert.equal(dateInRange('2026-11-08',beforeMidnight),false);
  const midnight=new Date('2026-10-08T04:00:00Z');
  assert.equal(dateInRange('2026-10-07',midnight),false);
  assert.equal(dateInRange('2026-10-08',midnight),true);
  assert.equal(dateInRange('2026-11-08',midnight),true);
  assert.equal(dateInRange('2026-11-09',midnight),false);
});

test('worker date range remains calendar-based across DST and year boundaries',()=>{
  for(const [instant,today,lastDay,nextDay] of [
    ['2026-03-08T06:59:59Z','2026-03-08','2026-04-08','2026-04-09'],
    ['2026-03-08T07:00:00Z','2026-03-08','2026-04-08','2026-04-09'],
    ['2026-11-01T05:59:59Z','2026-11-01','2026-12-02','2026-12-03'],
    ['2026-11-01T06:00:00Z','2026-11-01','2026-12-02','2026-12-03'],
    ['2026-01-01T04:59:59Z','2025-12-31','2026-01-31','2026-02-01'],
  ]){
    const now=new Date(instant);
    assert.equal(dateInRange(today,now),true,instant);
    assert.equal(dateInRange(lastDay,now),true,instant);
    assert.equal(dateInRange(nextDay,now),false,instant);
  }
  assert.equal(dateInRange('2026-02-30',new Date('2026-02-01T12:00:00Z')),false);
});

test('worker rejects out-of-range dates before fetching and accepts both calendar endpoints',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-08T03:30:00Z')});
  const upstream=t.mock.method(globalThis,'fetch',async()=>new Response('[]',{headers:{'Content-Type':'application/json'}}));
  const origin='https://nachorn.github.io';
  const request=date=>new Request(`https://example.com/api/tee-times?course=lido&date=${date}`,{headers:{Origin:origin}});
  for(const date of ['2026-10-06','2026-11-08']){
    const response=await worker.fetch(request(date),{ALLOWED_ORIGIN:origin});
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/31 days in New York time/);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  }
  assert.equal(upstream.mock.callCount(),0);
  for(const date of ['2026-10-07','2026-11-07']){
    const response=await worker.fetch(request(date),{ALLOWED_ORIGIN:origin});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.date,date);
    assert.deepEqual(body.times,[]);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  }
  assert.equal(upstream.mock.callCount(),2);
});
