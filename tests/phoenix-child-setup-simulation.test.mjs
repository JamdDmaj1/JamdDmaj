import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {buildPhoenixIsolatedSetup} from '../lib/phoenix-isolated-setup.js';
import {buildPhoenixChildSetupWire,simulatePhoenixChildSetup,requirePhoenixChildSetupSimulation} from '../lib/phoenix-child-setup-simulation.js';
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {readPhoenixNativeMarket} from '../lib/phoenix-native-market.js';
import {phoenixSimulationFixture} from './helpers/phoenix-simulation-fixture.mjs';
import {phoenixRpcAccount,phoenixTraderBytes} from './helpers/phoenix-chain-account-fixture.mjs';
import {PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {openPhoenixVmCustody} from './helpers/phoenix-vm-custody.mjs';
import {openPhoenixExecutionJournal,requirePhoenixChildSetupClaim} from '../lib/phoenix-execution-journal.js';
import {authorizePhoenixChildSetupSigning,inspectPhoenixChildSetupDispatch} from '../lib/phoenix-child-setup-signing.js';
import {withLockedPerpsRuntimeRecoverySnapshot,readPerpsRuntimeRecoverySnapshot,inspectPerpsRuntimeRecoveryDatabases} from '../lib/perps-runtime-recovery.js';
function edit(map,address,fn){const a=map.get(address),b=Buffer.from(a.data[0],'base64');fn(b);a.data[0]=b.toString('base64');}
async function fixture({existing=false,protectedParent=false,wallet}={}){
 const f=await phoenixSimulationFixture({wallet});if(!existing)f.map.delete(f.a.trader);else edit(f.map,f.a.trader,b=>b.writeUInt32LE(0,116));
 if(!protectedParent)edit(f.map,f.parent,b=>b.writeUInt32LE(0,116));
 const rent=existing?0:2039280;let wire,patch=null,fee=5300,error=null;
 const request=async(method,params)=>{
  if(method==='getFeeForMessage'){assert.equal(params[0],wire.messageBase64);return {context:{slot:1000},value:fee};}
  if(method==='getMinimumBalanceForRentExemption'){assert.equal(params[0],280);return rent;}
  if(method==='simulateTransaction'){
   assert.equal(params[0],wire.serializedTxBase64);assert.equal(params[1].replaceRecentBlockhash,false);assert.equal(params[1].sigVerify,false);
   const post=params[1].accounts.addresses.map(a=>structuredClone(f.map.get(a)??null));post[0].lamports-=fee+rent;
   const parent=Buffer.from(post[3].data[0],'base64');parent.writeUInt32LE(parent.readUInt32LE(116)|1,116);post[3].data[0]=parent.toString('base64');
   if(!existing)post[4]=phoenixRpcAccount(ID.program,phoenixTraderBytes({address:f.a.trader,wallet:f.wallet,index:1,collateral:0n}),rent);
   else{const child=Buffer.from(post[4].data[0],'base64');child.writeUInt32LE(child.readUInt32LE(116)|1,116);post[4].data[0]=child.toString('base64');}
   patch?.(post);return {context:{slot:1000},value:{err:error,unitsConsumed:60000,accounts:post}};
  }return f.request(method,params);
 };
 const native=await readPhoenixNativeMarket(f.review.plan,{exchangeKeys:f.exchangeKeys,request,now:f.now,monotonicNow:f.monotonicNow});
 const account=await readPhoenixChainAccount({walletAddress:f.wallet},{request,now:f.now,monotonicNow:f.monotonicNow});
 const setup=await buildPhoenixIsolatedSetup({plan:f.review.plan,native,account},{request,now:f.now});
 wire=buildPhoenixChildSetupWire(setup,{blockhash:bs58.encode(Buffer.alloc(32,7)),lastValidBlockHeight:2000});
 return {...f,orderWire:f.wire,request,setup,wire,patch(fn){patch=fn;},setFee(v){fee=v;},setError(v){error=v;}};
}
test('child setup consent and one-use scoped signature persist before return and remain held after restart/restore',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-child-ledger-'));chmodSync(root,0o700);const custody=await openPhoenixVmCustody(root);let journal;
 t.after(()=>{journal?.close();custody.close();if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith('jamd-child-ledger-'))throw Error('TEST_TEMP_PATH');rmSync(root,{recursive:true,force:true});});
 custody.journal.close();const f=await fixture({wallet:custody.identity.walletAddress}),path=join(root,'phoenix.sqlite');
 const open=()=>openPhoenixExecutionJournal(path,{allowNonPosixForTests:process.platform==='win32',now:f.now});journal=open();
 const simulation=await simulatePhoenixChildSetup(f.wire,{request:f.request}),id='c'.repeat(64),ownerAccountHash=custody.ownerAccountHash;
 const args={id,ownerAccountHash,controlRevision:custody.revision,wire:f.wire,simulation,request:f.request,maximumLamports:simulation.maximumLamports,expiresAt:f.now()+300000,explicitApproval:true};
 assert.throws(()=>journal.prepareChildSetup({...args,explicitApproval:false}));assert.throws(()=>journal.prepareChildSetup({...args,maximumLamports:'5300'}));
 const claim=journal.prepareChildSetup(args);assert.equal(requirePhoenixChildSetupClaim(claim,journal).phase,'CHILD');assert.throws(()=>requirePhoenixChildSetupClaim({...claim},journal));
 assert.equal(journal.pendingParent(f.wallet).length,0);assert.equal(journal.readParentAttempt(id,ownerAccountHash),null);assert.equal(journal.pending(f.wallet)[0].kind,'CHILD');
 assert.throws(()=>journal.prepareOrder({id:'d'.repeat(64),workflowId:'e'.repeat(64),ownerAccountHash,controlRevision:custody.revision,wire:f.orderWire}));
 const second=open();try{assert.equal(second.pendingChildSetup(f.wallet).length,1);assert.throws(()=>second.prepareChildSetup({...args,id:'f'.repeat(64)}));}finally{second.close();}
 const signArgs={ownerAccountHash,journal,claim,wire:f.wire,simulation,request:f.request,controls:custody.controls,backupRegistry:custody.backupRegistry,
  riskJournal:custody.riskJournal,swapJournal:custody.swapJournal,assertUncontended(){},now:f.now};
 assert.throws(()=>authorizePhoenixChildSetupSigning({...signArgs,simulation:{...simulation}}));
 assert.throws(()=>authorizePhoenixChildSetupSigning({...signArgs,controls:{read:who=>({...custody.controls.read(who),revision:'not-approved'})}}));
 const grant=authorizePhoenixChildSetupSigning(signArgs);assert.throws(()=>inspectPhoenixChildSetupDispatch(grant,{journal,request:f.request}));
 assert.throws(()=>custody.vault.signPhoenixParent(grant));const signed=custody.vault.signPhoenixChildSetup(grant);
 assert.equal(journal.readChildSetup(id,ownerAccountHash).state,'SIGNED');assert.equal(journal.readChildSetup(id,ownerAccountHash).signed,signed.serializedTxBase64);
 assert.throws(()=>custody.vault.signPhoenixChildSetup(grant));assert.throws(()=>journal.recoverUnsignedChildSetup(id,ownerAccountHash));
 inspectPhoenixChildSetupDispatch(grant,{journal,request:f.request});journal.markChildSetupBroadcast(id,ownerAccountHash);assert.throws(()=>journal.markChildSetupBroadcast(id,ownerAccountHash));
 journal.close();f.advance(600000);journal=open();assert.equal(journal.readChildSetup(id,ownerAccountHash).state,'UNKNOWN');
 assert.equal(journal.readChildSetup(id,ownerAccountHash).signed,signed.serializedTxBase64);assert.equal(journal.readChildSetup(id,'a'.repeat(64)),null);
 assert.throws(()=>journal.recoverUnsignedChildSetup(id,ownerAccountHash));assert.throws(()=>authorizePhoenixChildSetupSigning({...signArgs,journal}));
 await withLockedPerpsRuntimeRecoverySnapshot({controlsPath:join(root,'controls.sqlite'),journalPath:join(root,'journal.sqlite'),feesPath:join(root,'fees.sqlite'),paymentsPath:join(root,'payments.sqlite'),
  swapsPath:join(root,'swaps.sqlite'),phoenixPath:path,temporaryDirectory:root,allowNonPosixForTests:process.platform==='win32'},async handle=>{
   const files=inspectPerpsRuntimeRecoveryDatabases(readPerpsRuntimeRecoverySnapshot(handle),{temporaryDirectory:root,identities:[custody.identity],restorePaused:true,now:f.now,allowNonPosixForTests:process.platform==='win32'});
   assert.equal(files.filter(r=>r.kind==='phoenix').length,1);assert.equal(files.length,6);
  });assert.equal(journal.pending(f.wallet)[0].state,'UNKNOWN');
});
test('create and repair exact setup wires preserve tokens, parent state and flat child while accounting for fee/rent',async()=>{
 for(const config of [{},{protectedParent:true},{existing:true},{existing:true,protectedParent:true}]){
  const f=await fixture(config),r=await simulatePhoenixChildSetup(f.wire,{request:f.request});
  assert.equal(r.networkFeeLamports,'5300');assert.equal(r.rentLockedLamports,config.existing?'0':'2039280');assert.equal(r.authorizesTrading,false);assert.equal(r.readyForSigning,false);
  assert.equal(Buffer.from(f.wire.serializedTxBase64,'base64')[0],1);assert.equal(requirePhoenixChildSetupSimulation(r,{wire:f.wire,request:f.request}),r);
  assert.throws(()=>requirePhoenixChildSetupSimulation({...r},{wire:f.wire,request:f.request}));await assert.rejects(()=>simulatePhoenixChildSetup({...f.wire},{request:f.request}));
 }
});
test('USDC movement, excess SOL payment, changed parent collateral or child authority cannot pass setup effects',async()=>{
 for(const change of [post=>{post[0].lamports--;},post=>{post[1].lamports++;},post=>{const b=Buffer.from(post[1].data[0],'base64');b.writeBigUInt64LE(1n,64);post[1].data[0]=b.toString('base64');},
  post=>{const b=Buffer.from(post[3].data[0],'base64');b.writeBigInt64LE(1n,88);post[3].data[0]=b.toString('base64');},
  post=>{const b=Buffer.from(post[4].data[0],'base64');b.set(Buffer.alloc(32,9),120);post[4].data[0]=b.toString('base64');},post=>{post[4].lamports++;}]){
  const f=await fixture();f.patch(change);await assert.rejects(()=>simulatePhoenixChildSetup(f.wire,{request:f.request}));
 }
});
test('same-wire proof, current snapshot, fee, simulation result and expiry are mandatory',async()=>{
 const f=await fixture();await assert.rejects(()=>simulatePhoenixChildSetup(f.wire,{request:async()=>null}));
 f.setFee(5301);await assert.rejects(()=>simulatePhoenixChildSetup(f.wire,{request:f.request}),/FEE/);
 const g=await fixture();g.setError({InstructionError:[2,'Custom']});await assert.rejects(()=>simulatePhoenixChildSetup(g.wire,{request:g.request}),/SIMULATION/);
 const h=await fixture();h.map.get(h.wallet).lamports--;await assert.rejects(()=>simulatePhoenixChildSetup(h.wire,{request:h.request}),/SNAPSHOT/);
 const stale=await fixture();stale.advance(10001);await assert.rejects(()=>simulatePhoenixChildSetup(stale.wire,{request:stale.request}),/EXPIRED/);
});
test('already protected accounts require no transaction or duplicate rent',async()=>{
 const f=await phoenixSimulationFixture(),setup=await buildPhoenixIsolatedSetup({plan:f.review.plan,native:f.native,account:f.account},{request:f.request,now:f.now});
 assert.equal(setup.instructions.length,0);assert.throws(()=>buildPhoenixChildSetupWire(setup,{blockhash:bs58.encode(Buffer.alloc(32,7)),lastValidBlockHeight:2000}),/NO_TRANSACTION/);
});
test('budget bounds reject oversized instructions while token-account JSON ordering is not a money change',async()=>{
 const f=await fixture();
 for(const change of [{computeUnitLimit:99999},{computeUnitPriceMicroLamports:10001},{lastValidBlockHeight:0}])
  assert.throws(()=>buildPhoenixChildSetupWire(f.setup,{blockhash:bs58.encode(Buffer.alloc(32,7)),lastValidBlockHeight:2000,...change}));
 f.patch(post=>{const a=post[1];post[1]={data:a.data,lamports:a.lamports,executable:a.executable,owner:a.owner,rentEpoch:99};});
 const result=await simulatePhoenixChildSetup(f.wire,{request:f.request});assert.equal(result.authorizesTrading,false);
});
