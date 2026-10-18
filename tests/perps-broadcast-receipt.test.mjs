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
const time=Date.parse('2026-10-18T12:00:00Z');
// Unfunded deterministic fixture identities only; no RPC or signer service.
function fixture({versioned=false,err=null,nonce=4}={}){
 const privateKeys=[11,12,13].map(n=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,n)]),format:'der',type:'pkcs8'}));
 const publicKeys=privateKeys.map(k=>createPublicKey(k).export({format:'der',type:'spki'}).subarray(-32));
 const message=Buffer.concat([Buffer.from(versioned?[128,3,1,0,3]:[3,1,0,3]),...publicKeys,Buffer.alloc(32,nonce),Buffer.from([0])]);
 const signatures=privateKeys.map(k=>sign(null,message,k));
 const wire=Buffer.concat([Buffer.from([3]),...signatures,message]),partial=Buffer.from(wire);partial.fill(0,65,129);
 const record={walletAddress:bs58.encode(publicKeys[0]),signature:bs58.encode(signatures[0]),wireHash:createHash('sha256').update(partial).digest('hex')};
 const status={slot:40,confirmationStatus:'confirmed',err};
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
