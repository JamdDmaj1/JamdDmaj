import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {fixtureNow as now,fixtureWallet as wallet,historyTransaction} from './helpers/perps-history-fixture.mjs';
import {PERPS_CUSTODIES,PERPS_POOL,PERPS_PROGRAM,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readPerpsBroadcastReceipt} from '../lib/perps-broadcast-receipt.js';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {readServerPerpsPositionClosure,reconcileClosedServerPerpsPositions,readServerPerpsExitCleanup,requireVerifiedServerPerpsExitCleanup,requireVerifiedServerPerpsPositionClosure} from '../lib/perps-position-closure.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {canonicalServerPerpsEntryExitPlan} from '../lib/perps-entry-exit-plan.js';
import {createServerPerpsExecutor} from '../lib/perps-server-executor.js';
import {inspectServerPerpsExitCancellation,requireInspectedPerpsExitCancellation} from '../lib/perps-exit-cancellation.js';
import {cancellationFixture,cancellationSimulationFixture,cancellationReceiptFixture} from './helpers/perps-cancellation-fixture.mjs';
import {simulateServerPerpsExitCancellation,requireSimulatedPerpsExitCancellation} from '../lib/perps-exit-cancellation-simulation.js';
import {reconcilePendingPerpsExitCancellations} from '../lib/perps-exit-cancellation-recovery.js';
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
 t.after(()=>{journal.close();rmSync(directory,{recursive:true,force:true});});
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
 return {journal,path,request,account,calls,first,second,exit,snapshot,limits,readFinalizedAccount,options:{request,readFinalizedAccount:async()=>account,now:()=>now},expire(){elapsed=10001;}};
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
 const first=f.journal.beginExitCancellation('cancel-1',simulation);assert.equal(first.state,'SIGNING');
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
 const receipt=cancellationReceiptFixture(inspection,now,{err:{InstructionError:[2,'Custom']}});
 f.journal.recordExitCancellationBroadcastIntent('failed-attempt',receipt.record);
 assert.equal((await reconcilePendingPerpsExitCancellations(f.journal,wallet,{request:receipt.request,now:()=>now})).failed,1);
 assert.equal(f.journal.read('entry-0').state,'OPEN');assert.equal(f.journal.beginExitCancellation('new-attempt',simulation).state,'SIGNING');
 // The exact previously attempted transaction identity may never be reused.
 assert.throws(()=>f.journal.recordExitCancellationBroadcastIntent('new-attempt',receipt.record));
 assert.equal(f.journal.readExitCancellation('new-attempt').state,'SIGNING');assert.equal(f.journal.riskState(wallet).activeMarginUsdcUnits,'20000000');
 const g=await fixture(t,{liveSibling:true}),next=await inspectedCancellation(g),second=await simulateServerPerpsExitCancellation(next.inspection,cancellationSimulationFixture(next.inspection,next.options));
 g.journal.beginExitCancellation('later-confirmation',second);const late=cancellationReceiptFixture(next.inspection,now,{slot:500001});
 g.journal.recordExitCancellationBroadcastIntent('later-confirmation',late.record);
 await reconcilePendingPerpsExitCancellations(g.journal,wallet,{request:late.request,now:()=>now});
 const earlier=await readServerPerpsPositionClosure(g.journal.read('entry-0'),{...g.options,request:async(method,params)=>method==='getMultipleAccounts'&&params[0].length===2?{context:{slot:500000},value:[null,null]}:g.request(method,params)});
 assert.throws(()=>g.journal.reconcileClosedPosition('entry-0',earlier));assert.equal(g.journal.read('entry-0').state,'OPEN');
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

function pausedExecutor(f,{readState=()=>({enabled:false,paused:true}),readFinalizedAccount=async()=>f.account}={}){
 const ownerAccountHash='a'.repeat(64),calls={financial:0},forbidden=()=>{calls.financial++;throw Error('no new risk during paused maintenance');};
 const options={mode:'execute',journal:f.journal,now:()=>now,rpcRequest:f.request,readFinalizedAccount,
  controls:{read:()=>({walletAddress:wallet,...readState()}),pauseForRisk:forbidden},
  vault:{describe:()=>({walletAddress:wallet,ownerAccountHash,exclusive:true,purpose:'jamddmaj-perps-automation'}),signPrepared:forbidden},
  readFeed:forbidden,readAccount:forbidden,builderRequest:forbidden,fetchImpl:forbidden};
 return {executor:createServerPerpsExecutor(options),args:{walletAddress:wallet,ownerAccountHash},calls};
}

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
