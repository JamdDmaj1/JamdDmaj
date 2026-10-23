import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,createPrivateKey,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,mkdirSync,chmodSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {fixtureNow as now,fixtureWallet as wallet,historyTransaction} from './helpers/perps-history-fixture.mjs';
import {PERPS_CUSTODIES,PERPS_POOL,PERPS_PROGRAM,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readPerpsBroadcastReceipt} from '../lib/perps-broadcast-receipt.js';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {readServerPerpsPositionClosure,reconcileClosedServerPerpsPositions,readServerPerpsExitCleanup,requireVerifiedServerPerpsExitCleanup,requireVerifiedServerPerpsPositionClosure,readVerifiedServerPerpsCloseCleanupBinding} from '../lib/perps-position-closure.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {canonicalServerPerpsEntryExitPlan} from '../lib/perps-entry-exit-plan.js';
import {createServerPerpsExecutor} from '../lib/perps-server-executor.js';
import {inspectServerPerpsExitCancellation,requireInspectedPerpsExitCancellation} from '../lib/perps-exit-cancellation.js';
import {cancellationFixture,cancellationSimulationFixture,cancellationReceiptFixture} from './helpers/perps-cancellation-fixture.mjs';
import {simulateServerPerpsExitCancellation,requireSimulatedPerpsExitCancellation} from '../lib/perps-exit-cancellation-simulation.js';
import {reconcilePendingPerpsExitCancellations} from '../lib/perps-exit-cancellation-recovery.js';
import {createNativePerpsCloseExecutor} from '../lib/perps-close-executor.js';
import {authorizeServerPerpsExitCancellation,readOwnerSignedPerpsExitCancellation} from '../lib/perps-exit-cancellation-signing.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault,PERPS_CUSTODY_RESTORE_REVIEW_MARKER} from '../lib/perps-custody-vault.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
import {createServerPerpsExitCancellationBroadcaster} from '../lib/perps-exit-cancellation-broadcast.js';
import {createServerPerpsExitCleanupCoordinator} from '../lib/perps-exit-cleanup.js';
import {readServerPerpsTradeTransaction} from '../lib/perps-server-trade-transaction.js';
import {readJournalledPerpsCancellation,requireVerifiedPerpsCancellationHistory} from '../lib/perps-cancellation-history.js';
import {closePayoutFixture} from './helpers/perps-close-payout-fixture.mjs';
import {readFinalizedPerpsClosePayout} from '../lib/perps-close-payout-receipt.js';
import {verifyOwnerSignedPerpsCloseIntent} from '../lib/perps-close-execution-record.js';
import {conversionFixture} from './helpers/perps-conversion-fixture.mjs';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
import {readJournaledPerpsCloseConversion} from '../lib/perps-journal-close-conversion.js';
import {verifyOwnerSignedPerpsCloseConversionIntent} from '../lib/perps-close-conversion-record.js';
import {readFinalizedPerpsCloseConversionReceipt} from '../lib/perps-close-conversion-receipt.js';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',tokenProgram='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const baseIdentity=await deriveServerPerpsIdentities({walletAddress:wallet,asset:'SOL',side:'LONG'});
const derivedRequests=await Promise.all([1n,2n,3n].map(async counter=>{
 const bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(counter);
 return getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(baseIdentity.position),bytes,new Uint8Array([2])]});
}));
const keys=derivedRequests.map(([address])=>address),size='30000000';
const plan={sizeUsdUnits:size,exits:keys.slice(0,2).map((address,index)=>({address,kind:index?'TP':'SL',sizeUsdUnits:size,triggerPriceUsdUnits:index?'110000000':'95000000',counter:String(index+1)}))};
async function fixture(t,{yesterday=false,exitSize=size,exitAddress=keys[0],entrySize=size,failedExit=false,liveSibling=false,positionClosed=false}={}){
 const first=await historyTransaction({name:'InstantIncreasePositionEvent',nonce:4,threeSigners:true,fieldOverrides:{sizeUsdDelta:entrySize}});
 const second=await historyTransaction({name:'InstantIncreasePositionEvent',nonce:5,threeSigners:true,fieldOverrides:{sizeUsdDelta:size}});
 const exit=await historyTransaction({nonce:6,fieldOverrides:{sizeUsdDelta:exitSize,positionRequest:exitAddress}});
 if(failedExit)exit.tx.meta.err={InstructionError:[0,'InvalidArgument']};
 const transactions=[first,second,exit];if(yesterday)for(const value of transactions)value.tx.blockTime-=86400;
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset:'SOL',side:'LONG'});
 const sibling=Buffer.alloc(230);Buffer.from('0c26fac72e9a20d8','hex').copy(sibling);
 for(const [offset,key]of [[8,wallet],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,ids.position],[136,PERPS_CUSTODIES.USDC.mint]])Buffer.from(bs58.decode(key)).copy(sibling,offset);
 sibling.writeBigUInt64LE(1000n,168);sibling.writeBigUInt64LE(1001n,176);sibling.writeBigUInt64LE(BigInt(size),184);
 sibling[200]=2;sibling[201]=1;sibling[202]=1;sibling[206]=1;sibling.writeBigUInt64LE(110000000n,207);sibling[215]=1;sibling[216]=1;sibling[217]=1;sibling.writeBigUInt64LE(2n,220);sibling[228]=derivedRequests[1][1];
 const position=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(position);
 for(const [offset,key]of [[8,wallet],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,PERPS_CUSTODIES.SOL.address]])Buffer.from(bs58.decode(key)).copy(position,offset);
 position.writeBigUInt64LE(1000n,136);position.writeBigUInt64LE(1001n,144);position[152]=1;position.writeBigUInt64LE(100000000n,153);position.writeBigUInt64LE(30000000n,161);position.writeBigUInt64LE(10000000n,169);position[209]=ids.positionBump;
 const usdc=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(usdc);Buffer.from(bs58.decode(wallet)).copy(usdc,32);usdc.writeBigUInt64LE(100000000n,64);usdc[108]=1;
 const bank=[{owner:'11111111111111111111111111111111',executable:false,lamports:100000000,data:['','base64']},
  {owner:tokenProgram,executable:false,lamports:2039280,data:[usdc.toString('base64'),'base64']},...Array(6).fill(null)];
 if(!positionClosed)bank[6]={owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[position.toString('base64'),'base64']};
 const calls=[];let elapsed=0;
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return genesis;
  if(method==='getMultipleAccounts')return params[0].length===8?{context:{slot:500000},value:bank}:{context:{slot:500000},value:params[0].map(address=>liveSibling&&address===keys[1]?{owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[sibling.toString('base64'),'base64']}:null)};
  if(method==='getSlot')return 500000;
  if(method==='getBlocks')return [68000];
  if(method==='getBlockTime')return params[0]===500000?now/1000-5:now/1000-172800;
  if(method==='getFirstAvailableBlock')return 100;
  if(method==='getTransaction')return structuredClone(transactions.find(value=>value.signature===params[0])?.tx??null);
  if(method==='getSignatureStatuses')return {context:{slot:500000},value:params[0].map(signature=>{const value=transactions.find(value=>value.signature===signature);return value?{slot:value.tx.slot,confirmationStatus:'finalized',err:value.tx.meta.err}:null;})};
  if(method==='getSignaturesForAddress'){
   const list=[wallet,ids.position].includes(params[0])?transactions:params[0]===exitAddress?[exit]:[];
   return [...list].sort((a,b)=>b.tx.slot-a.tx.slot).map(value=>({signature:value.signature,slot:value.tx.slot,blockTime:value.tx.blockTime,err:value.tx.meta.err,confirmationStatus:'finalized'}));
  }
  throw Error('unexpected fixture-only read');
 };
 const directory=mkdtempSync(join(tmpdir(),'jamd-entry-close-')),path=join(directory,'journal.sqlite'),journal=openPerpsExecutionJournal(path,{now:()=>now});
 const resources=[];t.after(()=>{for(const close of resources.reverse())close();journal.close();rmSync(directory,{recursive:true,force:true});});
 const snapshot={walletAddress:wallet,network:'solana-mainnet',balancesComplete:true,observedAt:now,day:'2026-10-18',availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0};
 const limits={capitalUsd:'100',dailyLossUsd:'100',positions:10,dailyTrades:10};
 for(const [index,value]of [first,second].entries()){
  const reservationId='entry-'+index,entryExitPlan=index?{sizeUsdUnits:size,exits:[{...plan.exits[0],address:keys[2],counter:'3'}]}:plan;
  journal.reserve({walletAddress:wallet,signalId:reservationId,reservationId,positionAddress:ids.position,entryExitPlan,marginUsd:'10',limits,snapshot});journal.beginSigning(reservationId);
  const partial=Buffer.from(value.tx.transaction[0],'base64');partial.fill(0,65,129);
  const record={walletAddress:wallet,signature:value.signature,wireHash:createHash('sha256').update(partial).digest('hex')};
  journal.recordBroadcastIntent(reservationId,record);journal.reconcileBroadcast(reservationId,await readPerpsBroadcastReceipt(record,request,{now:()=>now}));
 }
 const readFinalizedAccount=()=>readServerPerpsDailyAccount({walletAddress:wallet},{request,now:()=>now,monotonicNow:()=>elapsed});
 const account=await readFinalizedAccount();
 return {journal,path,directory,closeResource:close=>resources.push(close),request,account,calls,first,second,exit,snapshot,limits,readFinalizedAccount,options:{request,readFinalizedAccount:async()=>account,now:()=>now},expire(){elapsed=10001;}};
}

