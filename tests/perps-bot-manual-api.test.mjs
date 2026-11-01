import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
const owner='a'.repeat(64),wallet='11111111111111111111111111111112',other='11111111111111111111111111111113';
function fixture(available=true){
 const calls=[],controls={read(who){if(who.ownerAccountHash!==owner||who.walletAddress!==wallet)throw Error('FOREIGN');return {walletAddress:wallet};},readForOwner(){},save(){assert.fail('No activation or settings mutation');},pause(){assert.fail('No pause mutation');},activate(){assert.fail('No activation');},issueActivationChallenge(){assert.fail('No activation challenge');}};
 const botManual=Object.fromEntries(['status','prepare','confirm','recover','positions','prepareClose','confirmClose','recoverClose'].map(method=>[method,async args=>{calls.push({method,args});return {walletAddress:wallet,stage:method};}]));
 const handler=createPerpsAutomationApi({controls,authenticate:async()=>owner,rateLimit:async()=>true,botManual:available?botManual:null});
 const request=body=>handler(new Request('https://controls.example/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+'b'.repeat(64),'Content-Type':'application/json',Origin:'https://www.jamddmaj.com'},body:JSON.stringify(body)}));
 return {calls,request};
}
test('manual bot API binds verified owner before status, review, confirmation or recovery',async()=>{
 const f=fixture();
 for(const [action,extra]of [['botManualStatus',{}],['botManualPrepare',{draft:{asset:'BTC'}}],['botManualConfirm',{id:'review',explicitApproval:true,explicitFeeApproval:true,feeTermsVersion:'terms'}],['botManualRecover',{id:'review'}],['botManualPositions',{}],['botManualClosePrepare',{positionAddress:wallet,referencePrice:'100'}],['botManualCloseConfirm',{id:'close',explicitApproval:true}],['botManualCloseRecover',{id:'close'}]]){
  const denied=await f.request({action,walletAddress:other,...extra});assert.notEqual(denied.status,200);
  const response=await f.request({action,walletAddress:wallet,...extra});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(f.calls.at(-1).args.ownerAccountHash,owner);assert.equal(f.calls.at(-1).args.walletAddress,wallet);
 }
 assert.equal(f.calls.length,8);
 assert.equal((await f.request({action:'botManualPrepare',walletAddress:wallet,ownerAccountHash:'c'.repeat(64),draft:{}})).status,400);
 assert.equal(f.calls.length,8);
});
test('manual custody execution is unavailable by default, never inferred from public funds',async()=>{
 const f=fixture(false),r=await f.request({action:'botManualStatus',walletAddress:wallet});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'bot-manual-unavailable');
 assert.equal(f.calls.length,0);
});
