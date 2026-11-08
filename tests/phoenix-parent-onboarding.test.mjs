import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import bs58 from 'bs58';
import {buildRegisterTraderIx,buildOnboardTraderDelegatedIx} from '@ellipsis-labs/rise';
import {preparePhoenixParentOnboarding,simulatePhoenixParentOnboarding,requirePhoenixParentSimulation} from '../lib/phoenix-parent-onboarding.js';
import {PHOENIX_IDENTITIES as ID} from '../lib/phoenix-market-plan.js';
import {readPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {readPhoenixNativeMarket} from '../lib/phoenix-native-market.js';
import {phoenixSimulationFixture} from './helpers/phoenix-simulation-fixture.mjs';
import {phoenixRpcAccount,phoenixTraderBytes} from './helpers/phoenix-chain-account-fixture.mjs';
import {capturePhoenixParentSignature,requirePhoenixParentSignature} from '../lib/phoenix-parent-signature.js';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openPhoenixVmCustody} from './helpers/phoenix-vm-custody.mjs';
import {openPhoenixExecutionJournal,requirePhoenixParentClaim} from '../lib/phoenix-execution-journal.js';
import {authorizePhoenixParentSigning,revalidatePhoenixParentDispatch} from '../lib/phoenix-parent-signing.js';
import {withLockedPerpsRuntimeRecoverySnapshot,readPerpsRuntimeRecoverySnapshot,inspectPerpsRuntimeRecoveryDatabases} from '../lib/perps-runtime-recovery.js';
import {dispatchPhoenixParent,recoverPhoenixParent} from '../lib/phoenix-parent-dispatch.js';
import {createPhoenixParentService} from '../lib/phoenix-parent-service.js';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
import {createPhoenixManualClient} from '../lib/phoenix-manual-client.js';
const ONBOARDER='EzkM8YbCkBLaCqX2cdxtMyxfTLpKui3mWQWnhe5w2P4Z',PERMISSION='6UCimUpRW2CGh3ESJm3S59c4WcCaVLYcpPPbbrfX2nzr';
const AUTHORITY='8wTcJdg4Xw3wnvmBu7Sokn3c2UnnHUhuB5g9sfeCMidR',SYSTEM='11111111111111111111111111111111';
async function fixture(configuration={}){
 const f=await phoenixSimulationFixture(configuration),rent=8371840;f.map.delete(f.parent);
 const permission=Buffer.alloc(168);createHash('sha256').update('account:permission_account').digest().copy(permission,0,0,8);
 permission.set(bs58.decode(AUTHORITY),8);permission.set(bs58.decode(ONBOARDER),40);permission.writeBigUInt64LE(16n,80);permission.writeBigInt64LE(96085n,96);
 f.map.set(PERMISSION,phoenixRpcAccount(ID.program,permission));f.map.set(ONBOARDER,phoenixRpcAccount(SYSTEM,Buffer.alloc(0),100));
 const protocol={programAddress:ID.program,logAuthorityAddress:'GdxfTLSsdSY37G6fZoYtdGDSfgFnbT2EmRpuePZxWShS',globalConfigurationAddress:f.exchangeKeys.globalConfig};
 const instructions=[buildRegisterTraderIx({...protocol,payer:f.wallet,trader:f.wallet,traderAccount:f.parent,maxPositions:32n,traderPdaIndex:0,traderSubaccountIndex:0}),
  buildOnboardTraderDelegatedIx({...protocol,authority:ONBOARDER,permissionAccount:PERMISSION,traderAccount:f.parent,globalTraderIndex:f.exchangeKeys.globalTraderIndex,activeTraderBuffer:f.exchangeKeys.activeTraderBuffer})];
 const built={traderPda:f.parent,traderOnboarder:ONBOARDER,txFeePayer:f.wallet,maxPositions:32,includeRegisterTrader:true,instructions:instructions.map(ix=>({programId:ix.programAddress,data:[...ix.data],keys:ix.accounts.map(a=>({pubkey:a.address,isSigner:!!(a.role&2),isWritable:!!(a.role&1)}))}))};
 let preparation,patchPost=null,fee=10000;
 const request=async(method,params)=>{
  if(method==='getBlockHeight')return 1000;
  if(method==='getSignatureStatuses')return {context:{slot:1000},value:[null]};
  if(method==='getFeeForMessage'){assert.equal(params[0],preparation.messageBase64);return {context:{slot:1000},value:fee};}
  if(method==='getMinimumBalanceForRentExemption'){assert.equal(params[0],1520);return rent;}
  if(method==='simulateTransaction'){
   assert.equal(params[0],preparation.serializedTxBase64);assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);
   const b=phoenixTraderBytes({address:f.parent,wallet:f.wallet,index:0,collateral:0n});b.writeUInt32LE(62,96);
   const post=params[1].accounts.addresses.map(a=>structuredClone(f.map.get(a)??null));
   post[0].lamports-=rent+fee;post[3]=phoenixRpcAccount(ID.program,b,rent);
   const permission=Buffer.from(post[2].data[0],'base64');permission.writeBigInt64LE(permission.readBigInt64LE(96)-1n,96);post[2].data[0]=permission.toString('base64');patchPost?.(post);
   return {context:{slot:1000},value:{err:null,unitsConsumed:30000,accounts:post}};
  }return f.request(method,params);
 };
 const native=await readPhoenixNativeMarket(f.review.plan,{exchangeKeys:f.exchangeKeys,request,now:f.now,monotonicNow:f.monotonicNow});
 const account=await readPhoenixChainAccount({walletAddress:f.wallet},{request,now:f.now,monotonicNow:f.monotonicNow});
 const args={plan:f.review.plan,native,account,built,blockhash:bs58.encode(Buffer.alloc(32,7)),lastValidBlockHeight:2000},options={request,now:f.now};
 return {...f,args,options,built,async prepare(changes={}){preparation=await preparePhoenixParentOnboarding({...args,...changes},options);return preparation;},patch(fn){patchPost=fn;},fee(n){fee=n;}};
}
test('parent builder is independently reconstructed and exact two-signer wire simulates only zero-collateral registration',async()=>{
 const f=await fixture(),p=await f.prepare(),r=await simulatePhoenixParentOnboarding(p);
 assert.equal(Buffer.from(p.serializedTxBase64,'base64')[0],2);assert.equal(p.readyForSigning,false);assert.equal(p.requiresProtocolCosignature,true);
 assert.equal(r.maximumLamports,'8381840');assert.equal(r.networkFeeLamports,'10000');assert.equal(r.rentLockedLamports,'8371840');
 assert.equal(requirePhoenixParentSimulation(r,{preparation:p,request:f.options.request}),r);
 assert.throws(()=>requirePhoenixParentSimulation({...r},{preparation:p,request:f.options.request}));
 await assert.rejects(()=>simulatePhoenixParentOnboarding({...p}),/UNVERIFIED/);
 assert.throws(()=>requirePhoenixParentSimulation(r,{preparation:p,request:async()=>null}),/UNVERIFIED/);
 assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});