async function custodyForCancellation(f){
 const allowNonPosixForTests=process.platform==='win32',common={allowNonPosixForTests,now:()=>now},ownerAccountHash='a'.repeat(64),state={mono:0,running:true};
 const directory=join(f.directory,'signing-wallets'),keys=join(f.directory,'signing-keys'),keyFile=join(keys,'master.key');
 for(const path of [f.directory,directory,keys]){if(path!==f.directory)mkdirSync(path,{mode:0o700});chmodSync(path,0o700);}
 createPerpsCustodyMasterKey(keyFile,common);
 // Build an encrypted deterministic UNFUNDED fixture record directly. The
 // production vault deliberately has no import/export or generic signer API.
 const key=readFileSync(keyFile),seed=Buffer.alloc(32,68),iv=randomBytes(12),purpose='jamddmaj-perps-automation';
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(JSON.stringify({version:1,purpose,ownerAccountHash,walletAddress:wallet})));
 const ciphertext=Buffer.concat([cipher.update(seed),cipher.final()]);key.fill(0);seed.fill(0);
 writeFileSync(join(directory,wallet+'.json'),JSON.stringify({version:1,purpose,ownerAccountHash,walletAddress:wallet,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')}),{flag:'wx',mode:0o600});
 const vault=openPerpsCustodyVault({directory,keyFile,...common}),controlsPath=join(f.directory,'signing-controls.sqlite'),controls=openPerpsAutomationControls(controlsPath,{now:()=>now});
 f.closeResource(()=>controls.close());const current=controls.provision({ownerAccountHash,walletAddress:wallet,settings:{capital:100,loss:50,positions:2,margin:10,leverage:3,dailyTrades:5}});
 for(const path of [controlsPath,f.path])chmodSync(path,0o600);
 const registry=openPerpsBackupRegistry(join(f.directory,'signing-backup.sqlite'),{...common,monotonicNow:()=>state.mono});f.closeResource(()=>registry.close());
 const operatorDirectory=join(f.directory,'operator'),operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 const archive=await createPerpsCustodyRecoveryArchive({directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,requireRestoreProof:true,...common,
  runtimePaths:{controlsPath,journalPath:f.path,temporaryDirectory:f.directory}});
 await registry.registerArchive(archive,{explicitOperatorApproval:true});
 const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory,destinationDirectory:join(f.directory,'restored'),explicitOperatorApproval:true,...common});
 registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
 const readAccount=()=>readServerPerpsAccount({walletAddress:wallet},{request:f.request,now:()=>now,monotonicNow:()=>state.mono});
 return {vault,controls,registry,archive,state,directory,ownerAccountHash,args:{controls,journal:f.journal,backupRegistry:registry,readAccount,
  isExecutionRunning:()=>state.running,ownerAccountHash,walletAddress:wallet,controlRevision:current.revision,monotonicNow:()=>state.mono}};
}

test('one request-bound full-size exit closes only its own logical entry while the same pair remains open',async t=>{
 const f=await fixture(t),row=f.journal.read('entry-0'),proof=await readServerPerpsPositionClosure(row,f.options);
 assert.equal(proof.stage,'FINALIZED_INDIVIDUAL_ENTRY_CLOSED');assert.equal(f.account.positions.length,1);assert.equal(proof.exitRequestAddress,keys[0]);
 assert.throws(()=>f.journal.reconcileClosedPosition('entry-0',{...proof}));assert.throws(()=>f.journal.reconcileClosedPosition('entry-1',proof));
 assert.equal(f.journal.reconcileClosedPosition('entry-0',proof).state,'CLOSED');assert.equal(f.journal.read('entry-1').state,'OPEN');
 assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'10000000');assert.equal(f.journal.riskState(wallet).executedToday,2);
 assert.throws(()=>f.journal.reconcileClosedPosition('entry-0',proof));
 assert.equal(await readServerPerpsPositionClosure(f.journal.read('entry-1'),f.options),null);
 assert.throws(()=>f.journal.reserve({walletAddress:wallet,signalId:'third',reservationId:'third',positionAddress:row.position_address,marginUsd:'10',limits:{...f.limits,dailyTrades:2},snapshot:f.account}),/DAILY_TRADE_LIMIT/);
});

test('restart can reconcile a previous-day bound exit without pretending old P/L belongs to today',async t=>{
 const f=await fixture(t,{yesterday:true});assert.equal(f.account.transactions.length,0);
 const reopened=openPerpsExecutionJournal(f.path,{now:()=>now});
 try{
  const result=await reconcileClosedServerPerpsPositions(reopened,wallet,f.options);
  assert.equal(result.closed,1);assert.equal(result.stillOpen,1);assert.equal(reopened.read('entry-0').day,'2026-10-17');
  assert.equal(reopened.riskState(wallet).executedToday,0);assert.equal(f.account.lossTodayUsdcUnits,'0');
 }finally{reopened.close();}
 assert.ok(f.calls.some(call=>call.method==='getSignaturesForAddress'&&call.params[0]===keys[0]));
});

test('partial, failed or unrelated exits and still-live sibling orders never free a logical trade slot',async t=>{
 for(const options of [{exitSize:'29999999'},{exitAddress:keys[2]},{failedExit:true}]){
  const f=await fixture(t,options),proof=await readServerPerpsPositionClosure(f.journal.read('entry-0'),f.options);
  assert.equal(proof,null);assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 }
 const pending=await fixture(t,{liveSibling:true});
 await assert.rejects(readServerPerpsPositionClosure(pending.journal.read('entry-0'),pending.options),/PERPS_EXIT_CLEANUP_REQUIRED/);
 assert.equal(pending.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
});

test('wrong actual entry size, stale evidence and unverified account copies cannot prove closure',async t=>{
 const wrong=await fixture(t,{entrySize:'29999999'});await assert.rejects(readServerPerpsPositionClosure(wrong.journal.read('entry-0'),wrong.options));
 const f=await fixture(t),proof=await readServerPerpsPositionClosure(f.journal.read('entry-0'),f.options);
 await assert.rejects(readServerPerpsPositionClosure(f.journal.read('entry-0'),{...f.options,readFinalizedAccount:async()=>({...f.account})}));
 f.expire();assert.throws(()=>f.journal.reconcileClosedPosition('entry-0',proof));assert.equal(f.journal.read('entry-0').state,'OPEN');
});

test('exit requests are globally single-entry bound, invalid plans roll back and legacy reservations remain readable',async t=>{
 const f=await fixture(t),row=f.journal.read('entry-0');assert.equal(row.entry_exit_plan,canonicalServerPerpsEntryExitPlan(plan));
 const args={walletAddress:wallet,signalId:'duplicate',reservationId:'duplicate',positionAddress:row.position_address,entryExitPlan:plan,marginUsd:'10',limits:f.limits,snapshot:f.snapshot};
 assert.throws(()=>f.journal.reserve(args));assert.equal(f.journal.read('duplicate'),null);
 assert.throws(()=>canonicalServerPerpsEntryExitPlan({...plan,sizeUsdUnits:'0'}));
 assert.throws(()=>canonicalServerPerpsEntryExitPlan({...plan,exits:[plan.exits[0],plan.exits[0]]}));
 assert.throws(()=>canonicalServerPerpsEntryExitPlan({...plan,exits:[{...plan.exits[0],sizeUsdUnits:'1'}]}));
 assert.equal(f.journal.reserve({...args,signalId:'legacy',reservationId:'legacy',entryExitPlan:null}).entry_exit_plan,null);
});

test('whole-position closure also waits for sibling orders instead of forgetting a future trigger',async t=>{
 const pending=await fixture(t,{positionClosed:true,liveSibling:true});
 await assert.rejects(readServerPerpsPositionClosure(pending.journal.read('entry-0'),pending.options),/PERPS_EXIT_CLEANUP_REQUIRED/);
 const changedRecord={...pending.journal.read('entry-0'),entry_exit_plan:canonicalServerPerpsEntryExitPlan({sizeUsdUnits:size,exits:[]})};
 const unrelatedPlan=await readServerPerpsPositionClosure(changedRecord,pending.options);
 assert.throws(()=>pending.journal.reconcileClosedPosition('entry-0',unrelatedPlan),/VERIFIED_RECONCILIATION_REQUIRED/);
 assert.equal(pending.journal.read('entry-0').state,'OPEN');
 const closed=await fixture(t,{positionClosed:true});
 assert.equal((await readServerPerpsPositionClosure(closed.journal.read('entry-0'),closed.options)).stage,'FINALIZED_WHOLE_POSITION_CLOSED');
 const legacy={...closed.journal.read('entry-0'),entry_exit_plan:null};
 assert.equal(await readServerPerpsPositionClosure(legacy,closed.options),null);
});

test('orphan discovery proves a finalized closed entry and its exact native pending sibling without releasing journal risk',async t=>{
 for(const positionClosed of [false,true]){
  const f=await fixture(t,{liveSibling:true,positionClosed}),row=f.journal.read('entry-0');
  const proof=await readServerPerpsExitCleanup(row,f.options);
  assert.equal(requireVerifiedServerPerpsExitCleanup(proof),proof);assert.throws(()=>requireVerifiedServerPerpsExitCleanup({...proof}));
  assert.equal(proof.stage,'FINALIZED_ENTRY_EXIT_CLEANUP_REQUIRED');assert.equal(proof.readyForSigning,false);
  assert.equal(proof.closureStage,positionClosed?'FINALIZED_WHOLE_POSITION_CLOSED':'FINALIZED_INDIVIDUAL_ENTRY_CLOSED');
  assert.deepEqual(proof.pendingExits.map(exit=>({address:exit.address,kind:exit.kind,counter:exit.counter})),[{address:keys[1],kind:'TP',counter:'2'}]);
  assert.equal(proof.requestObservedSlot,500000);assert.ok(Object.isFrozen(proof.pendingExits));
  assert.throws(()=>requireVerifiedServerPerpsPositionClosure(proof));assert.throws(()=>f.journal.reconcileClosedPosition('entry-0',proof));
  assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
  assert.equal(await readServerPerpsExitCleanup(f.journal.read('entry-1'),f.options),null);
  assert.ok(f.calls.every(call=>!['sendTransaction','simulateTransaction'].includes(call.method)));
  f.expire();assert.throws(()=>requireVerifiedServerPerpsExitCleanup(proof));
 }
 const closed=await fixture(t);assert.equal(await readServerPerpsExitCleanup(closed.journal.read('entry-0'),closed.options),null);
 const partial=await fixture(t,{liveSibling:true,exitSize:'29999999'});assert.equal(await readServerPerpsExitCleanup(partial.journal.read('entry-0'),partial.options),null);
});

test('orphan discovery rejects altered native owner, position, size, trigger, counter, executed state and stale banks',async t=>{
 const f=await fixture(t,{liveSibling:true});
 for(const offset of [8,40,72,104,136,184,200,201,202,207,216,218,220,228]){
  const request=async(method,params)=>{const result=await f.request(method,params);
   if(method==='getMultipleAccounts'&&params[0].length===2){const native=result.value[1],bytes=Buffer.from(native.data[0],'base64');bytes[offset]^=1;native.data[0]=bytes.toString('base64');}
   return result;
  };
  await assert.rejects(readServerPerpsExitCleanup(f.journal.read('entry-0'),{...f.options,request}));
 }
 const request=async(method,params)=>{const result=await f.request(method,params);if(method==='getMultipleAccounts'&&params[0].length===2)result.context.slot=499999;return result;};
 await assert.rejects(readServerPerpsExitCleanup(f.journal.read('entry-0'),{...f.options,request}));
 assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
});

test('cancellation inspection binds exact orphan, derived return ATAs and legacy or RPC-resolved v0 accounts without signing',async t=>{
 const f=await fixture(t,{liveSibling:true}),cleanup=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options);
 for(const versioned of [false,true])for(const legacyClose of [false,true])for(const createAta of [false,true])for(const readonlyKeeper of legacyClose?[false,true]:[false]){
  const c=await cancellationFixture(cleanup,{versioned,legacyClose,createAta,readonlyKeeper});
  const value=await inspectServerPerpsExitCancellation(c.preparation,cleanup,c);
  assert.equal(requireInspectedPerpsExitCancellation(value),value);assert.throws(()=>requireInspectedPerpsExitCancellation({...value}));
  assert.equal(value.exitAddress,keys[1]);assert.equal(value.reservationId,'entry-0');assert.equal(value.positionAddress,baseIdentity.position);
  assert.equal(value.readyForSigning,false);assert.equal(value.requiresSameWireSimulation,true);assert.equal(value.requiresDurableCancellationRecord,true);
  assert.ok(c.calls.every(call=>['getGenesisHash','getSlot','getMultipleAccounts'].includes(call.method)));
  assert.equal(c.calls.find(call=>call.method==='getSlot').params[0].minContextSlot,cleanup.requestObservedSlot);
 }
 assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');assert.equal(f.journal.read('entry-0').state,'OPEN');
 const c=await cancellationFixture(cleanup);await assert.rejects(inspectServerPerpsExitCancellation(c.preparation,{...cleanup},c));
 await assert.rejects(inspectServerPerpsExitCancellation(c.preparation,cleanup,{...c,exitAddress:keys[2]}));
 const readonly=await cancellationFixture(cleanup,{readonlyKeeper:true});await assert.rejects(inspectServerPerpsExitCancellation(readonly.preparation,cleanup,readonly));
 f.expire();await assert.rejects(inspectServerPerpsExitCancellation(c.preparation,cleanup,c));
});

