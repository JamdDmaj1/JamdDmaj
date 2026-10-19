import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import bs58 from 'bs58';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
import {fixtureWallet as walletAddress,fixtureNow as time,historyTransaction} from './helpers/perps-history-fixture.mjs';
const ownerAccountHash='a'.repeat(64),otherOwner='b'.repeat(64),settings={capital:100,loss:50,positions:2,margin:20,leverage:4,dailyTrades:3};
async function chain({loss=false,now=()=>time,monotonicNow=()=>0}={}){
 const closing=loss?await historyTransaction({pnlDelta:'50000000'}):null;
 const token=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(token);Buffer.from(bs58.decode(walletAddress)).copy(token,32);token.writeBigUInt64LE(150000000n,64);token[108]=1;
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return 500000;
  if(method==='getBlocks')return [68000];
  if(method==='getBlockTime')return params[0]===500000?time/1000-5:time/1000-172800;
  if(method==='getFirstAvailableBlock')return 100;
  if(method==='getMultipleAccounts')return {context:{slot:500000},value:[{owner:'11111111111111111111111111111111',executable:false,lamports:100000000,data:['','base64']},
   {owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:2039280,data:[token.toString('base64'),'base64']},...Array(6).fill(null)]};
  if(method==='getSignaturesForAddress')return closing&&(params[0]===walletAddress||params[0]===closing.position)?[{signature:closing.signature,slot:closing.tx.slot,blockTime:closing.tx.blockTime,err:null,confirmationStatus:'finalized'}]:[];
  if(method==='getTransaction')return closing?.tx??null;
  throw Error('unexpected RPC');
 };
 return readServerPerpsDailyAccount({walletAddress},{request,now,monotonicNow});
}
function fixture(t,options={}){
 const directory=mkdtempSync(join(tmpdir(),'jamd-perps-controls-')),path=join(directory,'controls.sqlite'),stores=[];
 const open=(overrides={})=>{const store=openPerpsAutomationControls(path,{now:()=>time,...options,...overrides});stores.push(store);return store;};
 t.after(()=>{for(const s of stores)try{s.close();}catch{}rmSync(directory,{recursive:true,force:true});});
 return {path,open};
}
function provision(store,changes={}){return store.provision({ownerAccountHash,walletAddress,settings:{...settings,...changes}});}
function issue(store,value){return store.issueActivationChallenge({ownerAccountHash,walletAddress,expectedRevision:value.revision});}
function activate(store,challenge,changes={}){return store.activate({ownerAccountHash,walletAddress,expectedRevision:challenge.revision,token:challenge.token,explicitApproval:true,...changes});}

