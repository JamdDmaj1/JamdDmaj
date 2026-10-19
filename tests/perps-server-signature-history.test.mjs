import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readServerPerpsSignatureHistory,requireFreshServerPerpsSignatureHistory} from '../lib/perps-server-signature-history.js';
import {deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
const walletAddress=bs58.encode(Buffer.alloc(32,17)),now=Date.parse('2026-10-18T12:00:00Z'),genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const signature=n=>bs58.encode(Buffer.alloc(64,n));
function row(n,slot,blockTime=now/1000-30){return {signature:signature(n),slot,blockTime,err:null,confirmationStatus:'finalized'};}
async function fixture(){
 const position=(await deriveServerPerpsIdentities({walletAddress,asset:'SOL',side:'LONG'})).position;
 const history=new Map([[walletAddress,[row(1,499999),row(2,499998),row(3,499997),row(4,68000,now/1000-172800)]],
  [position,[row(1,499999),row(4,68000,now/1000-172800)]]]);
 const calls=[],request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return genesis;
  if(method==='getSlot')return 500000;
  if(method==='getBlocks')return [68000,68001];
  if(method==='getBlockTime')return params[0]===500000?now/1000-20:now/1000-172800;
  if(method==='getFirstAvailableBlock')return 100;
  if(method==='getSignaturesForAddress'){
   const values=history.get(params[0])??[],options=params[1],start=options.before?values.findIndex(r=>r.signature===options.before)+1:0;
   return structuredClone(values.slice(start,start+options.limit));
  }
  throw Error('unexpected read');
 };
 return {history,position,calls,request,options:{request,now:()=>now,pageSize:2}};
}
test('all seven addresses are paginated through a retained pre-day boundary and duplicate transactions are counted once',async()=>{
 const f=await fixture(),proof=await readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},f.options);
 assert.equal(proof.rows.length,3);assert.equal(proof.rows[0].addresses.length,2);assert.equal(proof.coverage.length,7);
 assert.equal(proof.observedSlot,500000);assert.equal(proof.requiresTransactionAccounting,true);assert.equal(proof.lossTodayUsdcUnits,null);assert.equal(proof.tradesToday,null);assert.equal(proof.readyForSigning,false);
 const queries=f.calls.filter(c=>c.method==='getSignaturesForAddress');assert.equal(queries.filter(c=>c.params[0]===walletAddress).length,2);
 assert.ok(queries.every(c=>c.params[1].commitment==='finalized'&&c.params[1].minContextSlot===500000));
 assert.equal(requireFreshServerPerpsSignatureHistory(proof,{walletAddress,day:'2026-10-18'}),proof);
 assert.throws(()=>requireFreshServerPerpsSignatureHistory({...proof},{walletAddress,day:'2026-10-18'}));assert.ok(Object.isFrozen(proof.rows[0].addresses));
});
test('zero history requires seven explicit exhausted lists plus retained ledger coverage',async()=>{
 const f=await fixture();f.history.clear();const proof=await readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},f.options);
 assert.equal(proof.rows.length,0);assert.equal(f.calls.filter(c=>c.method==='getSignaturesForAddress').length,7);assert.equal(proof.lossTodayUsdcUnits,null);
 for(const missing of [null,undefined,{},'unavailable'])await assert.rejects(readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},{...f.options,request:async(m,p)=>m==='getSignaturesForAddress'?missing:f.request(m,p)}));
});
test('slot ordering, cursor duplicates, null timestamps and conflicting cross-address records fail',async()=>{
 for(const mutate of [
  f=>f.history.get(walletAddress)[1].slot=500001,
  f=>f.history.get(walletAddress)[1].signature=signature(1),
  f=>f.history.get(walletAddress)[1].blockTime=null,
  f=>f.history.get(walletAddress)[1].confirmationStatus='confirmed',
  f=>f.history.get(walletAddress)[1].err=undefined,
  f=>f.history.get(walletAddress)[1].signature=walletAddress,
  f=>f.history.get(f.position)[0].slot--,
  f=>f.history.get(f.position)[0].err={InstructionError:[0,'InvalidArgument']},
 ]){const f=await fixture();mutate(f);await assert.rejects(readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},f.options));}
});
test('older estimated timestamps do not truncate pagination and newer-than-anchor rows are excluded',async()=>{
 const f=await fixture();f.history.get(walletAddress).unshift(row(5,500001,now/1000-10));
 f.history.get(walletAddress)[2].blockTime=now/1000-86400;
 const proof=await readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},f.options);
 assert.deepEqual(proof.rows.map(r=>r.signature),[signature(1),signature(3)]);
 assert.equal(proof.coverage.find(c=>c.address===walletAddress).examined,5);
});
test('failed transactions remain visible and unsupported errors are not interpreted as success',async()=>{
 for(const err of [{InstructionError:[0,{Custom:42}]},'AccountNotFound']){
  const f=await fixture();f.history.get(walletAddress)[1].err=err;const proof=await readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},f.options);
  assert.equal(proof.rows[1].failed,true);
 }
});
test('pruning, skipped bounds, stale root, wrong network and changed UTC day cannot claim coverage',async()=>{
 for(const override of [
  {getFirstAvailableBlock:68001},{getBlocks:[]},{getBlocks:[67999]},{getBlocks:[68001,68000]},
  {getGenesisHash:'devnet'},{getSlot:NaN},
 ]){const f=await fixture();await assert.rejects(readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},{...f.options,request:async(m,p)=>Object.hasOwn(override,m)?override[m]:f.request(m,p)}));}
 for(const rootTime of [now/1000-121,now/1000+3,now/1000-86400]){
  const f=await fixture();await assert.rejects(readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},{...f.options,request:async(m,p)=>m==='getBlockTime'&&p[0]===500000?rootTime:f.request(m,p)}));
 }
 const f=await fixture();for(const day of ['2026-02-30','2026-10-17','2026-10-19'])await assert.rejects(readServerPerpsSignatureHistory({walletAddress,day},f.options));
});
test('request/row budgets, expiration and clock rollback fail closed',async()=>{
 const f=await fixture();await assert.rejects(readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},{...f.options,maxRows:2}));
 for(const jump of [15001,-1,NaN]){let clockCalls=0;await assert.rejects(readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},{...f.options,monotonicNow:()=>++clockCalls===1?100:100+jump}));}
 let elapsed=0;const proof=await readServerPerpsSignatureHistory({walletAddress,day:'2026-10-18'},{...f.options,monotonicNow:()=>elapsed});elapsed=10001;
 assert.throws(()=>requireFreshServerPerpsSignatureHistory(proof,{walletAddress,day:'2026-10-18'}));
});