test('cancellation inspection rejects foreign roles, duplicate cancellation, transfer instructions and incorrect native discriminator',async t=>{
 const f=await fixture(t,{liveSibling:true}),cleanup=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options);
 const changes=[
  ...[0,1,2,3,4,5,6,7,8,9,10,11,12].map(role=>ctx=>{const ix=ctx.instructions.at(-1),mintIndex=ctx.index(ctx.mint);ix.accounts[role]=ix.accounts[role]===mintIndex?0:mintIndex;}),
  ctx=>{ctx.instructions.at(-1).data=Buffer.from('ca671b324c72017f','hex');},
  ctx=>{ctx.instructions.at(-1).data=Buffer.concat([ctx.instructions.at(-1).data,Buffer.from([0])]);},
  ctx=>{ctx.instructions.push({...ctx.instructions.at(-1)});},
  ctx=>{ctx.instructions.push({program:ctx.index(tokenProgram),accounts:[0],data:Buffer.from([9])});},
  ctx=>{ctx.instructions[2].data=Buffer.from([0]);},
  ctx=>{ctx.instructions[2].accounts[1]=ctx.index(ctx.requestAta);}
 ];
 for(const mutate of changes){
  const c=await cancellationFixture(cleanup,{createAta:true,mutate});
  await assert.rejects(inspectServerPerpsExitCancellation(c.preparation,cleanup,c));
 }
 for(const kind of ['foreign-network','stale-table']){
  const c=await cancellationFixture(cleanup,{versioned:true}),request=async(method,params)=>{
   const value=await c.request(method,params);if(kind==='foreign-network'&&method==='getGenesisHash')return 'wrong';
   if(kind==='stale-table'&&method==='getMultipleAccounts')return {...value,context:{slot:cleanup.requestObservedSlot-1}};return value;
  };
  await assert.rejects(inspectServerPerpsExitCancellation(c.preparation,cleanup,{...c,request}));
 }
 assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
});

async function inspectedCancellation(f,{newOwnerAta=false,versioned=false}={}){
 const cleanup=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options),c=await cancellationFixture(cleanup,{createAta:newOwnerAta,versioned});
 const inspection=await inspectServerPerpsExitCancellation(c.preparation,cleanup,c);
 const native=(await f.request('getMultipleAccounts',[plan.exits.map(exit=>exit.address),{}])).value[1];
 const position=(await f.request('getMultipleAccounts',[Array(8).fill(wallet),{}])).value[6];
 return {c,inspection,options:{requestAccount:native,positionAccount:position,newOwnerAta}};
}

async function signedCancellation(f){
 const custody=await custodyForCancellation(f),{inspection,options}=await inspectedCancellation(f),simFixture=cancellationSimulationFixture(inspection,options);
 const simulation=await simulateServerPerpsExitCancellation(inspection,simFixture),hooks={onRead:null,reads:0};
 f.journal.beginExitCancellation('broadcast-cancel',simulation);
 const base=custody.args.readAccount,grant=await authorizeServerPerpsExitCancellation(simulation,{...custody.args,cancellationId:'broadcast-cancel',request:simFixture.request,
  readAccount:async input=>{const value=await base(input);hooks.reads++;if(hooks.onRead)await hooks.onRead();return value;}});
 return {custody,inspection,simulation,simFixture,hooks,signed:custody.vault.signExitCancellation(grant),
  args:{ownerAccountHash:custody.ownerAccountHash,controlRevision:custody.args.controlRevision}};
}

async function cleanupCoordinatorFixture(f,{mode='ok'}={}){
 const custody=await custodyForCancellation(f),cleanup=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options),c=await cancellationFixture(cleanup);
 const inspection=await inspectServerPerpsExitCancellation(c.preparation,cleanup,c),native=(await f.request('getMultipleAccounts',[plan.exits.map(exit=>exit.address),{}])).value[1];
 const position=(await f.request('getMultipleAccounts',[Array(8).fill(wallet),{}])).value[6];
 const simulation=cancellationSimulationFixture(inspection,{requestAccount:native,positionAccount:position}),calls={builder:0,signer:0,send:0};
 const request=async(method,params)=>{
  if(['getSignatureStatuses','getTransaction','getSignaturesForAddress'].includes(method))return f.request(method,params);
  if(method==='getMultipleAccounts'&&(params[0].length===8||params[0][0]===keys[0]||params[0][0]===f.manual?.c.address))return f.request(method,params);
  return simulation.request(method,params);
 };
 const coordinator=createServerPerpsExitCleanupCoordinator({controls:custody.controls,journal:f.journal,backupRegistry:custody.registry,
  vault:{describe:identity=>custody.vault.describe(identity),signExitCancellation:grant=>{calls.signer++;if(mode==='signer-failure')throw Error('unknown signer failure');return custody.vault.signExitCancellation(grant);}},
  rpcRequest:request,readFinalizedAccount:async()=>f.account,
  readAccount:mode==='poor'?()=>readServerPerpsAccount({walletAddress:wallet},{now:()=>now,monotonicNow:()=>0,request:async(method,params)=>{
   const response=await f.request(method,params);if(method==='getMultipleAccounts'&&params[0].length===8){response.value=structuredClone(response.value);response.value[0].lamports=1000;}return response;
  }}):custody.args.readAccount,
  isExecutionRunning:()=>custody.state.running,now:()=>now,monotonicNow:()=>0,
  builderRequest:async(url,options)=>{calls.builder++;assert.equal(url,'https://perps-api.jup.ag/v2/tpsl');assert.equal(options.method,'DELETE');assert.equal(options.redirect,'error');
   assert.deepEqual(JSON.parse(options.body),{positionRequestPubkey:keys[1]});
   if(mode==='changed-controls'){const state=custody.controls.read({ownerAccountHash:custody.ownerAccountHash,walletAddress:wallet});custody.controls.save({ownerAccountHash:custody.ownerAccountHash,walletAddress:wallet,expectedRevision:state.revision,settings:{...state.settings,dailyTrades:4}});}
   return Response.json({...c.preparation,requireKeeperSignature:mode!=='bad-builder',transactionType:'legacy'});
  },
  fetchImpl:async(url,options)=>{calls.send++;assert.equal(url,'https://perps-api.jup.ag/v2/transaction/execute');assert.equal(JSON.parse(options.body).action,'cancel-tpsl');
   const [row]=f.journal.pendingExitCancellations(wallet);assert.equal(row.state,'UNCERTAIN');if(mode==='send-failure')throw Error('private service details');
   return Response.json({action:'cancel-tpsl',txid:row.signature});}
 });
 return {coordinator,custody,calls,inspection,args:{ownerAccountHash:custody.ownerAccountHash,walletAddress:wallet}};
}

test('exact-wire orphan cancellation simulation returns all USDC and rent, preserves pool/positions and grants no authority',async t=>{
 for(const positionClosed of [false,true])for(const newOwnerAta of [false,true])for(const versioned of [false,true])for(const requestTokens of [0n,2500000n]){
  const f=await fixture(t,{liveSibling:true,positionClosed}),{c,inspection,options}=await inspectedCancellation(f,{newOwnerAta,versioned});
  const simulation=cancellationSimulationFixture(inspection,{...options,requestTokens});
  c.preparation.txMetadata.lastValidBlockHeight='1'; // Inspection owns its metadata snapshot.
  const value=await simulateServerPerpsExitCancellation(inspection,simulation);
  assert.equal(requireSimulatedPerpsExitCancellation(value),value);assert.throws(()=>requireSimulatedPerpsExitCancellation({...value}));
  assert.equal(value.stage,'EXIT_CANCELLATION_SIMULATED_NOT_AUTHORIZED');assert.equal(value.readyForSigning,false);assert.equal(value.returnedUsdcUnits,requestTokens.toString());
  assert.equal(value.addedOwnerAtaRentLamports,newOwnerAta?'2039280':'0');assert.equal(value.recoveredRentLamports,'4039280');
  const sent=simulation.calls.filter(call=>call.method==='simulateTransaction');assert.equal(sent.length,1);assert.equal(sent[0].params[0],inspection.envelope.serializedTxBase64);
  assert.equal(sent[0].params[1].sigVerify,false);assert.equal(sent[0].params[1].replaceRecentBlockhash,false);
  assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');assert.equal(f.journal.read('entry-0').state,'OPEN');
  assert.ok(simulation.calls.every(call=>!['sendTransaction','requestAirdrop'].includes(call.method)));
  f.expire();assert.throws(()=>requireSimulatedPerpsExitCancellation(value));
 }
});

