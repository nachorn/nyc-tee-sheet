import {readFile,readdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const html=await readFile('dist/index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))await access(path.join('dist',match[1]));
for(const id of ['play-date','players','trip-origin','all-view','favorites-view','course-list','course-count','date-hint','results-note','favorites-count','save-announcement','matches-only','course-holes','course-transport','match-message','portal-fallbacks','booking-travel','share-round','share-link'])if(!html.includes(`id="${id}"`))throw new Error(`Missing control: ${id}`);
for(const file of await readdir('dist'))if(file.endsWith('.js')){const result=spawnSync(process.execPath,['--check',`dist/${file}`],{encoding:'utf8'});if(result.status)throw new Error(result.stderr);}
for(const file of ['dist/app.js','dist/index.html']){const body=await readFile(file,'utf8');if(/455\s+park/i.test(body))throw new Error('Personal address must not be in public source');}
const css=await readFile('dist/styles.css','utf8');let balance=0;for(const c of css){if(c==='{')balance++;if(c==='}')balance--;if(balance<0)throw new Error('CSS braces');}if(balance)throw new Error('CSS braces');
console.log('Static entrypoints, JavaScript, controls, styles, and personal-address isolation checked.');
