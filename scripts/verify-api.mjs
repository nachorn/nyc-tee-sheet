import {nyDate,shiftDate} from '../dist/booking.js';
import {dateInRange} from '../worker/index.js';

const base='https://nyc-tee-sheet-api.nacho-rn-2000.workers.dev';
const date=process.argv[2]||shiftDate(nyDate(),1);
if(!dateInRange(date))throw new Error('Usage: node scripts/verify-api.mjs [YYYY-MM-DD]. Choose today through the next 31 days in New York time.');
for(const course of ['lido','weequahic']){
  const response=await fetch(`${base}/api/tee-times?course=${course}&date=${date}`,{headers:{Origin:'https://nachorn.github.io'}});
  const body=await response.json();
  console.log(JSON.stringify({course,date,status:response.status,cors:response.headers.get('access-control-allow-origin'),count:body.times?.length,error:body.error}));
  if(!response.ok||!Array.isArray(body.times)||response.headers.get('access-control-allow-origin')!=='https://nachorn.github.io')process.exitCode=1;
}