test('cancellation effects reject missing closures, diverted balances, altered native request, position, fees and expired evidence',async t=>{
 const f=await fixture(t,{liveSibling:true}),{inspection,options}=await inspectedCancellation(f);
 const tamperData=(account,offset)=>{const data=Buffer.from(account.data[0],'base64');data[offset]^=1;account.data[0]=data.toString('base64');};
 const mutations=[
  s=>{s.after[inspection.exitAddress]=structuredClone(s.before[inspection.exitAddress]);},
  s=>{s.after[inspection.requestAta]=structuredClone(s.before[inspection.requestAta]);},
  s=>{s.after[inspection.walletAddress].lamports--;},s=>{s.after[inspection.walletAddress].lamports++;},
  s=>{tamperData(s.after[inspection.ownerAta],64);},s=>{tamperData(s.after[inspection.ownerAta],72);},
  s=>{s.after[inspection.resolvedKeys[1]].lamports++;},s=>{tamperData(s.after[PERPS_POOL],0);},
  s=>{tamperData(s.after[inspection.positionAddress],161);},s=>{tamperData(s.before[inspection.exitAddress],220);},
  s=>{s.before[PERPS_POOL].owner=wallet;s.after[PERPS_POOL].owner=wallet;},
  s=>{s.before[inspection.positionAddress].owner=wallet;s.after[inspection.positionAddress].owner=wallet;},
  s=>{tamperData(s.before[inspection.requestAta],72);},
  s=>{s.after[inspection.ownerAta].lamports++;},s=>{s.fee=1000001;},s=>{s.fee=null;},
  s=>{s.slot=499999;},s=>{s.height=600001;},s=>{s.err={InstructionError:[0,'InvalidArgument']};},
  s=>{s.replacementBlockhash={blockhash:wallet,lastValidBlockHeight:600002};},s=>{s.unitsConsumed=200001;}
 ];
 for(const change of mutations){const simulation=cancellationSimulationFixture(inspection,options);change(simulation.state);await assert.rejects(simulateServerPerpsExitCancellation(inspection,simulation));}
 const newer=await inspectedCancellation(f,{newOwnerAta:true}),badRent=cancellationSimulationFixture(newer.inspection,newer.options);badRent.state.rent++;
 await assert.rejects(simulateServerPerpsExitCancellation(newer.inspection,badRent));
 const expired=cancellationSimulationFixture(inspection,options),request=async(method,params)=>{const value=await expired.request(method,params);if(method==='simulateTransaction')f.expire();return value;};
 await assert.rejects(simulateServerPerpsExitCancellation(inspection,{request}));assert.equal(f.journal.read('entry-0').state,'OPEN');
 await assert.rejects(simulateServerPerpsExitCancellation({...inspection},expired));
});

test('durable cancellation attempts survive restart, never resend unknown signatures and release no parent risk on acknowledgement',async t=>{
 const f=await fixture(t,{liveSibling:true}),{inspection,options}=await inspectedCancellation(f),simulation=await simulateServerPerpsExitCancellation(inspection,cancellationSimulationFixture(inspection,options));
 assert.throws(()=>f.journal.beginExitCancellation('forged',{...simulation}));
 const first=f.journal.beginExitCancellation('cancel-1',simulation);assert.equal(first.state,'PREPARED');f.journal.beginExitCancellationSigning('cancel-1',simulation);
 assert.throws(()=>f.journal.beginExitCancellation('cancel-2',simulation));assert.throws(()=>f.journal.cancelUnsigned('cancel-1'));
 const reopened=openPerpsExecutionJournal(f.path,{now:()=>now});
 try{
  assert.equal(reopened.pendingExitCancellations(wallet).length,1);
  assert.throws(()=>reopened.reserve({walletAddress:wallet,signalId:'blocked-new-entry',reservationId:'blocked-new-entry',marginUsd:'10',limits:f.limits,snapshot:f.snapshot}),/RECONCILIATION_REQUIRED/);
  const manual=await reconcilePendingPerpsExitCancellations(reopened,wallet,{request:async()=>{throw Error('must not read without a signature');},now:()=>now});
  assert.equal(manual.manualReview,1);assert.equal(manual.checked,0);
  const receipt=cancellationReceiptFixture(inspection,now,{confirmationStatus:'confirmed'});
  assert.equal(reopened.recordExitCancellationBroadcastIntent('cancel-1',receipt.record).state,'UNCERTAIN');
  assert.throws(()=>reopened.recordExitCancellationBroadcastIntent('cancel-1',receipt.record));
  const unknown=await reconcilePendingPerpsExitCancellations(reopened,wallet,{request:async(method,params)=>method==='getSignatureStatuses'?{context:{slot:500010},value:[null]}:receipt.request(method,params),now:()=>now});
  assert.equal(unknown.unresolved,1);assert.equal(reopened.readExitCancellation('cancel-1').state,'UNCERTAIN');
  const confirmedOnly=await readPerpsBroadcastReceipt(receipt.record,receipt.request,{now:()=>now});assert.throws(()=>reopened.reconcileExitCancellation('cancel-1',confirmedOnly));
  assert.equal((await reconcilePendingPerpsExitCancellations(reopened,wallet,{request:receipt.request,now:()=>now})).unresolved,1);
  const closure=await readServerPerpsPositionClosure(f.journal.read('entry-0'),{...f.options,request:async(method,params)=>{
   if(method==='getMultipleAccounts'&&params[0].length===2)return {context:{slot:500000},value:[null,null]};return f.request(method,params);
  }});
  assert.throws(()=>reopened.reconcileClosedPosition('entry-0',closure));
  receipt.status.confirmationStatus='finalized';const finalized=await readPerpsBroadcastReceipt(receipt.record,receipt.request,{now:()=>now,requireFinalized:true});
  assert.throws(()=>reopened.reconcileExitCancellation('cancel-1',{...finalized}));
  assert.equal((await reconcilePendingPerpsExitCancellations(reopened,wallet,{request:receipt.request,now:()=>now})).confirmed,1);
  assert.equal(reopened.readExitCancellation('cancel-1').state,'CONFIRMED');assert.equal(reopened.read('entry-0').state,'OPEN');
  assert.equal(reopened.riskState(wallet).activeMarginUsdcUnits,'20000000');
  assert.equal(reopened.reconcileClosedPosition('entry-0',closure).state,'CLOSED');assert.equal(reopened.riskState(wallet).activeMarginUsdcUnits,'10000000');
  assert.ok(receipt.calls.every(call=>!['sendTransaction','simulateTransaction'].includes(call.method)));
 }finally{reopened.close();}
});

test('only finalized cancellation failure allows a fresh separately recorded attempt; late absence cannot predate confirmation',async t=>{
 const f=await fixture(t,{liveSibling:true}),{inspection,options}=await inspectedCancellation(f),simulation=await simulateServerPerpsExitCancellation(inspection,cancellationSimulationFixture(inspection,options));
 f.journal.beginExitCancellation('failed-attempt',simulation);
 f.journal.beginExitCancellationSigning('failed-attempt',simulation);
 const receipt=cancellationReceiptFixture(inspection,now,{err:{InstructionError:[2,'Custom']}});
 f.journal.recordExitCancellationBroadcastIntent('failed-attempt',receipt.record);
 assert.equal((await reconcilePendingPerpsExitCancellations(f.journal,wallet,{request:receipt.request,now:()=>now})).failed,1);
 assert.equal(f.journal.read('entry-0').state,'OPEN');assert.throws(()=>f.journal.beginExitCancellation('cached-attempt',simulation));assert.equal(f.journal.readExitCancellation('cached-attempt'),null);
 const cleanup=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options),fresh=await cancellationFixture(cleanup,{blockhashByte:30});
 const freshInspection=await inspectServerPerpsExitCancellation(fresh.preparation,cleanup,fresh),freshSimulation=await simulateServerPerpsExitCancellation(freshInspection,cancellationSimulationFixture(freshInspection,options));
 assert.equal(f.journal.beginExitCancellation('new-attempt',freshSimulation).state,'PREPARED');assert.throws(()=>f.journal.beginExitCancellationSigning('new-attempt',simulation));
 f.journal.beginExitCancellationSigning('new-attempt',freshSimulation);
 // The exact previously attempted transaction identity may never be reused.
 assert.throws(()=>f.journal.recordExitCancellationBroadcastIntent('new-attempt',receipt.record));
 assert.equal(f.journal.readExitCancellation('new-attempt').state,'SIGNING');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 const g=await fixture(t,{liveSibling:true}),next=await inspectedCancellation(g),second=await simulateServerPerpsExitCancellation(next.inspection,cancellationSimulationFixture(next.inspection,next.options));
 g.journal.beginExitCancellation('later-confirmation',second);g.journal.beginExitCancellationSigning('later-confirmation',second);const late=cancellationReceiptFixture(next.inspection,now,{slot:500001});
 g.journal.recordExitCancellationBroadcastIntent('later-confirmation',late.record);
 await reconcilePendingPerpsExitCancellations(g.journal,wallet,{request:late.request,now:()=>now});
 const earlier=await readServerPerpsPositionClosure(g.journal.read('entry-0'),{...g.options,request:async(method,params)=>method==='getMultipleAccounts'&&params[0].length===2?{context:{slot:500000},value:[null,null]}:g.request(method,params)});
 assert.throws(()=>g.journal.reconcileClosedPosition('entry-0',earlier));assert.equal(g.journal.read('entry-0').state,'OPEN');
});

test('exclusive fixture vault consumes only a one-use cancellation grant and preserves all non-owner bytes',async t=>{
 const f=await fixture(t,{liveSibling:true}),custody=await custodyForCancellation(f),{inspection,options}=await inspectedCancellation(f);
 const simFixture=cancellationSimulationFixture(inspection,options),simulation=await simulateServerPerpsExitCancellation(inspection,simFixture);
 f.journal.beginExitCancellation('owner-cancel',simulation);
 const grant=await authorizeServerPerpsExitCancellation(simulation,{...custody.args,cancellationId:'owner-cancel',request:simFixture.request});
 assert.equal(custody.controls.read({ownerAccountHash:custody.ownerAccountHash,walletAddress:wallet}).enabled,false);
 assert.throws(()=>custody.vault.signExitCancellation({...grant}));assert.throws(()=>custody.vault.signPrepared(grant));
 const signed=custody.vault.signExitCancellation(grant),envelope=readOwnerSignedPerpsExitCancellation(signed,{journal:f.journal});
 assert.equal(signed.readyForBroadcast,false);assert.equal(signed.exitAddress,keys[1]);assert.throws(()=>custody.vault.signExitCancellation(grant));
 const original=Buffer.from(inspection.envelope.serializedTxBase64,'base64'),wire=Buffer.from(envelope.signedBase64,'base64');
 assert.ok(wire.subarray(65).equals(original.subarray(65)));assert.ok(wire.subarray(65,129).every(n=>n===0));
 assert.equal(signed.wireHash,createHash('sha256').update(wire).digest('hex'));assert.throws(()=>readOwnerSignedPerpsExitCancellation({...signed}));
 assert.equal(f.journal.readExitCancellation('owner-cancel').state,'SIGNING');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 custody.registry.revokeArchive({archiveSha256:custody.archive.sha256,explicitOperatorApproval:true});assert.throws(()=>readOwnerSignedPerpsExitCancellation(signed));
});