test('builder changes, extra signer, permission substitution, account spoof and elevated rent cannot pass',async()=>{
 for(const change of [b=>{b.maxPositions=128;},b=>{b.traderOnboarder=fake();},b=>{b.instructions[0].keys[4].isSigner=true;},
  b=>{b.instructions[0].data[8]=128;},b=>{b.instructions[1].keys[4].pubkey=fake();},b=>{b.instructions.push(b.instructions[0]);}]){
  const f=await fixture(),b=structuredClone(f.built);change(b);await assert.rejects(()=>f.prepare({built:b}));
 }
 const f=await fixture();await assert.rejects(()=>f.prepare({account:{...f.args.account}}));
 const g=await fixture(),a=g.map.get(PERMISSION),b=Buffer.from(a.data[0],'base64');b.writeBigUInt64LE(17n,80);a.data[0]=b.toString('base64');await assert.rejects(()=>g.prepare(),/PERMISSION/);
});
function fake(){return bs58.encode(Buffer.alloc(32,9));}
test('parent review uses the existing authenticated session, refreshes native proof and never equates an ACK with registration',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-parent-service-'));chmodSync(root,0o700);const custody=await openPhoenixVmCustody(root);
 let journal;t.after(()=>{journal?.close();custody.close();rmSync(root,{recursive:true,force:true});});custody.journal.close();
 const f=await fixture({wallet:custody.identity.walletAddress}),path=join(root,'phoenix.sqlite');
 const open=()=>openPhoenixExecutionJournal(path,{allowNonPosixForTests:process.platform==='win32',now:f.now});journal=open();
 let sends=0,signatures=0,preparations=0;
 const makeService=()=>createPhoenixParentService({controls:custody.controls,vault:{describe:custody.vault.describe,signPhoenixParent:grant=>{signatures++;return custody.vault.signPhoenixParent(grant);}},
  journal,riskJournal:custody.riskJournal,swapJournal:custody.swapJournal,backupRegistry:custody.backupRegistry,request:f.options.request,
  now:f.now,isRunning:()=>true,assertUncontended(){},prepareNative:async args=>{
   assert.equal(args.walletAddress,f.wallet);assert.equal(args.ownerAccountHash,custody.ownerAccountHash);assert.equal(args.symbol,'DOGE');preparations++;
   const preparation=await f.prepare(),simulation=await simulatePhoenixParentOnboarding(preparation);return {preparation,simulation};
  },sendRegisterIxs:async body=>{sends++;const row=journal.pendingParent(f.wallet)[0];assert.equal(row.state,'UNKNOWN');assert.equal(row.signed,body.transaction);
   return {signature:row.signature,traderPda:f.parent,txFeePayer:f.wallet,traderOnboarder:JSON.parse(row.preparation).onboarder,maxPositions:32,includeRegisterTrader:true};}});
 const makeApi=()=>createPerpsAutomationApi({controls:custody.controls,authenticate:async()=>custody.ownerAccountHash,rateLimit:async()=>true,phoenixParents:makeService()});
 let api=makeApi();const call=async(action,fields={})=>api(new Request('https://executor.invalid/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json'},body:JSON.stringify({action,walletAddress:f.wallet,...fields})}));
 const client=()=>createPhoenixManualClient({fetchImpl:(url,options)=>api(new Request(url,options)),readSessionToken:()=>'a'.repeat(64),now:f.now});let web=client();
 assert.equal((await call('phoenixParentPrepare',{symbol:'DOGE',ownerAccountHash:'b'.repeat(64)})).status,400);
 const review=await web.prepareParent(f.wallet,'DOGE');
 assert.equal(review.authorizesTrading,false);assert.equal(review.maximumLamports,'8381840');assert.equal(sends,0);assert.equal(signatures,0);
 assert.equal((await call('phoenixParentConfirm',{id:review.id,explicitApproval:false})).status,409);assert.equal(signatures,0);
 const result=await web.confirmParent(review,true);
 assert.equal(result.state,'UNKNOWN');assert.equal(result.providerAcknowledged,true);assert.equal(result.registered,false);
 assert.equal(preparations,2);assert.equal(sends,1);assert.equal(signatures,1);assert.equal((await call('phoenixParentConfirm',{id:review.id,explicitApproval:true})).status,409);
 journal.close();journal=open();api=makeApi();web=client();const recovered=await web.recoverParent(f.wallet,review.id);
 assert.equal(recovered.state,'UNKNOWN');assert.equal(sends,1);assert.equal(signatures,1);
 const status=await web.parentStatus(f.wallet);assert.equal(status.available,false);assert.equal(status.operations.length,1);
 assert.equal(JSON.stringify(status).includes('serializedTxBase64'),false);assert.equal(JSON.stringify(status).includes(custody.ownerAccountHash),false);
});
for(const providerMode of ['lost','wrong-ack'])test(`scoped parent signing and ${providerMode} survive restart without a duplicate send`,async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-parent-ledger-'));chmodSync(root,0o700);const custody=await openPhoenixVmCustody(root);
 let journal; t.after(()=>{journal?.close();custody.close();rmSync(root,{recursive:true,force:true});});
 custody.journal.close();const f=await fixture({wallet:custody.identity.walletAddress}),path=join(root,'phoenix.sqlite');
 const open=()=>openPhoenixExecutionJournal(path,{allowNonPosixForTests:process.platform==='win32',now:f.now});journal=open();
 const preparation=await f.prepare(),simulation=await simulatePhoenixParentOnboarding(preparation),id='f'.repeat(64),ownerAccountHash=custody.ownerAccountHash;
 const args={id,ownerAccountHash,controlRevision:custody.revision,preparation,simulation,request:f.options.request,maximumLamports:simulation.maximumLamports,expiresAt:f.now()+300000,explicitApproval:true};
 assert.throws(()=>journal.prepareParent({...args,explicitApproval:false}));assert.throws(()=>journal.prepareParent({...args,maximumLamports:'10000'}));
 const claim=journal.prepareParent(args);assert.equal(requirePhoenixParentClaim(claim,journal).state,'PREPARED');assert.throws(()=>requirePhoenixParentClaim({...claim},journal));
 const second=open();try{assert.equal(second.pendingParent(f.wallet).length,1);assert.throws(()=>requirePhoenixParentClaim(claim,second));assert.throws(()=>second.prepareParent({...args,id:'e'.repeat(64)}));}finally{second.close();}
 assert.throws(()=>journal.prepareParent({...args,id:'e'.repeat(64)}));
 assert.throws(()=>journal.prepareOrder({id:'d'.repeat(64),workflowId:'c'.repeat(64),ownerAccountHash,controlRevision:custody.revision,wire:f.wire}));
 const signArgs={ownerAccountHash,journal,claim,preparation,simulation,request:f.options.request,controls:custody.controls,backupRegistry:custody.backupRegistry,
  riskJournal:custody.riskJournal,swapJournal:custody.swapJournal,assertUncontended(){},now:f.now};
 assert.throws(()=>authorizePhoenixParentSigning({...signArgs,simulation:{...simulation}}));
 assert.throws(()=>authorizePhoenixParentSigning({...signArgs,controls:{read:who=>({...custody.controls.read(who),revision:'not-approved'})}}));
 const grant=authorizePhoenixParentSigning(signArgs);assert.throws(()=>revalidatePhoenixParentDispatch(grant));
 const signed=custody.vault.signPhoenixParent(grant);assert.equal(journal.readParentAttempt(id,ownerAccountHash).state,'SIGNED');
 assert.equal(Buffer.from(signed.serializedTxBase64,'base64').subarray(65,129).every(n=>n===0),true);
 assert.throws(()=>custody.vault.signPhoenixParent(grant));assert.throws(()=>journal.recoverUnsignedParent(id,ownerAccountHash));
 revalidatePhoenixParentDispatch(grant);let sends=0;
 await assert.rejects(()=>dispatchPhoenixParent(grant,{journal,request:async()=>null,sendRegisterIxs:async()=>{sends++;}}));assert.equal(sends,0);
 const sendRegisterIxs=async body=>{
  sends++;assert.equal(journal.readParentAttempt(id,ownerAccountHash).state,'UNKNOWN');assert.equal(body.transaction,signed.serializedTxBase64);
  assert.equal(body.traderAuthority,f.wallet);assert.equal(body.txFeePayer,f.wallet);assert.equal(body.traderPdaIndex,0);assert.equal(body.traderSubaccountIndex,0);
  if(providerMode==='lost')throw Error('LOCAL_LOST_PROVIDER_REPLY');return {signature:'incorrect',traderPda:f.parent};
 };
 const attempts=await Promise.allSettled([1,2].map(()=>dispatchPhoenixParent(grant,{journal,request:f.options.request,sendRegisterIxs})));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);const result=attempts.find(r=>r.status==='fulfilled').value;
 assert.equal(result.registered,false);assert.equal(result.providerAcknowledged,false);assert.equal(result.mayRetry,false);assert.equal(sends,1);
 await assert.rejects(()=>dispatchPhoenixParent(grant,{journal,request:f.options.request,sendRegisterIxs:async()=>{sends++;}}));assert.equal(sends,1);
 assert.throws(()=>journal.markParentBroadcast(id,ownerAccountHash));
 journal.close();f.advance(600000);journal=open();const restored=journal.readParentAttempt(id,ownerAccountHash);
 assert.equal(restored.state,'UNKNOWN');assert.equal(restored.signed,signed.serializedTxBase64);assert.equal(journal.pending(f.wallet)[0].kind,'PARENT');
 assert.equal(journal.readParentAttempt(id,'a'.repeat(64)),null);assert.throws(()=>journal.recoverUnsignedParent(id,ownerAccountHash));
 assert.throws(()=>authorizePhoenixParentSigning({...signArgs,journal}));
 const readonly=async(method)=>{if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:1000},value:[null]};throw Error('NO_SEND_ALLOWED');};
 const recovered=await recoverPhoenixParent({journal,id,ownerAccountHash,walletAddress:f.wallet,request:readonly,now:f.now});assert.equal(recovered.state,'UNKNOWN');assert.equal(recovered.registered,false);assert.equal(sends,1);
 await assert.rejects(()=>recoverPhoenixParent({journal,id,ownerAccountHash,walletAddress:fake(),request:readonly,now:f.now}));
 await withLockedPerpsRuntimeRecoverySnapshot({controlsPath:join(root,'controls.sqlite'),journalPath:join(root,'journal.sqlite'),feesPath:join(root,'fees.sqlite'),
  paymentsPath:join(root,'payments.sqlite'),swapsPath:join(root,'swaps.sqlite'),phoenixPath:path,temporaryDirectory:root,allowNonPosixForTests:process.platform==='win32'},async handle=>{
   const files=inspectPerpsRuntimeRecoveryDatabases(readPerpsRuntimeRecoverySnapshot(handle),{temporaryDirectory:root,identities:[custody.identity],restorePaused:true,now:f.now,allowNonPosixForTests:process.platform==='win32'});
   assert.equal(files.filter(f=>f.kind==='phoenix').length,1);assert.equal(files.length,6);
  });
 assert.equal(journal.readParentAttempt(id,ownerAccountHash).state,'UNKNOWN');
});
test('partial signature binds both approved message and simulation while retaining the empty provider signature',async()=>{
 const keys=generateKeyPairSync('ed25519'),wallet=bs58.encode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const f=await fixture({wallet}),p=await f.prepare(),simulation=await simulatePhoenixParentOnboarding(p);
 const wire=Buffer.from(p.serializedTxBase64,'base64');sign(null,wire.subarray(129),keys.privateKey).copy(wire,1);
 const result=capturePhoenixParentSignature(p,simulation,wire.toString('base64'),f.options);
 assert.equal(result.readyForBroadcast,false);assert.equal(result.requiresProtocolCosignature,true);
 assert.equal(requirePhoenixParentSignature(result,{preparation:p,simulation,request:f.options.request}),result);
 assert.throws(()=>requirePhoenixParentSignature({...result},{preparation:p,simulation,request:f.options.request}));
 assert.throws(()=>capturePhoenixParentSignature(p,{...simulation},wire.toString('base64'),f.options));
 for(const offset of [1,65,wire.length-1]){const changed=Buffer.from(wire);changed[offset]^=1;assert.throws(()=>capturePhoenixParentSignature(p,simulation,changed.toString('base64'),f.options));}
 const altered=Buffer.from(wire);altered[altered.length-1]^=1;sign(null,altered.subarray(129),keys.privateKey).copy(altered,1);
 assert.throws(()=>capturePhoenixParentSignature(p,simulation,altered.toString('base64'),f.options));
});
test('used parent, exhausted provider quota, stale proof and counterfeit native state cannot prepare registration',async()=>{
 const f=await fixture();f.map.set(f.parent,phoenixRpcAccount(ID.program,phoenixTraderBytes({address:f.parent,wallet:f.wallet,index:0,collateral:0n})));
 const account=await readPhoenixChainAccount({walletAddress:f.wallet},{...f.options,monotonicNow:f.monotonicNow});
 await assert.rejects(()=>f.prepare({account}),/ALREADY_REGISTERED/);
 const g=await fixture(),a=g.map.get(PERMISSION),b=Buffer.from(a.data[0],'base64');b.writeBigInt64LE(0n,96);a.data[0]=b.toString('base64');await assert.rejects(()=>g.prepare(),/PERMISSION/);
 const h=await fixture();await assert.rejects(()=>h.prepare({native:{...h.args.native}}));
 const p=await h.prepare();h.advance(16000);await assert.rejects(()=>simulatePhoenixParentOnboarding(p),/EXPIRED/);
});
test('simulated unrelated payment, token changes, authority changes and wrong fee cannot authorize setup',async()=>{
 for(const patch of [post=>{post[1].lamports--;},post=>{post[0].lamports--;},post=>{post[3].lamports++;},post=>{post[4].lamports++;},
  post=>{const b=Buffer.from(post[2].data[0],'base64');b.writeBigInt64LE(96085n,96);post[2].data[0]=b.toString('base64');},
  post=>{const b=Buffer.from(post[3].data[0],'base64');b.set(bs58.decode(fake()),120);post[3].data[0]=b.toString('base64');}]){
  const f=await fixture(),p=await f.prepare();f.patch(patch);await assert.rejects(()=>simulatePhoenixParentOnboarding(p));
 }
 const f=await fixture(),p=await f.prepare();f.fee(10001);await assert.rejects(()=>simulatePhoenixParentOnboarding(p),/FEE/);
});
