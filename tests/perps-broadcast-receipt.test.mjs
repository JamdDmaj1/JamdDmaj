import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import bs58 from 'bs58';
import {readPerpsBroadcastReceipt,isVerifiedPerpsBroadcastReceipt} from '../lib/perps-broadcast-receipt.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {reconcilePendingPerps} from '../lib/perps-pending-recovery.js';
import {readServerPerpsPositionClosure,reconcileClosedServerPerpsPositions} from '../lib/perps-position-closure.js';
import {deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {emptyFixtureDailyAccount} from './helpers/perps-history-fixture.mjs';
const time=Date.parse('2026-10-18T12:00:00Z');
// Unfunded deterministic fixture identities only; no RPC or signer service.
function fixture({versioned=false,err=null,nonce=4}={}){
 const privateKeys=[11,12,13].map(n=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,n)]),format:'der',type:'pkcs8'}));
 const publicKeys=privateKeys.map(k=>createPublicKey(k).export({format:'der',type:'spki'}).subarray(-32));
 const message=Buffer.concat([Buffer.from(versioned?[128,3,1,0,3]:[3,1,0,3]),...publicKeys,Buffer.alloc(32,nonce),Buffer.from([0])]);
 const signatures=privateKeys.map(k=>sign(null,message,k));
 const wire=Buffer.concat([Buffer.from([3]),...signatures,message]),partial=Buffer.from(wire);partial.fill(0,65,129);
 const record={walletAddress:bs58.encode(publicKeys[0]),signature:bs58.encode(signatures[0]),wireHash:createHash('sha256').update(partial).digest('hex')};
 const status={slot:40,confirmationStatus:err===null?'confirmed':'finalized',err};
 const transaction={slot:40,blockTime:time/1000,transaction:[wire.toString('base64'),'base64'],meta:{err}};
 const calls=[];
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:41},value:[status]};
  if(method==='getTransaction')return transaction;
  throw Error('UNEXPECTED_RPC');
 };
 return {record,status,transaction,request,calls,wire};
}
test('legacy and v0 receipts verify all signatures and preserve the pre-keeper hash',async()=>{
 for(const versioned of [false,true]){
  const f=fixture({versioned}),proof=await readPerpsBroadcastReceipt(f.record,f.request,{now:()=>time});
  assert.equal(proof.state,'CONFIRMED');assert.equal(proof.executionDay,'2026-10-18');
  assert.equal(isVerifiedPerpsBroadcastReceipt(proof),true);assert.equal(Object.isFrozen(proof),true);
  assert.equal(isVerifiedPerpsBroadcastReceipt({...proof}),false);
  assert.deepEqual(f.calls.map(c=>c.method),['getGenesisHash','getSignatureStatuses','getTransaction','getGenesisHash']);
 }
});
test('pending or unavailable history does not release a reservation',async()=>{
 for(const mode of ['pending','missing']){
  const f=fixture();if(mode==='pending')f.status.confirmationStatus='processed';
  const request=async(m,p)=>m==='getTransaction'&&mode==='missing'?null:f.request(m,p);
  assert.equal(await readPerpsBroadcastReceipt(f.record,request,{now:()=>time}),null);
 }
});
test('failure must be finalized before releasing collateral; malformed error never becomes failure proof',async()=>{
 const f=fixture({err:{InstructionError:[0,'InvalidArgument']}});
 f.status.confirmationStatus='confirmed';
 assert.equal(await readPerpsBroadcastReceipt(f.record,f.request,{now:()=>time}),null);
 assert.equal(f.calls.some(c=>c.method==='getTransaction'),false);
 f.status.confirmationStatus='finalized';
 const proof=await readPerpsBroadcastReceipt(f.record,f.request,{now:()=>time});
 assert.equal(proof.state,'FAILED');
 assert.equal(f.calls.find(c=>c.method==='getTransaction').params[1].commitment,'finalized');
 for(const err of [undefined,false,0,[],{},'']){
  const bad=fixture();bad.status.err=err;bad.transaction.meta.err=err;
  await assert.rejects(readPerpsBroadcastReceipt(bad.record,bad.request,{now:()=>time}),/UNVERIFIED_PERPS_RECEIPT/);
 }
});
test('rejects tampered signer slots, message, identity, metadata and network',async()=>{
 for(const mutate of [
  f=>{const w=Buffer.from(f.wire);w[70]^=1;f.transaction.transaction[0]=w.toString('base64');},
  f=>{const w=Buffer.from(f.wire);w[w.length-1]^=1;f.transaction.transaction[0]=w.toString('base64');},
  f=>{f.record.wireHash='a'.repeat(64);},
  f=>{f.record.walletAddress=bs58.encode(Buffer.alloc(32,9));},
  f=>{f.record.signature=bs58.encode(Buffer.alloc(64,9));},
  f=>{f.transaction.slot++;},
  f=>{f.transaction.meta.err={InstructionError:[0,'InvalidArgument']};},
  f=>{f.transaction.blockTime+=3;},
  f=>{f.transaction.transaction[0]+='\n';}
 ]){
  const f=fixture();mutate(f);
  await assert.rejects(readPerpsBroadcastReceipt(f.record,f.request,{now:()=>time}),/UNVERIFIED_PERPS_RECEIPT/);
 }
 const f=fixture();await assert.rejects(readPerpsBroadcastReceipt(f.record,async(m,p)=>m==='getGenesisHash'?'devnet':f.request(m,p)),/UNVERIFIED_PERPS_RECEIPT/);
});
test('journal requires fresh branded proof; confirmed collateral stays held and failed signals cannot replay',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'jamd-receipt-'));
 let now=time;const journal=openPerpsExecutionJournal(join(dir,'journal.sqlite'),{now:()=>now});
 t.after(()=>{journal.close();rmSync(dir,{recursive:true,force:true});});
 for(const failed of [false,true]){
  const f=fixture({err:failed?{InstructionError:[0,'InvalidArgument']}:null,nonce:failed?5:4});
  const id=failed?'failed':'confirmed';
  const wallet=f.record.walletAddress;
  if(failed){f.transaction.blockTime++;now+=1000;}
  const request={walletAddress:wallet,signalId:id,reservationId:id,marginUsd:'10',limits:{capitalUsd:'100',dailyLossUsd:'100',positions:10,dailyTrades:10},snapshot:{walletAddress:wallet,network:'solana-mainnet',balancesComplete:true,observedAt:now,day:'2026-10-18',availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0}};
  journal.reserve(request);journal.beginSigning(id);
  journal.recordBroadcastIntent(id,f.record);
  const proof=await readPerpsBroadcastReceipt(f.record,f.request,{now:()=>now});
  assert.throws(()=>journal.reconcileBroadcast(id,{...proof}),/VERIFIED_RECONCILIATION_REQUIRED/);
  now+=10001;assert.throws(()=>journal.reconcileBroadcast(id,proof),/VERIFIED_RECONCILIATION_REQUIRED/);now-=10001;
  assert.equal(journal.reconcileBroadcast(id,proof).state,failed?'CLOSED':'OPEN');
  assert.equal(journal.pending(wallet).some(r=>r.reservation===id),false);
  assert.throws(()=>journal.reserve({...request,reservationId:'duplicate'}),/DUPLICATE_SIGNAL/);
  assert.throws(()=>journal.reserve({...request,reservationId:'next',signalId:'next',limits:{...request.limits,capitalUsd:'10',dailyLossUsd:'10'}}),/CAPITAL_LIMIT/);
 }
});
test('a failed attempt landing after midnight retains its new-day trade slot but releases collateral',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'jamd-midnight-receipt-'));
 let now=Date.parse('2026-10-17T23:59:59Z');
 const journal=openPerpsExecutionJournal(join(dir,'journal.sqlite'),{now:()=>now});
 t.after(()=>{journal.close();rmSync(dir,{recursive:true,force:true});});
 const f=fixture({err:{InstructionError:[0,'InvalidArgument']}}),wallet=f.record.walletAddress;
 const input=(id,dailyTrades=1)=>({walletAddress:wallet,signalId:id,reservationId:id,marginUsd:'10',
  limits:{capitalUsd:'10',dailyLossUsd:'10',positions:1,dailyTrades},
  snapshot:{walletAddress:wallet,network:'solana-mainnet',balancesComplete:true,observedAt:now,day:new Date(now).toISOString().slice(0,10),availableUsdcUnits:'10000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0}});
 journal.reserve(input('old'));journal.beginSigning('old');journal.recordBroadcastIntent('old',f.record);
 now=time;
 const proof=await readPerpsBroadcastReceipt(f.record,f.request,{now:()=>now});
 const recovered=await reconcilePendingPerps(journal,wallet,{readReceipt:async record=>{
  assert.deepEqual(record,f.record);return proof;
 }});
 assert.equal(recovered.failed,1);assert.equal(recovered.unresolved,0);
 const result=journal.read('old');
 assert.equal(result.state,'CLOSED');assert.equal(result.day,'2026-10-18');
 assert.throws(()=>journal.reserve(input('new')),/DAILY_TRADE_LIMIT/);
 assert.equal(journal.reserve(input('new',2)).state,'RESERVED');
 assert.throws(()=>journal.reserve(input('old',2)),/DUPLICATE_SIGNAL/);
});
async function openClosureFixture(t,{yesterday=true,legacy=false}={}){
 const f=fixture(),wallet=f.record.walletAddress,position=(await deriveServerPerpsIdentities({walletAddress:wallet,asset:'SOL',side:'LONG'})).position;
 f.status.confirmationStatus='finalized';if(yesterday)f.transaction.blockTime-=86400;
 const dir=mkdtempSync(join(tmpdir(),'jamd-closed-position-')),journal=openPerpsExecutionJournal(join(dir,'journal.sqlite'),{now:()=>time});
 t.after(()=>{journal.close();rmSync(dir,{recursive:true,force:true});});
 journal.reserve({walletAddress:wallet,signalId:'close-1',reservationId:'close-1',positionAddress:legacy?null:position,entryExitPlan:legacy?null:{sizeUsdUnits:'30000000',exits:[]},marginUsd:'10',
  limits:{capitalUsd:'100',dailyLossUsd:'100',positions:10,dailyTrades:10},snapshot:{walletAddress:wallet,network:'solana-mainnet',balancesComplete:true,observedAt:time,day:'2026-10-18',availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0}});
 journal.beginSigning('close-1');journal.recordBroadcastIntent('close-1',f.record);
 journal.reconcileBroadcast('close-1',await readPerpsBroadcastReceipt(f.record,f.request,{now:()=>time}));
 return {...f,journal,wallet,position};
}
test('a finalized prior-day entry and complete current-day closed account release collateral without erasing entry history',async t=>{
 const f=await openClosureFixture(t),account=await emptyFixtureDailyAccount(f.wallet),record=f.journal.read('close-1');
 const proof=await readServerPerpsPositionClosure(record,{request:f.request,readFinalizedAccount:async()=>account,now:()=>time});
 assert.equal(proof.stage,'FINALIZED_WHOLE_POSITION_CLOSED');assert.equal(f.journal.riskState(f.wallet).activeMarginUsdcUnits,'10000000');
 assert.throws(()=>f.journal.reconcileClosedPosition('close-1',{...proof}));
 const closed=f.journal.reconcileClosedPosition('close-1',proof);assert.equal(closed.state,'CLOSED');assert.equal(closed.day,'2026-10-17');assert.equal(closed.closed_slot,500000);
 assert.equal(f.journal.riskState(f.wallet).activeMarginUsdcUnits,'0');assert.equal(f.journal.riskState(f.wallet).executedToday,0);
 assert.throws(()=>f.journal.reconcileClosedPosition('close-1',proof));
});
test('confirmed-only entries and missing same-day trade accounting cannot free an OPEN reservation',async t=>{
 const f=await openClosureFixture(t,{yesterday:false}),account=await emptyFixtureDailyAccount(f.wallet),record=f.journal.read('close-1');
 f.status.confirmationStatus='confirmed';assert.equal(await readServerPerpsPositionClosure(record,{request:f.request,readFinalizedAccount:async()=>account,now:()=>time}),null);
 f.status.confirmationStatus='finalized';await assert.rejects(readServerPerpsPositionClosure(record,{request:f.request,readFinalizedAccount:async()=>account,now:()=>time}));
 const result=await reconcileClosedServerPerpsPositions(f.journal,f.wallet,{request:f.request,readFinalizedAccount:async()=>account,now:()=>time});
 assert.equal(result.unresolved,1);assert.equal(result.closed,0);assert.equal(f.journal.read('close-1').state,'OPEN');
});
test('stale closure evidence and legacy rows retain capital instead of guessing a position identity',async t=>{
 const f=await openClosureFixture(t);let elapsed=0;const account=await emptyFixtureDailyAccount(f.wallet,{monotonicNow:()=>elapsed});
 const proof=await readServerPerpsPositionClosure(f.journal.read('close-1'),{request:f.request,readFinalizedAccount:async()=>account,now:()=>time});
 elapsed=10001;assert.throws(()=>f.journal.reconcileClosedPosition('close-1',proof));assert.equal(f.journal.read('close-1').state,'OPEN');
 const legacy=await openClosureFixture(t,{legacy:true}),result=await reconcileClosedServerPerpsPositions(legacy.journal,legacy.wallet,{request:legacy.request,readFinalizedAccount:async()=>account,now:()=>time});
 assert.equal(result.legacyReview,1);assert.equal(result.checked,0);assert.equal(legacy.journal.read('close-1').state,'OPEN');
});
