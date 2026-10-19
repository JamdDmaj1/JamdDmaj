import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {runPerpsObserver,observerEnvironment} from '../scripts/perps-observer-worker.mjs';
const now=Date.parse('2026-10-18T12:00:00Z'),statusFile=resolve('test-observer-status.json'),feedToken='fixture-only-feed-token-123';
function response(){return Response.json({ok:true,clientFeed:true,generatedAt:new Date(now).toISOString(),executor:{livePaused:false},open:[]});}
test('observer persists readonly state, never accepts execution mode and never submits a transaction',async()=>{
 const saved=[],calls=[],report=await runPerpsObserver({feedToken,statusFile,once:true},{now:()=>now,fetchImpl:async(url,options)=>{calls.push({url,options});return response();},saveStatus:(path,value)=>saved.push({path,value}),onChange:()=>{}});
 assert.equal(report.mode,'observe');assert.equal(report.tradingEnabled,false);assert.equal(report.readyForSigning,false);assert.equal(saved[0].path,statusFile);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://www.jamddmaj.com/api/pro-client-feed');assert.equal(calls[0].options.method,'GET');
 for(const mode of ['execute','live','true'])assert.throws(()=>observerEnvironment({JAMDDMAJ_PERPS_MODE:mode}),/OBSERVER_MODE_ONLY/);
 assert.throws(()=>observerEnvironment({JAMDDMAJ_PERPS_OBSERVER_STATUS_FILE:'relative.json'}));
});
test('unchanged observations stay quiet, failures are bounded and shutdown interrupts the poll wait',async()=>{
 const controller=new AbortController(),changes=[],saved=[];let count=0;
 await runPerpsObserver({feedToken,statusFile,signal:controller.signal},{now:()=>now,fetchImpl:async()=>{if(++count===3)throw Error('private credential');return response();},
  saveStatus:(_p,v)=>saved.push(v),onChange:v=>changes.push(v),wait:async()=>{if(count===3)controller.abort();}});
 assert.equal(saved.length,3);assert.equal(changes.length,2);assert.equal(saved[2].stage,'SIGNAL_FEED_UNAVAILABLE');assert.equal(JSON.stringify(saved).includes('credential'),false);
});
test('service runs with no private wallet paths or legacy trading configuration',()=>{
 const source=readFileSync(new URL('../scripts/perps-observer-worker.mjs',import.meta.url),'utf8'),unit=readFileSync(new URL('../ops/jamddmaj-perps-observer.service',import.meta.url),'utf8');
 assert.equal(/from ['"].*(custody|executor|journal|broadcast)/.test(source),false);
 for(const line of ['DynamicUser=yes','ProtectHome=yes','ProtectSystem=strict','NoNewPrivileges=yes','MemoryMax=192M'])assert.ok(unit.includes(line));
 assert.equal(unit.includes('bitget'),false);assert.equal(unit.includes('master.key'),false);
});
