const base='https://nyc-tee-sheet-api.nacho-rn-2000.workers.dev';
for(const course of ['lido','weequahic']){
  const response=await fetch(`${base}/api/tee-times?course=${course}&date=2026-09-12`,{headers:{Origin:'https://nachorn.github.io'}});
  const body=await response.json();
  console.log(JSON.stringify({course,status:response.status,cors:response.headers.get('access-control-allow-origin'),count:body.times?.length,error:body.error}));
  if(!response.ok||!Array.isArray(body.times)||response.headers.get('access-control-allow-origin')!=='https://nachorn.github.io')process.exitCode=1;
}
