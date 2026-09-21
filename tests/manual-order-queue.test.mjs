import test from 'node:test';
import assert from 'node:assert/strict';
import { requireManualConfirmation, enqueueManualOrder } from '../lib/manual-order-queue.js';
const requestId='12345678-1234-4123-8123-123456789abc';
test('confirmation is explicit and identifier is validated',()=>{
  assert.throws(()=>requireManualConfirmation({requestId}));
  assert.throws(()=>requireManualConfirmation({requestId:'reuse',confirmLiveOrder:true}));
  assert.equal(requireManualConfirmation({requestId,confirmLiveOrder:true}),requestId);
});
test('queue uses a single atomic command and stable deduplication key',async()=>{
  let calls=0;
  await enqueueManualOrder(async(path,commands)=>{
    calls++;
    assert.equal(path,'pipeline'); assert.equal(commands.length,1);
    assert.equal(commands[0][0],'EVAL');
    assert.equal(commands[0][3],`jamd:pro:manual-confirmation:${requestId}`);
    return [{result:'queued'}];
  },'queue',requestId,{id:requestId});
  assert.equal(calls,1);
});
test('duplicate, busy and ambiguous replies never retry automatically',async()=>{
  for(const result of ['duplicate','busy',null]){
    let calls=0;
    await assert.rejects(()=>enqueueManualOrder(async()=>{calls++; return [{result}];},'queue',requestId,{}));
    assert.equal(calls,1);
  }
});
