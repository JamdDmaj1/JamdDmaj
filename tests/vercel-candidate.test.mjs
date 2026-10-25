import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateRouting,candidateEnvironmentNames} from '../scripts/build-vercel-candidate.mjs';
test('prebuilt candidate preserves existing security headers without adding schedules or writable routes',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')),out=candidateRouting(config);
 assert.equal(out.version,3);assert.equal(out.crons,undefined);assert.equal(out.routes[0].headers['X-Frame-Options'],'DENY');assert.deepEqual(out.routes.at(-1),{handle:'filesystem'});
 assert.equal(out.routes[1].src,'/wallet-web(.*)');assert.equal(out.routes[1].headers['Cache-Control'],'no-store');assert.equal(out.routes[1].headers['Referrer-Policy'],'no-referrer');
 for(const extra of [{crons:[{path:'/api/pro-cron'}]},{rewrites:[]},{outputDirectory:'.'},{buildCommand:'npm run unknown'}])assert.throws(()=>candidateRouting({...config,...extra}));
});
test('edge runtime variable declarations use names only, preserve runtime lookup and reject dynamic credential enumeration',()=>{
 assert.deepEqual(candidateEnvironmentNames('process.env.REDIS_TOKEN + process.env.PUBLIC_ORIGIN + process.env.REDIS_TOKEN'),['PUBLIC_ORIGIN','REDIS_TOKEN']);
 assert.throws(()=>candidateEnvironmentNames('process.env[unknown]'));
 const source=readFileSync(new URL('../scripts/build-vercel-candidate.mjs',import.meta.url),'utf8');
 assert.match(source,/\['PATH','SystemRoot','TEMP','TMP'\]/);assert.equal(source.includes('vercel env pull'),false);
 assert.match(source,/flag:'wx'/);assert.match(source,/git.*rev-parse/);assert.equal(source.includes('deploy --prod'),false);
});