test('settings/owner binding persist across restart but provisioning and saving never activate',t=>{
 const f=fixture(t),one=f.open(),first=provision(one),two=f.open();
 assert.equal(first.enabled,false);assert.equal(first.paused,true);assert.equal(first.reason,'NOT_ACTIVATED');
 assert.deepEqual(two.read({ownerAccountHash,walletAddress}),first);
 assert.throws(()=>two.read({ownerAccountHash:otherOwner,walletAddress}),/PERPS_CONTROLS_UNAVAILABLE/);
 assert.throws(()=>two.provision({ownerAccountHash:otherOwner,walletAddress,settings}),/ALREADY_PROVISIONED/);
 const saved=two.save({ownerAccountHash,walletAddress,expectedRevision:first.revision,settings:{...settings,leverage:3}});
 assert.equal(saved.enabled,false);assert.equal(saved.paused,true);assert.equal(saved.reason,'SETTINGS_CHANGED');assert.notEqual(saved.revision,first.revision);
 assert.throws(()=>one.save({ownerAccountHash,walletAddress,expectedRevision:first.revision,settings}),/STALE_PERPS_CONTROLS/);
 assert.ok(Object.isFrozen(saved.settings));assert.equal(two.audit({ownerAccountHash,walletAddress}).length,2);
 assert.equal(two.readForExecutor({walletAddress}).settings.leverage,3);
});
test('server settings require canonical amounts and reject activation fields or invalid protocol sizing',t=>{
 const f=fixture(t),store=f.open();
 for(const change of [{margin:9.99},{margin:'20'},{capital:true},{capital:1e20},{loss:0.0000001},{leverage:1},{enabled:true},{paused:false},{walletAddress},
  {positions:11},{dailyTrades:0},{stopLossPercent:100},{lossAction:'ignore-loss-limit'},{reductionPercent:100}]){
  assert.throws(()=>provision(store,change),/INVALID_PERPS_SETTINGS/);
 }
 const first=provision(store);assert.equal(first.settings.stopLossPercent,null);assert.equal(first.settings.takeProfitPercent,null);
 assert.throws(()=>store.read({ownerAccountHash:'owner supplied in JSON',walletAddress}));
});
test('activation requires actual server readiness and fresh chain evidence, never a client boolean',async t=>{
 const f=fixture(t),store=f.open(),first=provision(store),challenge=issue(store,first);
 await assert.rejects(activate(store,challenge),/EXECUTION_NOT_CONFIGURED/);
 const booleanOnly=f.open({authorizeActivation:async()=>({custodyAuthorized:true,executionReady:true,dailyAccount:{balancesComplete:true}})});
 await assert.rejects(activate(booleanOnly,challenge));assert.equal(store.readForExecutor({walletAddress}).enabled,false);
 const denied=f.open({authorizeActivation:async()=>({custodyAuthorized:false,executionReady:true,dailyAccount:await chain()})});
 await assert.rejects(activate(denied,challenge),/EXECUTION_NOT_CONFIGURED/);
});
test('a single explicit settings-bound approval survives worker restart as prior consent, but cannot be replayed',async t=>{
 const f=fixture(t,{authorizeActivation:async()=>({custodyAuthorized:true,executionReady:true,dailyAccount:await chain()})}),store=f.open(),first=provision(store),challenge=issue(store,first);
 const active=await activate(store,challenge);assert.equal(active.enabled,true);assert.equal(active.paused,false);assert.notEqual(active.revision,first.revision);
 assert.deepEqual(f.open().readForExecutor({walletAddress}),active);
 await assert.rejects(activate(store,challenge),/STALE_PERPS_CONTROLS/);
 const saved=store.save({ownerAccountHash,walletAddress,expectedRevision:active.revision,settings});assert.equal(saved.enabled,false);assert.equal(saved.paused,true);
 const paused=store.pause({ownerAccountHash,walletAddress});assert.equal(paused.enabled,false);assert.equal(paused.paused,true);
 assert.throws(()=>store.audit({ownerAccountHash:otherOwner,walletAddress}));
});
test('approval tokens are hashed, expire, are owner-bound and superseded by a newer review',async t=>{
 let clock=time;const f=fixture(t,{now:()=>clock,authorizeActivation:async()=>({custodyAuthorized:true,executionReady:true,dailyAccount:await chain({now:()=>clock})})}),store=f.open();
 const first=provision(store),one=issue(store,first),two=issue(store,first);
 await assert.rejects(activate(store,one),/INVALID_PERPS_ACTIVATION_APPROVAL/);
 await assert.rejects(activate(store,two,{ownerAccountHash:otherOwner}),/PERPS_CONTROLS_UNAVAILABLE/);
 await assert.rejects(activate(store,two,{explicitApproval:false}),/EXECUTION_NOT_CONFIGURED/);
 const disk=Buffer.concat([readFileSync(f.path),readFileSync(f.path+'-wal')]).toString('utf8');assert.equal(disk.includes(two.token),false);
 clock+=60000;await assert.rejects(activate(store,two),/INVALID_PERPS_ACTIVATION_APPROVAL/);
 clock=time-1;await assert.rejects(activate(store,two));
 assert.equal(store.read({ownerAccountHash,walletAddress}).enabled,false);
});
test('pause or configuration change during readiness checks wins over an in-flight activation',async t=>{
 let release,started;const waiting=new Promise(r=>started=r),f=fixture(t,{authorizeActivation:async()=>{started();await new Promise(r=>release=r);return {custodyAuthorized:true,executionReady:true,dailyAccount:await chain()};}});
 const store=f.open(),first=provision(store),challenge=issue(store,first),attempt=activate(store,challenge);await waiting;
 store.pause({ownerAccountHash,walletAddress});release();await assert.rejects(attempt,/STALE_PERPS_CONTROLS/);assert.equal(store.readForExecutor({walletAddress}).enabled,false);
});
test('daily loss actions require verified loss, pause atomically, reduce only future sizing and invalidate reviews',async t=>{
 const account=await chain({loss:true});
 for(const lossAction of ['disable','reduce-leverage','reduce-margin']){
  const f=fixture(t),store=f.open(),first=provision(store,{lossAction}),challenge=issue(store,first);
  assert.throws(()=>store.pauseForRisk({walletAddress,expectedRevision:first.revision,dailyAccount:{...account}}));
  const paused=store.pauseForRisk({walletAddress,expectedRevision:first.revision,dailyAccount:account});
  assert.equal(paused.enabled,false);assert.equal(paused.paused,true);assert.equal(paused.reason,'DAILY_LOSS_LIMIT');assert.equal(paused.riskLossUsdcUnits,'50030000');
  assert.equal(paused.settings.loss,50);assert.equal(paused.settings.leverage,lossAction==='reduce-leverage'?2:4);assert.equal(paused.settings.margin,lossAction==='reduce-margin'?10:20);
  assert.deepEqual(store.pauseForRisk({walletAddress,expectedRevision:paused.revision,dailyAccount:account}),paused);
  const saved=store.save({ownerAccountHash,walletAddress,expectedRevision:paused.revision,settings:paused.settings});
  const pausedAgain=store.pauseForRisk({walletAddress,expectedRevision:saved.revision,dailyAccount:account});
  assert.deepEqual(pausedAgain.settings,paused.settings);
  assert.throws(()=>store.issueActivationChallenge({ownerAccountHash,walletAddress,expectedRevision:challenge.revision}),/STALE_PERPS_CONTROLS/);
 }
});
test('below-limit risk checks do not pause or revise settings, while stale chain evidence cannot change policy',async t=>{
 let elapsed=0;const account=await chain({monotonicNow:()=>elapsed}),f=fixture(t),store=f.open(),first=provision(store);
 assert.deepEqual(store.pauseForRisk({walletAddress,expectedRevision:first.revision,dailyAccount:account}),first);
 elapsed=10001;assert.throws(()=>store.pauseForRisk({walletAddress,expectedRevision:first.revision,dailyAccount:account}));
 assert.deepEqual(store.readForExecutor({walletAddress}),first);
});
test('activation rejects exhausted daily loss despite an explicit new approval',async t=>{
 const account=await chain({loss:true}),f=fixture(t,{authorizeActivation:async()=>({custodyAuthorized:true,executionReady:true,dailyAccount:account})}),store=f.open(),first=provision(store);
 await assert.rejects(activate(store,issue(store,first)),/PERPS_ACTIVATION_RISK_LIMIT/);assert.equal(store.readForExecutor({walletAddress}).enabled,false);
});
test('at the protocol minimum, reducing margin stays paused without creating an unsupported order',async t=>{
 const account=await chain({loss:true}),f=fixture(t),store=f.open(),first=provision(store,{margin:10,lossAction:'reduce-margin',reductionPercent:99});
 const paused=store.pauseForRisk({walletAddress,expectedRevision:first.revision,dailyAccount:account});
 assert.equal(paused.settings.margin,10);assert.equal(paused.enabled,false);assert.equal(paused.paused,true);
});
