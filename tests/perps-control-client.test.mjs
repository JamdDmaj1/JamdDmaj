import test from 'node:test';
import assert from 'node:assert/strict';
import {createPerpsControlClient,PERPS_CONTROL_ORIGIN,readExistingPerpsControlSession} from '../lib/perps-control-client.js';
import {validateAutomationSettings} from '../lib/automation-panel.js';
import {fixtureWallet as wallet} from './helpers/perps-history-fixture.mjs';
const token='a'.repeat(64),revision='12345678-1234-4123-8123-123456789abc';
const settings={capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3};
const health={ok:true,mode:'controls-only',tradingEnabled:false,executionAvailable:false,custodyProvisioningAvailable:false};
const state={walletAddress:wallet,revision,settings,enabled:false,paused:true,reason:'SETTINGS_CHANGED',updatedAt:0};
function fixture({readSessionToken=()=>token,healthReply=health,reply=()=>Response.json({ok:true,controls:state})}={}){
 const calls=[],client=createPerpsControlClient({readSessionToken,validateSettings:validateAutomationSettings,fetchImpl:async(url,options)=>{
  calls.push({url,options});assert.ok(url.startsWith(PERPS_CONTROL_ORIGIN+'/'));
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');
  if(url.endsWith('/health')){assert.equal(options.headers.Authorization,undefined);return Response.json(healthReply);}
  assert.equal(options.headers.Authorization,'Bearer '+readSessionToken());return reply(url,options);
 }});return {client,calls};
}
test('app control client uses fixed HTTPS and the existing session, never sends authority in JSON or activates on load',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);const read=await f.client.read();assert.equal(read.walletAddress,wallet);assert.equal(Object.isFrozen(read.settings),true);
 await f.client.save({walletAddress:wallet,expectedRevision:revision,settings});await f.client.pause({walletAddress:wallet});
 const actions=f.calls.filter(call=>call.options.body).map(call=>JSON.parse(call.options.body));
 assert.deepEqual(actions.map(body=>body.action),['save','pause']);assert.ok(actions.every(body=>!Object.hasOwn(body,'ownerAccountHash')&&!Object.hasOwn(body,'enabled')));
 assert.equal(f.client.activate,undefined);assert.equal(typeof f.client.provision,'function');assert.equal(f.client.sign,undefined);
});

test('explicit custody setup requires consent, protocol sizing and server capability before an authenticated mutation',async()=>{
 const f=fixture();assert.throws(()=>f.client.provision({settings}),/custody-approval-required/);
 assert.throws(()=>f.client.provision({settings:{...settings,margin:5},explicitCustodyApproval:true}),/invalid-settings/);assert.equal(f.calls.length,0);
 await assert.rejects(f.client.provision({settings,explicitCustodyApproval:true}),/custody-unavailable/);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.body,undefined);
 const setup={stage:'BACKUP_VERIFICATION_REQUIRED',backupVerified:false,fundingAvailable:false,readyForSigning:false};
 const ready=fixture({healthReply:{...health,custodyProvisioningAvailable:true},reply:(_url,options)=>{
  assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),['action','explicitCustodyApproval','settings']);return Response.json({ok:true,controls:state,setup});
 }});
 const result=await ready.client.provision({settings,explicitCustodyApproval:true});assert.equal(result.controls.walletAddress,wallet);assert.deepEqual(result.setup,setup);assert.equal(ready.calls.length,2);
});

test('custody setup never accepts active controls or a response that claims deposits or signing are ready',async()=>{
 const setup={stage:'BACKUP_VERIFICATION_REQUIRED',backupVerified:false,fundingAvailable:false,readyForSigning:false};
 for(const overrides of [{controls:{...state,enabled:true,paused:false}},{setup:{...setup,backupVerified:true}},{setup:{...setup,fundingAvailable:true}},{setup:{...setup,readyForSigning:true}},{setup:null}]){
  const f=fixture({healthReply:{...health,custodyProvisioningAvailable:true},reply:()=>Response.json({ok:true,controls:state,setup,...overrides})});
  await assert.rejects(f.client.provision({settings,explicitCustodyApproval:true}),/controls-unavailable/);assert.equal(f.calls.length,2);
 }
});