test('cancellation authority rejects missing runtime approval, forged bank/backup, changed owner, clock expiry and restore quarantine',async t=>{
 const f=await fixture(t,{liveSibling:true}),custody=await custodyForCancellation(f),{inspection,options}=await inspectedCancellation(f);
 const simFixture=cancellationSimulationFixture(inspection,options),simulation=await simulateServerPerpsExitCancellation(inspection,simFixture);
 f.journal.beginExitCancellation('gated-cancel',simulation);const args={...custody.args,cancellationId:'gated-cancel',request:simFixture.request};
 for(const change of [{isExecutionRunning:()=>false},{ownerAccountHash:'b'.repeat(64)},{backupRegistry:{readVerified:()=>({backupVerified:true})}},
  {readAccount:async()=>({...await custody.args.readAccount()})},{walletAddress:keys[2]}])await assert.rejects(authorizeServerPerpsExitCancellation(simulation,{...args,...change}));
 const expired=await authorizeServerPerpsExitCancellation(simulation,args);custody.state.mono=2001;assert.throws(()=>custody.vault.signExitCancellation(expired));custody.state.mono=0;
 await assert.rejects(authorizeServerPerpsExitCancellation(simulation,args)); // Never mint another grant after SIGNING, even if unused/expired.
 const g=await fixture(t,{liveSibling:true}),restored=await custodyForCancellation(g),next=await inspectedCancellation(g),nextFixture=cancellationSimulationFixture(next.inspection,next.options);
 const nextSimulation=await simulateServerPerpsExitCancellation(next.inspection,nextFixture);g.journal.beginExitCancellation('quarantine-cancel',nextSimulation);
 const quarantined=await authorizeServerPerpsExitCancellation(nextSimulation,{...restored.args,cancellationId:'quarantine-cancel',request:nextFixture.request});
 writeFileSync(join(restored.directory,PERPS_CUSTODY_RESTORE_REVIEW_MARKER),'{}',{mode:0o600});assert.throws(()=>restored.vault.signExitCancellation(quarantined));
 assert.equal(f.journal.readExitCancellation('gated-cancel').state,'SIGNING');
});

test('cancellation grant rechecks native state, SOL funding, controls and backup after asynchronous reads',async t=>{
 const f=await fixture(t,{liveSibling:true}),custody=await custodyForCancellation(f),{inspection,options}=await inspectedCancellation(f);
 const simFixture=cancellationSimulationFixture(inspection,options),simulation=await simulateServerPerpsExitCancellation(inspection,simFixture);
 f.journal.beginExitCancellation('recheck-cancel',simulation);
 const args={...custody.args,cancellationId:'recheck-cancel',request:simFixture.request};
 const poor=()=>readServerPerpsAccount({walletAddress:wallet},{now:()=>now,monotonicNow:()=>0,request:async(method,params)=>{
  const response=await f.request(method,params);if(method==='getMultipleAccounts'&&params[0].length===8){response.value=structuredClone(response.value);response.value[0].lamports=1000;}return response;
 }});
 await assert.rejects(authorizeServerPerpsExitCancellation(simulation,{...args,readAccount:poor}));
 const changedState=async input=>{const account=await custody.args.readAccount(input);custody.state.running=false;return account;};
 await assert.rejects(authorizeServerPerpsExitCancellation(simulation,{...args,readAccount:changedState}));custody.state.running=true;
 const changedNative=async input=>{const account=await custody.args.readAccount(input),native=simFixture.state.before[inspection.exitAddress],data=Buffer.from(native.data[0],'base64');data[220]^=1;native.data[0]=data.toString('base64');return account;};
 await assert.rejects(authorizeServerPerpsExitCancellation(simulation,{...args,readAccount:changedNative}));
 simFixture.state.before[inspection.exitAddress]=structuredClone(options.requestAccount);
 const revision=async input=>{const account=await custody.args.readAccount(input);const state=custody.controls.read({ownerAccountHash:custody.ownerAccountHash,walletAddress:wallet});
  custody.controls.save({ownerAccountHash:custody.ownerAccountHash,walletAddress:wallet,expectedRevision:state.revision,settings:{...state.settings,dailyTrades:4}});return account;};
 await assert.rejects(authorizeServerPerpsExitCancellation(simulation,{...args,readAccount:revision}));
 args.controlRevision=custody.controls.read({ownerAccountHash:custody.ownerAccountHash,walletAddress:wallet}).revision;
 const revoked=async input=>{const account=await custody.args.readAccount(input);custody.registry.revokeArchive({archiveSha256:custody.archive.sha256,explicitOperatorApproval:true});return account;};
 await assert.rejects(authorizeServerPerpsExitCancellation(simulation,{...args,readAccount:revoked}));
 assert.equal(f.journal.readExitCancellation('recheck-cancel').signature,null);assert.equal(f.journal.read('entry-0').state,'OPEN');
});

test('cancellation broadcaster persists exact identity before its sole attempt and acknowledgement never closes a position',async t=>{
 const f=await fixture(t,{liveSibling:true}),s=await signedCancellation(f);let calls=0;
 const before=readOwnerSignedPerpsExitCancellation(s.signed).signedBase64;
 const submit=createServerPerpsExitCancellationBroadcaster({journal:f.journal,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://perps-api.jup.ag/v2/transaction/execute');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  assert.deepEqual(JSON.parse(options.body),{action:'cancel-tpsl',serializedTxBase64:before});
  const row=f.journal.readExitCancellation('broadcast-cancel');assert.equal(row.state,'UNCERTAIN');assert.equal(row.signature,s.signed.signature);assert.equal(row.wire_hash,s.signed.wireHash);
  return Response.json({action:'cancel-tpsl',txid:s.signed.signature});
 }});
 const result=await submit(s.signed,s.args);assert.equal(result.stage,'CANCELLATION_BROADCAST_ACKNOWLEDGED');assert.equal(result.state,'UNCERTAIN');assert.equal(result.readyForRetry,false);
 assert.equal(calls,1);assert.equal(s.hooks.reads,2);assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 await assert.rejects(submit(s.signed,s.args));assert.equal(calls,1);
});

test('cancellation transport exceptions and malformed acknowledgements retain uncertainty without automatic retries',async t=>{
 for(const mode of ['throw','wrong-action','wrong-signature','private-error','bad-json','large-body','html']){
  const f=await fixture(t,{liveSibling:true}),s=await signedCancellation(f);let calls=0;
  const submit=createServerPerpsExitCancellationBroadcaster({journal:f.journal,fetchImpl:async()=>{
   calls++;if(mode==='throw')throw Error('private network details');
   if(mode==='wrong-action')return Response.json({action:'increase-position',txid:s.signed.signature});
   if(mode==='wrong-signature')return Response.json({action:'cancel-tpsl',txid:wallet});
   if(mode==='private-error')return Response.json({error:'private service details'},{status:503});
   if(mode==='bad-json')return new Response('invalid',{headers:{'content-type':'application/json'}});
   if(mode==='large-body')return Response.json({action:'cancel-tpsl',txid:s.signed.signature,padding:'x'.repeat(5000)});
   return new Response('<html>login</html>',{headers:{'content-type':'text/html'}});
  }});
  const result=await submit(s.signed,s.args);assert.equal(result.stage,'CANCELLATION_BROADCAST_UNKNOWN');assert.equal(result.readyForRetry,false);
  assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(f.journal.readExitCancellation('broadcast-cancel').state,'UNCERTAIN');
  await assert.rejects(submit(s.signed,s.args));assert.equal(calls,1);assert.equal(f.journal.read('entry-0').state,'OPEN');
 }
});

test('cancellation broadcaster rejects foreign handles, changed controls/backups/native state and failed persistence before any attempt',async t=>{
 for(const mode of ['foreign-owner','foreign-journal','copy','controls','backup','runtime','native','write-failure']){
  const f=await fixture(t,{liveSibling:true}),s=await signedCancellation(f);let calls=0;
  if(mode==='controls')s.hooks.onRead=()=>{const value=s.custody.controls.read({ownerAccountHash:s.args.ownerAccountHash,walletAddress:wallet});s.custody.controls.save({ownerAccountHash:s.args.ownerAccountHash,walletAddress:wallet,expectedRevision:value.revision,settings:{...value.settings,dailyTrades:4}});};
  if(mode==='backup')s.hooks.onRead=()=>s.custody.registry.revokeArchive({archiveSha256:s.custody.archive.sha256,explicitOperatorApproval:true});
  if(mode==='runtime')s.custody.state.running=false;
  if(mode==='native'){const account=s.simFixture.state.before[s.inspection.exitAddress],data=Buffer.from(account.data[0],'base64');data[220]^=1;account.data[0]=data.toString('base64');}
  const original=f.journal.recordExitCancellationBroadcastIntent;if(mode==='write-failure')f.journal.recordExitCancellationBroadcastIntent=()=>{throw Error('durability failure');};
  try{
   const submit=createServerPerpsExitCancellationBroadcaster({journal:mode==='foreign-journal'?{...f.journal}:f.journal,fetchImpl:async()=>{calls++;throw Error('must not send');}});
   await assert.rejects(submit(mode==='copy'?{...s.signed}:s.signed,{...s.args,...mode==='foreign-owner'?{ownerAccountHash:'b'.repeat(64)}:{}}));
   assert.equal(calls,0);assert.equal(f.journal.readExitCancellation('broadcast-cancel').state,'SIGNING');assert.equal(f.journal.read('entry-0').state,'OPEN');
  }finally{f.journal.recordExitCancellationBroadcastIntent=original;}
 }
});

