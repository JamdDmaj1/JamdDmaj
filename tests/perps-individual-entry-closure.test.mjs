import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import bs58 from 'bs58';
import {fixtureNow as now,fixtureWallet as wallet,historyTransaction} from './helpers/perps-history-fixture.mjs';
import {PERPS_CUSTODIES,PERPS_POOL,PERPS_PROGRAM,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readPerpsBroadcastReceipt} from '../lib/perps-broadcast-receipt.js';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {readServerPerpsPositionClosure,reconcileClosedServerPerpsPositions} from '../lib/perps-position-closure.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {canonicalServerPerpsEntryExitPlan} from '../lib/perps-entry-exit-plan.js';
import {createServerPerpsExecutor} from '../lib/perps-server-executor.js';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',tokenProgram='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const keys=[90,91,92].map(n=>bs58.encode(Buffer.alloc(32,n))),size='30000000';
const plan={sizeUsdUnits:size,exits:keys.slice(0,2).map((address,index)=>({address,kind:index?'TP':'SL',sizeUsdUnits:size,triggerPriceUsdUnits:index?'110000000':'95000000',counter:String(index+1)}))};
async function fixture(t,{yesterday=false,exitSize=size,exitAddress=keys[0],entrySize=size,failedExit=false,liveSibling=false,positionClosed=false}={}){
 const first=await historyTransaction({name:'InstantIncreasePositionEvent',nonce:4,threeSigners:true,fieldOverrides:{sizeUsdDelta:entrySize}});
 const second=await historyTransaction({name:'InstantIncreasePositionEvent',nonce:5,threeSigners:true,fieldOverrides:{sizeUsdDelta:size}});
 const exit=await historyTransaction({nonce:6,fieldOverrides:{sizeUsdDelta:exitSize,positionRequest:exitAddress}});
 if(failedExit)exit.tx.meta.err={InstructionError:[0,'InvalidArgument']};
 const transactions=[first,second,exit];if(yesterday)for(const value of transactions)value.tx.blockTime-=86400;
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset:'SOL',side:'LONG'});
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
  if(method==='getMultipleAccounts')return params[0].length===8?{context:{slot:500000},value:bank}:{context:{slot:500000},value:params[0].map(address=>liveSibling&&address===keys[1]?{owner:PERPS_PROGRAM}:null)};
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
  const reservationId='entry-'+index,entryExitPlan=index?{sizeUsdUnits:size,exits:[{...plan.exits[0],address:keys[2]}]}:plan;
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