test('a session switch after custody setup was sent cannot display that wallet under the new session or automatically retry',async()=>{
 let current=token,calls=0;
 const client=createPerpsControlClient({validateSettings:validateAutomationSettings,readSessionToken:()=>current,fetchImpl:async(url,options)=>{
  calls++;if(url.endsWith('/health'))return Response.json({...health,custodyProvisioningAvailable:true});
  assert.equal(options.headers.Authorization,'Bearer '+token);current='b'.repeat(64);
  return Response.json({ok:true,controls:state,setup:{stage:'BACKUP_VERIFICATION_REQUIRED',backupVerified:false,fundingAvailable:false,readyForSigning:false}});
 }});
 await assert.rejects(client.provision({settings,explicitCustodyApproval:true}),/session-changed/);assert.equal(calls,2);
});
test('missing sessions and changes during a request do not authorize or display another account',async()=>{
 const missing=fixture({readSessionToken:()=>''});await assert.rejects(missing.client.read(),/login-required/);assert.equal(missing.calls.length,0);
 let current=token,count=0;
 const client=createPerpsControlClient({validateSettings:validateAutomationSettings,readSessionToken:()=>current,fetchImpl:async()=>{count++;current='b'.repeat(64);return Response.json(health);}});
 await assert.rejects(client.read(),/session-changed/);assert.equal(count,1);
});
test('bad or private provider responses are bounded, cannot impersonate control errors and never cause automatic retries',async()=>{
 for(const reply of [()=>Response.json({private:'do-not-expose'},{status:503}),()=>Response.json({ok:true,controls:{...state,walletAddress:'invalid'}}),
  ()=>new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}}),()=>Response.json({ok:true,data:'x'.repeat(9000)}),
  ()=>{throw Object.assign(Error('private-token-must-not-escape'),{code:'login-required'});}]){
  const f=fixture({reply});await assert.rejects(f.client.read(),error=>!error.message.includes('private')&&['controls-unavailable','invalid-request'].includes(error.code));assert.equal(f.calls.length,2);
 }
 const denied=fixture({reply:()=>Response.json({error:{code:'ignored'}},{status:401})});await assert.rejects(denied.client.read(),/login-required/);
});
test('save requires matching wallet, valid revision and a paused server result instead of assuming success',async()=>{
 const f=fixture();assert.throws(()=>f.client.save({walletAddress:wallet,expectedRevision:'old',settings}),/invalid-request/);assert.equal(f.calls.length,0);
 const active=fixture({reply:()=>Response.json({ok:true,controls:{...state,enabled:true,paused:false}})});
 await assert.rejects(active.client.save({walletAddress:wallet,expectedRevision:revision,settings}),/controls-unavailable/);
 await assert.rejects(active.client.pause({walletAddress:wallet}),/controls-unavailable/);
});

test('finance navigation reads the existing same-origin session without confusing a saved profile or wallet with login',()=>{
 const storage={getItem:key=>key==='jamdWebTrialSession'?token:''};
 assert.equal(readExistingPerpsControlSession({sessionStorage:storage}),token);
 assert.equal(readExistingPerpsControlSession({JamdTrial:{getToken:()=>''},sessionStorage:storage}),'');
 assert.equal(readExistingPerpsControlSession({localStorage:storage,JamdAccountProfile:{linked:true}}),'');
 assert.equal(readExistingPerpsControlSession({get sessionStorage(){throw Error('blocked');}}),'');
});

test('read-only recovery projection binds the returned wallet and never accepts funding or signing readiness',async()=>{
 const recovery={walletAddress:wallet,stage:'BACKUP_VERIFIED_EXECUTION_PENDING',backupVerified:true,verifiedAt:123,fundingAvailable:false,readyForSigning:false};
 const good=fixture({reply:()=>Response.json({ok:true,controls:state,recovery})});
 const result=await good.client.readStatus();assert.equal(result.controls.walletAddress,wallet);assert.deepEqual(result.recovery,recovery);
 assert.equal(Object.isFrozen(result.recovery),true);assert.ok(good.calls.every(call=>!call.options.body));
 const old=await fixture().client.readStatus();assert.equal(old.recovery,null);
 for(const changed of [{walletAddress:'11111111111111111111111111111111'},{fundingAvailable:true},{readyForSigning:true},{verifiedAt:-1},{stage:'READY'}]){
  const f=fixture({reply:()=>Response.json({ok:true,controls:state,recovery:{...recovery,...changed}})});
  await assert.rejects(f.client.readStatus(),/controls-unavailable/);
 }
 const empty=fixture({reply:()=>Response.json({ok:true,controls:null,recovery})});await assert.rejects(empty.client.readStatus(),/controls-unavailable/);
});