test('concurrent cancellation submissions cannot both pass the durable SIGNING transition',async t=>{
 const f=await fixture(t,{liveSibling:true}),s=await signedCancellation(f);let calls=0;
 const submit=createServerPerpsExitCancellationBroadcaster({journal:f.journal,fetchImpl:async()=>{calls++;return Response.json({action:'cancel-tpsl',txid:s.signed.signature});}});
 const outcomes=await Promise.allSettled([submit(s.signed,s.args),submit(s.signed,s.args)]);
 assert.equal(outcomes.filter(value=>value.status==='fulfilled').length,1);assert.equal(outcomes.filter(value=>value.status==='rejected').length,1);
 assert.equal(calls,1);assert.equal(f.journal.readExitCancellation('broadcast-cancel').state,'UNCERTAIN');
});

test('prepared cancellation failures and restart discard only provably unsigned attempts, never SIGNING',async t=>{
 const f=await fixture(t,{liveSibling:true}),{inspection,options}=await inspectedCancellation(f),simulation=await simulateServerPerpsExitCancellation(inspection,cancellationSimulationFixture(inspection,options));
 f.journal.beginExitCancellation('before-authorization',simulation);
 const result=await reconcilePendingPerpsExitCancellations(f.journal,wallet,{request:async()=>{throw Error('unsigned recovery must not query a signature');},now:()=>now});
 assert.equal(result.cancelledUnsigned,1);assert.equal(f.journal.readExitCancellation('before-authorization').state,'CANCELLED');
 f.journal.beginExitCancellation('after-authorization',simulation);f.journal.beginExitCancellationSigning('after-authorization',simulation);
 assert.throws(()=>f.journal.cancelPreparedExitCancellation('after-authorization'));assert.equal(f.journal.readExitCancellation('after-authorization').state,'SIGNING');
});

async function manualCloseCleanupFixture(t,{phase='FINALIZED'}={}){
 const f=await fixture(t,{positionClosed:true,liveSibling:true}),generic=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options);
 const manual=await closePayoutFixture({fixtureOwnerSeed:68,finalizedSlot:499998,nowMs:now});
 manual.row.id='manual-close';manual.row.observed_slot=499997;
 manual.row.entries=JSON.stringify(f.journal.openPositions(wallet).map(r=>Object.fromEntries(['reservation','signature','wire_hash','confirmed_slot','entry_exit_plan'].map(k=>[k,r[k]]))).sort((a,b)=>a.reservation.localeCompare(b.reservation)));
 const db=new DatabaseSync(f.path),r=manual.row;
 db.prepare('INSERT INTO perps_position_closes(id,wallet,position,state,created,updated,observed_slot,fee_lamports,unsigned_wire_hash,entries,settlement) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(r.id,r.wallet,r.position,r.state,r.created,r.created,r.observed_slot,r.fee_lamports,r.unsigned_wire_hash,r.entries,r.settlement);db.close();
 const base=f.request,request=async(method,params)=>{
  if(method==='getBlockTime'&&params[0]===500000)return now/1000;
  if(method==='getTransaction'&&params[0]===manual.identity.signature)return structuredClone(manual.tx);
  if(method==='getSignatureStatuses'&&params[0].length===1&&params[0][0]===manual.identity.signature)return manual.request(method,params);
  if(method==='getMultipleAccounts'&&params[0].length===1&&params[0][0]===manual.c.address)return manual.request(method,params);
  const v=await base(method,params);
  if(method==='getSignaturesForAddress'&&[wallet,r.position].includes(params[0]))v.unshift({signature:manual.identity.signature,slot:manual.tx.slot,blockTime:manual.tx.blockTime,err:null,confirmationStatus:'finalized'});
  return v;
 };
 if(phase!=='PREPARED'){
  f.journal.beginPositionCloseSigning(r.id);
  if(phase!=='SIGNING'){
   const partial=Buffer.from(manual.tx.transaction[0],'base64');partial.fill(0,65,129);
   f.journal.recordPositionCloseBroadcast(r.id,verifyOwnerSignedPerpsCloseIntent(r,partial.toString('base64')));
   if(phase==='FINALIZED')f.journal.reconcilePositionClosePayout(r.id,await readFinalizedPerpsClosePayout(r,manual.identity,{request,now:()=>now,monotonicNow:()=>0}));
  }
 }
 const readFinalizedAccount=()=>readServerPerpsDailyAccount({walletAddress:wallet},{request,journal:f.journal,now:()=>now,monotonicNow:()=>0});
 return {...f,manual,generic,request,readFinalizedAccount,account:await readFinalizedAccount(),options:{request,readFinalizedAccount,journal:f.journal,now:()=>now,monotonicNow:()=>0}};
}

test('a finalized manual whole close can clean its exact sibling using the existing paused custody coordinator without releasing the close',async t=>{
 const f=await manualCloseCleanupFixture(t),c=await cleanupCoordinatorFixture(f);
 const result=await c.coordinator.runOnce(c.args);
 assert.equal(result.stage,'CANCELLATION_BROADCAST_ACKNOWLEDGED');assert.deepEqual(c.calls,{builder:1,signer:1,send:1});
 assert.equal(f.journal.readPositionClose('manual-close').state,'PREPARED');assert.equal(f.journal.readPositionCloseExecution('manual-close').state,'FIRST_LEG_FINALIZED');
 assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 const native=createNativePerpsCloseExecutor({journal:f.journal,vault:c.custody.vault,cleanupCoordinator:c.coordinator,fetchImpl:async()=>{throw Error('no new close transport');}});
 for(const mode of ['maintenance','execute']){
  const state=await native.runOnce('manual-close',{mode,now:()=>now,request:async method=>{
   if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   assert.equal(method,'getSignatureStatuses');return {context:{slot:500000},value:[null]};
  }});
  assert.equal(state.stage,'NATIVE_CLOSE_SIBLING_EXIT_RECONCILIATION_REQUIRED');
  assert.deepEqual(c.calls,{builder:1,signer:1,send:1});assert.equal(f.journal.readPositionCloseConversion('manual-close'),null);
 }
 const repeated=await c.coordinator.runOnce(c.args);assert.equal(repeated.stage,'RECONCILIATION_REQUIRED');assert.deepEqual(c.calls,{builder:1,signer:1,send:1});
});

test('ordinary or copied cleanup proofs cannot bypass a held manual close, whose private binding is immutable and journal-specific',async t=>{
 const f=await manualCloseCleanupFixture(t),generic=await readServerPerpsExitCleanup(f.journal.read('entry-0'),{...f.options,journal:undefined});
 const c=await cancellationFixture(generic),inspection=await inspectServerPerpsExitCancellation(c.preparation,generic,c),native=(await f.request('getMultipleAccounts',[plan.exits.map(x=>x.address),{}])).value[1];
 const model=cancellationSimulationFixture(inspection,{requestAccount:native,positionAccount:null}),simulation=await simulateServerPerpsExitCancellation(inspection,model);
 assert.throws(()=>f.journal.beginExitCancellation('generic-bypass',simulation));assert.equal(f.journal.pendingExitCancellations(wallet).length,0);
 const proper=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options),binding=readVerifiedServerPerpsCloseCleanupBinding(proper);
 assert.equal(binding.closeId,'manual-close');assert(Object.isFrozen(binding));assert(Object.isFrozen(binding.identity));
 assert.throws(()=>{binding.identity.reservationId='entry-1';});assert.throws(()=>readVerifiedServerPerpsCloseCleanupBinding({...proper}));
 const valid=await inspectedCancellation(f),sim=await simulateServerPerpsExitCancellation(valid.inspection,cancellationSimulationFixture(valid.inspection,valid.options));
 const other=openPerpsExecutionJournal(f.path,{now:()=>now});try{assert.throws(()=>other.beginExitCancellation('foreign-proof',sim));}finally{other.close();}
 assert.equal(f.journal.pendingExitCancellations(wallet).length,0);assert.equal(f.journal.read('entry-0').state,'OPEN');
});

test('unprepared, interrupted, unrecorded, unrooted or altered manual close state prevents sibling cancellation before any grant',async t=>{
 for(const phase of ['PREPARED','SIGNING','UNCERTAIN']){
  const f=await manualCloseCleanupFixture(t,{phase});await assert.rejects(readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options),phase);
  assert.equal(f.journal.pendingExitCancellations(wallet).length,0);assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 }
 for(const mode of ['unrooted','payout','parent','entry']){
  const f=await manualCloseCleanupFixture(t),cleanup=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options);
  if(mode==='unrooted')f.manual.status.confirmationStatus='confirmed';
  else {const db=new DatabaseSync(f.path);
   if(mode==='payout')db.exec("UPDATE perps_position_close_executions SET payout_json=replace(payout_json,'7000000','7000001')");
   if(mode==='parent')db.exec("UPDATE perps_position_closes SET unsigned_wire_hash='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'");
   if(mode==='entry')db.exec("UPDATE perps_reservations SET entry_exit_plan='{}' WHERE reservation='entry-0'");db.close();
  }
  await assert.rejects(readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options),mode);
  if(mode!=='unrooted')assert.throws(()=>requireVerifiedServerPerpsExitCleanup(cleanup));
  assert.equal(f.journal.pendingExitCancellations(wallet).length,0);assert.equal(f.journal.read('entry-0').state,'OPEN');
 }
});

test('manual-close cleanup dispatch is bounded to execute cycles and is absent from maintenance or entry callbacks',async t=>{
 const f=await manualCloseCleanupFixture(t);let dispatched=0;
 const p=pausedExecutor(f,{cleanupCoordinator:{runOnce:async()=>{dispatched++;return {stage:'CANCELLATION_BROADCAST_UNKNOWN',cancellationId:'manual-cancel',signature:wallet};}}});
 const held=await p.executor.reconcileOnly(p.args);assert.equal(held.stage,'CLOSE_RECONCILIATION_REQUIRED');assert.equal(held.closeRecovery.cleanupRequired,1);assert.equal(dispatched,0);
 const result=await p.executor.runOnce(p.args);assert.equal(result.stage,'CANCELLATION_BROADCAST_UNKNOWN');assert.equal(dispatched,1);assert.equal(p.calls.financial,0);
 assert.equal(f.journal.readPositionClose('manual-close').state,'PREPARED');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
});

