import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePendingPerps} from '../lib/perps-pending-recovery.js';

test('restart recovery queries only recorded signatures and never retries unsigned or signing work',async()=>{
 const rows=['RESERVED','SIGNING','UNCERTAIN','UNCERTAIN','UNCERTAIN','UNCERTAIN'].map((state,i)=>({state,wallet:'owner',signature:'sig'+i,wire_hash:'hash'+i,reservation:'id'+i}));
 const queries=[],settlements=[];
 const journal={pending(wallet){assert.equal(wallet,'owner');return rows;},reconcileBroadcast(id,proof){settlements.push(id);return {state:proof.state==='CONFIRMED'?'OPEN':'CLOSED'};}};
 const result=await reconcilePendingPerps(journal,'owner',{readReceipt:async record=>{
  queries.push(record);
  if(record.signature==='sig2')throw Error('RPC_UNAVAILABLE');
  if(record.signature==='sig3')return null;
  return {state:record.signature==='sig4'?'CONFIRMED':'FAILED'};
 }});
 assert.deepEqual(result,{checked:4,confirmed:1,failed:1,unresolved:2,manualReview:2,deferred:0});
 assert.deepEqual(settlements,['id4','id5']);
 assert.deepEqual(queries[0],{walletAddress:'owner',signature:'sig2',wireHash:'hash2'});
 assert.equal(Object.isFrozen(result),true);
});
test('bounded recovery keeps remaining attempts reserved; invalid or stale proofs cannot settle',async()=>{
 const rows=[1,2,3].map(i=>({state:'UNCERTAIN',wallet:'owner',signature:'sig'+i,wire_hash:'hash',reservation:'id'+i}));
 const journal={pending(){return rows;},reconcileBroadcast(){throw Error('VERIFIED_RECONCILIATION_REQUIRED');}};
 let requests=0;
 const result=await reconcilePendingPerps(journal,'owner',{limit:1,readReceipt:async()=>{requests++;return {};}});
 assert.equal(requests,1);assert.deepEqual(result,{checked:1,confirmed:0,failed:0,unresolved:1,manualReview:0,deferred:2});
 for(const limit of [0,101,1.5,NaN])await assert.rejects(reconcilePendingPerps(journal,'owner',{limit}),/INVALID_RECOVERY_LIMIT/);
});
