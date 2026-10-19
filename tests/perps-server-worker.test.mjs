import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createServerPerpsWorker} from '../lib/perps-server-worker.js';
const accounts=[1,2,3,4,5].map(n=>({walletAddress:bs58.encode(Buffer.alloc(32,n)),ownerAccountHash:String(n).repeat(64)})).sort((a,b)=>a.walletAddress<b.walletAddress?-1:1);
function fixture(options={}){
 const calls=[],reports=[],queries=[];
 const controls={listForWorker({afterWallet,limit}){queries.push({afterWallet,limit});return accounts.filter(row=>afterWallet===null||row.walletAddress>afterWallet).slice(0,limit);}};
 const executor={async runOnce(args){calls.push({kind:'execute',...args});return {stage:'AUTOMATION_INACTIVE'};},async reconcileOnly(args){calls.push({kind:'maintenance',...args});return {stage:'RECONCILIATION_ONLY'};}};
 return {calls,reports,queries,controls,executor,worker:createServerPerpsWorker({controls,executor,saveStatus:report=>reports.push(report),...options})};
}
test('default worker is maintenance-only, paced and fair across bounded private inventory pages',async()=>{
 const abort=new AbortController();let ticks=0;
 const f=fixture({batchSize:2,wait:async ms=>{assert.equal(ms,15000);if(++ticks===3)abort.abort();}});
 const result=await f.worker.run({signal:abort.signal});assert.equal(result.stage,'WORKER_STOPPED');
 assert.deepEqual(f.calls.map(row=>row.walletAddress),accounts.map(row=>row.walletAddress));assert.ok(f.calls.every(row=>row.kind==='maintenance'));
 assert.equal(f.queries.length,3);assert.equal(f.reports.filter(row=>row.stage==='WORKER_CYCLE_COMPLETE').length,3);
 assert.equal(JSON.stringify(f.reports).includes(accounts[0].ownerAccountHash),false);assert.equal(JSON.stringify(f.reports).includes(accounts[0].walletAddress),false);
});
test('an empty inventory sweep waits instead of spinning and explicit execution mode only dispatches existing controls',async()=>{
 const f=fixture({mode:'execute',batchSize:50});await f.worker.run({once:true});assert.equal(f.calls.length,5);assert.ok(f.calls.every(row=>row.kind==='execute'));
 const abort=new AbortController();let reads=0,waits=0;
 const worker=createServerPerpsWorker({controls:{listForWorker:()=>{reads++;return [];}},executor:f.executor,saveStatus:()=>{},wait:async()=>{waits++;abort.abort();}});
 await worker.run({signal:abort.signal});assert.equal(reads,1);assert.equal(waits,1);
});
test('one failed account does not starve others or leak upstream errors into reports',async()=>{
 const f=fixture({mode:'execute'});let attempts=0;
 f.executor.runOnce=async()=>{if(++attempts===1)throw Error('private credential must not appear');return {stage:'BROADCAST_UNKNOWN'};};
 const report=await f.worker.run({once:true});assert.equal(attempts,5);assert.deepEqual(report.results,{EXECUTION_BLOCKED:1,BROADCAST_UNKNOWN:4});assert.equal(JSON.stringify(f.reports).includes('credential'),false);
});
test('shutdown drains the current cycle and cannot dispatch another wallet or start an overlapping run',async()=>{
 const abort=new AbortController(),f=fixture({mode:'execute'});let release,started;
 const began=new Promise(resolve=>{started=resolve;});f.executor.runOnce=async args=>{f.calls.push(args);started();await new Promise(resolve=>{release=resolve;});return {stage:'BROADCAST_ACKNOWLEDGED'};};
 const running=f.worker.run({signal:abort.signal});await began;assert.equal(f.worker.run({once:true}),running);
 abort.abort();let ended=false;running.then(()=>{ended=true;});await Promise.resolve();assert.equal(ended,false);assert.equal(f.calls.length,1);
 release();const result=await running;assert.equal(result.stage,'WORKER_STOPPED');assert.equal(result.results.BROADCAST_ACKNOWLEDGED,1);assert.equal(f.calls.length,1);
});
test('worker configuration and the entire inventory page are checked before dispatch',async()=>{
 for(const options of [{mode:'auto'},{pollMs:1},{batchSize:51},{batchSize:0},{saveStatus:null}])assert.throws(()=>fixture(options));
 for(const page of [[accounts[1],accounts[0]],[accounts[0],accounts[0]],[accounts[0],{...accounts[1],ownerAccountHash:'unverified'}]]){
  const f=fixture();f.controls.listForWorker=()=>page;await assert.rejects(f.worker.run({once:true}),/PERPS_WORKER_UNAVAILABLE/);assert.equal(f.calls.length,0);assert.equal(f.reports.at(-1).stage,'WORKER_FAILED');
 }
});
test('failed status persistence stops the worker without making a health claim or replaying that cycle',async()=>{
 const f=fixture({batchSize:1,saveStatus:()=>{throw Error('disk full');}});
 await assert.rejects(f.worker.run({once:true}),/PERPS_WORKER_UNAVAILABLE/);assert.equal(f.calls.length,1);
});

test('synchronous dependency reentry sees the same published single-flight run',async()=>{
 const f=fixture();let first;
 f.executor.reconcileOnly=async()=>{assert.equal(f.worker.run({once:true}),first);return {stage:'RECONCILIATION_ONLY'};};
 first=f.worker.run({once:true});assert.equal((await first).checked,5);
});