test('every pending sibling cancellation phase blocks a new conversion before any preparation RPC or risk release',async t=>{
 for(const phase of ['PREPARED','SIGNING','UNCERTAIN']){
  const f=await manualCloseCleanupFixture(t),c=await inspectedCancellation(f),model=cancellationSimulationFixture(c.inspection,c.options);
  const simulation=await simulateServerPerpsExitCancellation(c.inspection,model);f.journal.beginExitCancellation('held-cancel',simulation);
  if(phase!=='PREPARED')f.journal.beginExitCancellationSigning('held-cancel',simulation);
  if(phase==='UNCERTAIN')f.journal.recordExitCancellationBroadcastIntent('held-cancel',cancellationReceiptFixture(c.inspection,now).record);
  let calls=0;await assert.rejects(f.journal.preparePositionCloseConversion('manual-close',{request:()=>{calls++;throw Error('NO_PARALLEL_CONVERSION');}}));
  assert.equal(calls,0);assert.equal(f.journal.readExitCancellation('held-cancel').state,phase);
  assert.equal(f.journal.readPositionCloseConversion('manual-close'),null);assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 }
});

test('a changed manual close during authorization or after a grant/signature prevents custody or transport and retains uncertainty',async t=>{
 for(const at of ['risk-read','before-key','before-send']){
  const f=await manualCloseCleanupFixture(t),custody=await custodyForCancellation(f),c=await inspectedCancellation(f),model=cancellationSimulationFixture(c.inspection,c.options);
  const simulation=await simulateServerPerpsExitCancellation(c.inspection,model);f.journal.beginExitCancellation('bound-manual-cancel',simulation);
  const change=()=>{const db=new DatabaseSync(f.path);db.exec('UPDATE perps_position_close_executions SET updated=updated+1');db.close();};
  const args={...custody.args,cancellationId:'bound-manual-cancel',request:model.request};
  if(at==='risk-read'){
   const base=args.readAccount;args.readAccount=async input=>{const value=await base(input);change();return value;};
   await assert.rejects(authorizeServerPerpsExitCancellation(simulation,args));assert.equal(f.journal.readExitCancellation('bound-manual-cancel').state,'PREPARED');
  }else {
   const grant=await authorizeServerPerpsExitCancellation(simulation,args);
   if(at==='before-key'){change();assert.throws(()=>custody.vault.signExitCancellation(grant));}
   else {
    const signed=custody.vault.signExitCancellation(grant);change();let sends=0;
    const send=createServerPerpsExitCancellationBroadcaster({journal:f.journal,fetchImpl:async()=>{sends++;throw Error('NO_STALE_MANUAL_SEND');}});
    await assert.rejects(send(signed,{ownerAccountHash:custody.ownerAccountHash,controlRevision:args.controlRevision}));assert.equal(sends,0);
   }
   assert.equal(f.journal.readExitCancellation('bound-manual-cancel').state,'SIGNING');
  }
  assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.readPositionClose('manual-close').state,'PREPARED');
 }
});

test('an already prepared, signing or uncertain conversion blocks sibling cleanup; finalized conversion forbids an older account bank',async t=>{
 for(const phase of ['PREPARED','SIGNING','UNCERTAIN','FINALIZED']){
  const f=await manualCloseCleanupFixture(t),prior=await readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options);
  const swap=await conversionFixture({walletAddress:wallet,amountUnits:'7000000',nowMs:now});
  const request=async(m,p)=>{
   if(['getGenesisHash','getSignatureStatuses','getTransaction'].includes(m)||m==='getMultipleAccounts'&&p[1].commitment==='finalized')return f.request(m,p);
   const value=await swap.request(m,p);if(m==='getSlot')return 500100;if(value?.context)value.context.slot=500100;return value;
  };
  const prepared=await f.journal.preparePositionCloseConversion('manual-close',{...swap.options,request}),p=readJournaledPerpsCloseConversion(prepared,f.journal);
  f.journal.preparePositionCloseConversionRecord('manual-close',prepared);
  if(phase!=='PREPARED')f.journal.beginPositionCloseConversionSigning('manual-close',prepared);
  if(['UNCERTAIN','FINALIZED'].includes(phase)){
   // Same public unfunded fixture identity; no production key or network send.
   const fixturePrivateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,68)]),format:'der',type:'pkcs8'});
   const receipt=await conversionReceiptFixture({amountUnits:'7000000',fixturePrivateKey,finalizedSlot:500101,nowMs:now});
   f.journal.recordPositionCloseConversionBroadcast('manual-close',verifyOwnerSignedPerpsCloseConversionIntent(p.prepared.wire,receipt.transaction.transaction[0]));
   if(phase==='FINALIZED')f.journal.reconcilePositionCloseConversion('manual-close',await readFinalizedPerpsCloseConversionReceipt(p.prepared.wire,receipt.identity,receipt.receiptOptions));
  }
  assert.throws(()=>requireVerifiedServerPerpsExitCleanup(prior));
  await assert.rejects(readServerPerpsExitCleanup(f.journal.read('entry-0'),f.options),phase);
  assert.equal(f.journal.readPositionCloseConversion('manual-close').state,phase);assert.equal(f.journal.pendingExitCancellations(wallet).length,0);
  assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 }
});

test('cleanup coordinator connects private closure, builder, simulation, authority, custody and one attempt while entries remain paused',async t=>{
 const f=await fixture(t,{liveSibling:true}),c=await cleanupCoordinatorFixture(f),result=await c.coordinator.runOnce(c.args);
 assert.equal(result.stage,'CANCELLATION_BROADCAST_ACKNOWLEDGED');assert.equal(result.state,'UNCERTAIN');assert.equal(result.readyForRetry,false);
 assert.deepEqual(c.calls,{builder:1,signer:1,send:1});assert.equal(c.custody.controls.read(c.args).enabled,false);
 assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 assert.equal((await c.coordinator.runOnce(c.args)).stage,'RECONCILIATION_REQUIRED');assert.deepEqual(c.calls,{builder:1,signer:1,send:1});
});

test('finalized cancellation accounting requires journal-bound wire and exact SOL and USDC effects',async t=>{
 const f=await fixture(t,{liveSibling:true}),c=await cleanupCoordinatorFixture(f),sent=await c.coordinator.runOnce(c.args);
 const receipt=cancellationReceiptFixture(c.inspection,now);
 assert.equal(receipt.record.signature,sent.signature);
 const read=()=>readServerPerpsTradeTransaction({walletAddress:wallet,signature:receipt.record.signature,day:'2026-10-18'},
  {request:receipt.request,now:()=>now,requireTradeEvent:false});
 const transaction=await read(),proof=await readJournalledPerpsCancellation(transaction,{journal:f.journal});
 assert.equal(proof.stage,'FINALIZED_NON_TRADE_CANCELLATION');assert.equal(proof.networkFeeLamports,'15200');
 assert.equal(proof.realizedTradingLossUsdUnits,'0');assert.equal(proof.returnedUsdcUnits,'2500000');assert.equal(proof.readyForSigning,false);
 assert.equal(requireVerifiedPerpsCancellationHistory(proof,{transaction}),proof);
 assert.throws(()=>requireVerifiedPerpsCancellationHistory({...proof},{transaction}));
 assert.equal(await readJournalledPerpsCancellation(transaction),null);
 assert.equal(await readJournalledPerpsCancellation(transaction,{journal:{...f.journal,readExitCancellationBySignature:()=>null}}),null);
 const original=structuredClone(receipt.transaction.meta);
 const mutations=[
  meta=>meta.postBalances[0]++,meta=>meta.postBalances[1]++,meta=>meta.fee++,
  meta=>meta.postBalances[c.inspection.resolvedKeys.indexOf(c.inspection.exitAddress)]=1,
  meta=>meta.postTokenBalances[0].uiTokenAmount.amount='3499999',
  meta=>meta.postTokenBalances[0].owner=PERPS_POOL,
  meta=>meta.preTokenBalances.push(structuredClone(meta.preTokenBalances[0])),
  meta=>delete meta.preTokenBalances,
 ];
 for(const mutate of mutations){receipt.transaction.meta=structuredClone(original);mutate(receipt.transaction.meta);
  await assert.rejects(async()=>readJournalledPerpsCancellation(await read(),{journal:f.journal}));}
 receipt.transaction.meta=original;
 // Evidence is a private snapshot: later mutation of the provider response
 // cannot turn a verified transaction into different accounting evidence.
 receipt.transaction.meta.postBalances[0]++;
 assert.equal((await readJournalledPerpsCancellation(transaction,{journal:f.journal})).networkFeeLamports,'15200');
 const changed={...f.journal,readExitCancellationBySignature:args=>({...f.journal.readExitCancellationBySignature(args),unsigned_wire_hash:'a'.repeat(64)})};
 await assert.rejects(()=>readJournalledPerpsCancellation(transaction,{journal:changed}));
});

test('daily account retains cancellation network fee without counting another trade and closure waits for reconciliation',async t=>{
 const f=await fixture(t,{liveSibling:true}),c=await cleanupCoordinatorFixture(f),sent=await c.coordinator.runOnce(c.args);
 const receipt=cancellationReceiptFixture(c.inspection,now),meta=receipt.transaction.meta;
 receipt.transaction.blockTime=now/1000-6;
 const request=async(method,params)=>{
  if(method==='getTransaction'&&params[0]===sent.signature)return structuredClone(receipt.transaction);
  if(method==='getSignatureStatuses'&&params[0].includes(sent.signature))return receipt.request(method,params);
  if(method==='getSignaturesForAddress'){
   const rows=await f.request(method,params);
   return [wallet,baseIdentity.position].includes(params[0])?[{signature:sent.signature,slot:receipt.transaction.slot,blockTime:receipt.transaction.blockTime,err:null,confirmationStatus:'finalized'},...rows].sort((a,b)=>b.slot-a.slot):rows;
  }
  if(method==='getMultipleAccounts'){
   const response=structuredClone(await f.request(method,params));
   if(params[0].length===8){response.value[0].lamports=meta.postBalances[0];const data=Buffer.from(response.value[1].data[0],'base64');
    data.writeBigUInt64LE(BigInt(meta.postTokenBalances[0].uiTokenAmount.amount),64);response.value[1].data[0]=data.toString('base64');}
   else response.value=response.value.map((value,index)=>params[0][index]===c.inspection.exitAddress?null:value);
   return response;
  }
  return f.request(method,params);
 };
 const options={request,now:()=>now,monotonicNow:()=>0,journal:f.journal};
 await assert.rejects(()=>readServerPerpsDailyAccount({walletAddress:wallet},{...options,journal:undefined}));
 const account=await readServerPerpsDailyAccount({walletAddress:wallet},options);
 assert.equal(account.cancellations.length,1);assert.equal(account.tradesToday,f.account.tradesToday);
 assert.equal(account.lossTodayUsdcUnits,f.account.lossTodayUsdcUnits);
 assert.equal(BigInt(account.walletNetworkFeesLamports),BigInt(f.account.walletNetworkFeesLamports)+15200n);
 assert.equal(f.journal.read('entry-0').state,'OPEN');
 assert.equal((await reconcilePendingPerpsExitCancellations(f.journal,wallet,{request:receipt.request,now:()=>now})).confirmed,1);
 const proof=await readServerPerpsPositionClosure(f.journal.read('entry-0'),{...options,readFinalizedAccount:async()=>account});
 assert.equal(requireVerifiedServerPerpsPositionClosure(proof),proof);
});

