import test from 'node:test';
import assert from 'node:assert/strict';
import {manualRiskAgreement,makeClientOid} from '../scripts/bitget-executor.mjs';
const signal={id:'manual-test-12345678-1234-4123-8123-123456789abc',manualTest:true,plannedUsd:5,leverage:3};
test('manual exchange ID is stable across retries',()=>{
 const first=makeClientOid(signal);assert.equal(makeClientOid({...signal}),first);
 assert.notEqual(makeClientOid({...signal,id:signal.id+'2'}),first);
 assert.ok(first.length<=60);assert.match(first,/^[a-z0-9-]+$/);
 assert.throws(()=>makeClientOid({manualTest:true}));
});
test('manual risk cannot silently change after user confirmation',()=>{
 assert.equal(manualRiskAgreement(signal,5,3).ok,true);
 for(const [margin,leverage] of [[3,3],[6,3],[5,2],[5,4]])assert.equal(manualRiskAgreement(signal,margin,leverage).ok,false);
 assert.equal(manualRiskAgreement({...signal,plannedUsd:NaN},5,3).ok,false);
});
test('automatic sizing remains separate',()=>{
 assert.equal(manualRiskAgreement({manualTest:false},3,2).ok,true);
});
