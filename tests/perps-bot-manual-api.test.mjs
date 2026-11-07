import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
const owner='a'.repeat(64),wallet='11111111111111111111111111111112',other='11111111111111111111111111111113';
function fixture(available=true){
 const calls=[],controls={read(who){if(who.ownerAccountHash!==owner||who.walletAddress!==wallet)throw Error('FOREIGN');return {walletAddress:wallet};},readForOwner(){},save(){assert.fail('No activation or settings mutation');},pause(){assert.fail('No pause mutation');},activate(){assert.fail('No activation');},issueActivationChallenge(){assert.fail('No activation challenge');}};
 const botManual=Object.fromEntries(['status','prepare','confirm','recover','positions','prepareClose','confirmClose','recoverClose','prepareRecovery','confirmRecovery','recoverRecovery'].map(method=>[method,async args=>{calls.push({method,args});return {walletAddress:wallet,stage:method};}]));
 const handler=createPerpsAutomationApi({controls,authenticate:async()=>owner,rateLimit:async()=>true,botManual:available?botManual:null});
 const request=body=>handler(new Request('https://controls.example/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+'b'.repeat(64),'Content-Type':'application/json',Origin:'https://www.jamddmaj.com'},body:JSON.stringify(body)}));
 return {calls,request,botManual};
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

test('a provider read rate limit is not a wallet, funds or consent error and cannot trigger a retry',async()=>{
 const f=fixture();let calls=0;f.botManual.prepare=async()=>{calls++;throw Error('PERPS_READ_ONLY_RPC_RATE_LIMITED');};
 const response=await f.request({action:'botManualPrepare',walletAddress:wallet,draft:{asset:'BTC'}});
 assert.equal(response.status,429);assert.deepEqual(await response.json(),{error:{code:'rpc-rate-limit'}});assert.equal(calls,1);
});

test('full close failures expose bounded stages, never provider data or an execution retry',async()=>{
 for(const [reason,code,status]of [
  ['PERPS_CLOSE_PREPARATION_UNAVAILABLE','close-builder-unavailable',503],
  ['PERPS_CLOSE_ACCOUNT_BINDINGS_MISMATCH','close-account-check-failed',409],
  ['UNVERIFIED_PERPS_CLOSE_ORACLE_CONTEXT','close-price-context-unverified',409],
  ['UNSAFE_PERPS_CLOSE_INSTRUCTION_POLICY','close-instruction-check-failed',409],
  ['UNVERIFIED_PERPS_CLOSE_SIMULATION','close-simulation-unverified',409],
  ['PERPS_CLOSE_SNAPSHOT_BANK_CHANGED','close-snapshot-changed',409],
  ['PERPS_CLOSE_WALLET_FUNDING_MISMATCH','close-funding-check-failed',409],
  ['PERPS_CLOSE_POOL_CONFIGURATION_MISMATCH','close-pool-check-failed',409],
  ['PERPS_CLOSE_RESERVE_RELEASE_MISMATCH','close-reserve-check-failed',409],
  ['PERPS_CLOSE_VAULT_CONSERVATION_MISMATCH','close-vault-check-failed',409],
  ['PERPS_CLOSE_RETURN_POLICY_MISMATCH','close-return-check-failed',409],
  ['PERPS_CLOSE_IMPACT_HISTORY_MISMATCH','close-impact-history-check-failed',409],
  ['PERPS_CLOSE_BORROW_ACCRUAL_MISMATCH','close-borrow-accrual-check-failed',409],
  ['unexpected provider text SECRET','controls-unavailable',503]]){
  const f=fixture();let attempts=0;
  f.botManual.prepareClose=async()=>{attempts++;throw Object.assign(Error(reason),{body:'SECRET',signature:'SECRET'});};
  const r=await f.request({action:'botManualClosePrepare',walletAddress:wallet,positionAddress:wallet,referencePrice:'100'});
  assert.equal(r.status,status);assert.deepEqual(await r.json(),{error:{code}});assert.equal(attempts,1);assert.equal(f.calls.length,0);
 }
});

test('collateral recovery actions bind the authenticated owner and reject client monetary or wire overrides',async()=>{
 const f=fixture();
 for(const action of ['botManualRecoveryPrepare','botManualRecoveryConfirm','botManualRecoveryRecover']){
  const body={action,walletAddress:wallet,id:'original-order',...(action==='botManualRecoveryConfirm'?{explicitApproval:true}:{})};
  assert.notEqual((await f.request({...body,walletAddress:other})).status,200);
  assert.equal((await f.request(body)).status,200);assert.equal(f.calls.at(-1).args.ownerAccountHash,owner);
  for(const change of [{amountUnits:'1'},{maxSlippageBps:500},{serializedTxBase64:'untrusted'},{ownerAccountHash:owner},{failureEvidence:{stage:'ACCOUNTED_ENTRY_RECOVERY_FAILURES_FOR_REVIEW'}},{previousFailure:{signature:'untrusted'}}])assert.equal((await f.request({...body,...change})).status,400);
 }
 assert.equal(f.calls.length,3);
});

test('a stale recovery attempt requires a fresh review, without disguising it as a server outage',async()=>{
 const f=fixture();let calls=0;
 f.botManual.confirmRecovery=async()=>{calls++;throw Error('PERPS_ENTRY_RECOVERY_ATTEMPT_REQUIRED');};
 const response=await f.request({action:'botManualRecoveryConfirm',walletAddress:wallet,id:'old-review',explicitApproval:true});
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:{code:'bot-manual-recovery-review-required'}});assert.equal(calls,1);
});

test('entry-reservation continuation reaches only the authenticated manual review service',async()=>{
 const f=fixture(),body={action:'botManualPrepare',walletAddress:wallet,draft:{asset:'BTC'},entryReservationId:'original-order'};
 assert.notEqual((await f.request({...body,walletAddress:other})).status,200);
 assert.equal(f.calls.length,0);
 assert.equal((await f.request(body)).status,200);
 assert.equal(f.calls[0].method,'prepare');assert.equal(f.calls[0].args.entryReservationId,'original-order');
 assert.equal(f.calls[0].args.ownerAccountHash,owner);
 assert.equal((await f.request({...body,serializedTxBase64:'untrusted'})).status,400);
 assert.equal(f.calls.length,1);
});

test('an unfinalized entry conversion returns a safe pending conflict, not a server outage or an automatic retry',async()=>{
 const f=fixture();let attempts=0;f.botManual.prepare=async()=>{attempts++;throw Error('BOT_MANUAL_CONVERSION_PENDING');};
 const response=await f.request({action:'botManualPrepare',walletAddress:wallet,draft:{asset:'BTC'},entryReservationId:'original-order'});
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:{code:'bot-manual-conversion-pending'}});assert.equal(attempts,1);
});