test('cleanup coordinator refuses maintenance, changed preparation and unverified costs, retaining only genuine signing uncertainty',async t=>{
 for(const mode of ['maintenance','changed-controls','bad-builder','poor','signer-failure','send-failure']){
  const f=await fixture(t,{liveSibling:true}),c=await cleanupCoordinatorFixture(f,{mode});if(mode==='maintenance')c.custody.state.running=false;
  const result=await c.coordinator.runOnce(c.args);
  if(mode==='maintenance'){assert.equal(result.stage,'EXIT_CLEANUP_REQUIRED');assert.deepEqual(c.calls,{builder:0,signer:0,send:0});continue;}
  if(mode==='send-failure'){assert.equal(result.stage,'CANCELLATION_BROADCAST_UNKNOWN');assert.equal(f.journal.readExitCancellation(result.cancellationId).state,'UNCERTAIN');}
  else {assert.equal(result.stage,'EXIT_CLEANUP_BLOCKED');assert.equal(c.calls.send,0);}
  if(mode==='poor'){assert.equal(result.state,'CANCELLED');assert.equal(c.calls.signer,0);assert.equal(f.journal.pendingExitCancellations(wallet).length,0);}
  if(mode==='signer-failure'){assert.equal(result.state,'SIGNING');const before={...c.calls};assert.equal((await c.coordinator.runOnce(c.args)).stage,'RECONCILIATION_REQUIRED');assert.deepEqual(c.calls,before);}
  assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 }
});

test('cached failed cancellation wire is rejected durably before a second key use, including after reopening the journal',async t=>{
 const f=await fixture(t,{liveSibling:true}),c=await cleanupCoordinatorFixture(f),first=await c.coordinator.runOnce(c.args);
 const receipt=cancellationReceiptFixture(c.inspection,now,{err:{InstructionError:[2,'Custom']}});
 assert.equal(receipt.record.signature,first.signature);
 assert.equal((await reconcilePendingPerpsExitCancellations(f.journal,wallet,{request:receipt.request,now:()=>now})).failed,1);
 const before={...c.calls},second=await c.coordinator.runOnce(c.args);
 assert.equal(second.stage,'EXIT_CLEANUP_BLOCKED');assert.equal(c.calls.builder,before.builder+1);assert.equal(c.calls.signer,before.signer);assert.equal(c.calls.send,before.send);
 assert.equal(f.journal.pendingExitCancellations(wallet).length,0);assert.equal(f.journal.read('entry-0').state,'OPEN');
 const old=f.journal.readExitCancellation(first.cancellationId),reopened=openPerpsExecutionJournal(f.path,{now:()=>now});
 try{assert.equal(reopened.readExitCancellation(first.cancellationId).unsigned_wire_hash,old.unsigned_wire_hash);assert.match(old.unsigned_wire_hash,/^[a-f0-9]{64}$/);}finally{reopened.close();}
});

test('executor stops new entries on orphan triggers or legacy unresolved bindings without signing or cancelling anything',async t=>{
 const f=await fixture(t,{liveSibling:true}),ownerAccountHash='a'.repeat(64),forbidden=()=>{throw Error('financial capability must not be called');};
 const controls={read:()=>({walletAddress:wallet,enabled:true,paused:false}),pauseForRisk:forbidden};
 const options={mode:'execute',controls,journal:f.journal,readFeed:forbidden,readAccount:forbidden,readFinalizedAccount:async()=>f.account,
  vault:{describe:()=>({walletAddress:wallet,ownerAccountHash,exclusive:true,purpose:'jamddmaj-perps-automation'}),signPrepared:forbidden},
  rpcRequest:f.request,builderRequest:forbidden,fetchImpl:forbidden,now:()=>now};
 assert.equal((await createServerPerpsExecutor(options).runOnce({walletAddress:wallet,ownerAccountHash})).stage,'EXIT_CLEANUP_REQUIRED');
 const journal={...f.journal,openPositions:()=>f.journal.openPositions(wallet).map(row=>({...row,entry_exit_plan:null}))};
 assert.equal((await createServerPerpsExecutor({...options,journal}).runOnce({walletAddress:wallet,ownerAccountHash})).stage,'RECONCILIATION_REQUIRED');
 assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
});

test('previous-day index failures, wrong metadata and unrooted exit-account banks cannot release capital',async t=>{
 const f=await fixture(t,{yesterday:true});
 for(const mutation of ['missing-index','oversized-index','wrong-slot','old-bank']){
  const request=async(method,params)=>{
   const result=await f.request(method,params);
   if(method==='getSignaturesForAddress'&&keys.includes(params[0])){
    if(mutation==='missing-index')return null;
    if(mutation==='oversized-index')return Array(41).fill(result[0]);
    if(mutation==='wrong-slot')return result.map(row=>({...row,slot:row.slot+1}));
   }
   if(mutation==='old-bank'&&method==='getMultipleAccounts')return {...result,context:{slot:499999}};
   return result;
  };
  await assert.rejects(readServerPerpsPositionClosure(f.journal.read('entry-0'),{...f.options,request}));
  assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 }
});

function pausedExecutor(f,{readState=()=>({enabled:false,paused:true}),readFinalizedAccount=async()=>f.account,cleanupCoordinator=null}={}){
 const ownerAccountHash='a'.repeat(64),calls={financial:0},forbidden=()=>{calls.financial++;throw Error('no new risk during paused maintenance');};
 const options={mode:'execute',journal:f.journal,now:()=>now,rpcRequest:f.request,readFinalizedAccount,cleanupCoordinator,
  controls:{read:()=>({walletAddress:wallet,...readState()}),pauseForRisk:forbidden},
  vault:{describe:()=>({walletAddress:wallet,ownerAccountHash,exclusive:true,purpose:'jamddmaj-perps-automation'}),signPrepared:forbidden},
  readFeed:forbidden,readAccount:forbidden,builderRequest:forbidden,fetchImpl:forbidden};
 return {executor:createServerPerpsExecutor(options),args:{walletAddress:wallet,ownerAccountHash},calls};
}

test('executor dispatches bounded orphan cleanup only in execute cycles, never read-only maintenance or entry callbacks',async t=>{
 const f=await fixture(t,{liveSibling:true});let dispatched=0;const cleanupCoordinator={runOnce:async()=>{dispatched++;return {stage:'CANCELLATION_BROADCAST_UNKNOWN',cancellationId:'fixture-cancel',signature:wallet};}};
 const p=pausedExecutor(f,{cleanupCoordinator});assert.equal((await p.executor.reconcileOnly(p.args)).stage,'EXIT_CLEANUP_REQUIRED');assert.equal(dispatched,0);
 assert.equal((await p.executor.runOnce(p.args)).stage,'CANCELLATION_BROADCAST_UNKNOWN');assert.equal(dispatched,1);assert.equal(p.calls.financial,0);
});

test('paused automation reconciles a finalized full exit without reading signals, preparing, signing or sending',async t=>{
 const f=await fixture(t),p=pausedExecutor(f),result=await p.executor.runOnce(p.args);
 assert.equal(result.stage,'AUTOMATION_INACTIVE');assert.equal(f.journal.read('entry-0').state,'CLOSED');assert.equal(f.journal.read('entry-1').state,'OPEN');
 assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'10000000');assert.equal(p.calls.financial,0);
 assert.equal((await p.executor.runOnce(p.args)).stage,'AUTOMATION_INACTIVE');assert.equal(p.calls.financial,0);
});

test('an unknown pending signature does not prevent read-only recovery of independently closed positions while paused',async t=>{
 const f=await fixture(t);f.journal.reserve({walletAddress:wallet,signalId:'unsigned-unknown',reservationId:'unsigned-unknown',marginUsd:'10',limits:f.limits,snapshot:f.snapshot});
 f.journal.beginSigning('unsigned-unknown');const p=pausedExecutor(f),result=await p.executor.runOnce(p.args);
 assert.equal(result.stage,'RECONCILIATION_REQUIRED');assert.equal(f.journal.read('entry-0').state,'CLOSED');assert.equal(f.journal.read('entry-1').state,'OPEN');
 assert.equal(f.journal.read('unsigned-unknown').state,'SIGNING');assert.equal(f.journal.riskState(wallet).pendingMarginUsdcUnits,'10000000');assert.equal(p.calls.financial,0);
});

test('pausing does not guess away a live sibling exit or partially closed entry',async t=>{
 for(const options of [{liveSibling:true},{exitSize:'29999999'},{failedExit:true}]){
  const f=await fixture(t,options),p=pausedExecutor(f),result=await p.executor.runOnce(p.args);
  assert.equal(result.stage,options.liveSibling?'EXIT_CLEANUP_REQUIRED':'AUTOMATION_INACTIVE');
  assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');assert.equal(p.calls.financial,0);
 }
});

test('activation arriving during paused recovery cannot start a financial entry in that same cycle',async t=>{
 const f=await fixture(t);let activated=false;
 const p=pausedExecutor(f,{readState:()=>({enabled:activated,paused:!activated}),readFinalizedAccount:async()=>{activated=true;return f.account;}});
 assert.equal((await p.executor.runOnce(p.args)).stage,'AUTOMATION_INACTIVE');assert.equal(activated,true);
 assert.equal(f.journal.read('entry-0').state,'CLOSED');assert.equal(p.calls.financial,0);
});

test('pause arriving during active recovery is checked before reading entry risk or published signals',async t=>{
 const f=await fixture(t);let active=true;
 const p=pausedExecutor(f,{readState:()=>({enabled:active,paused:!active,revision:'fixture-revision'}),readFinalizedAccount:async()=>{active=false;return f.account;}});
 assert.equal((await p.executor.runOnce(p.args)).stage,'EXECUTION_BLOCKED');assert.equal(active,false);
 assert.equal(f.journal.read('entry-0').state,'CLOSED');assert.equal(p.calls.financial,0);
});
