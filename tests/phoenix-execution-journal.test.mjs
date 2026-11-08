import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import bs58 from 'bs58';
import {openPhoenixExecutionJournal,requirePhoenixOrderClaim,requirePhoenixExecutionJournal} from '../lib/phoenix-execution-journal.js';
import {simulatePhoenixOrder} from '../lib/phoenix-order-simulation.js';
import {reconcilePhoenixOrder} from '../lib/phoenix-order-receipt.js';
import {phoenixSimulationFixture} from './helpers/phoenix-simulation-fixture.mjs';
import {phoenixEventBatches} from './helpers/phoenix-event-batches.mjs';
const owner='a'.repeat(64),id='b'.repeat(64),workflowId='c'.repeat(64),other='d'.repeat(64);
const opts={initialize:true,explicitOperatorApproval:true,allowNonPosixForTests:process.platform==='win32'};

async function fixture(t){
 const keys=generateKeyPairSync('ed25519'),wallet=bs58.encode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const f=await phoenixSimulationFixture({wallet}),simulation=await simulatePhoenixOrder(f.args,f.simulationOptions);
 const root=mkdtempSync(join(tmpdir(),'jamd-phoenix-journal-'));chmodSync(root,0o700);const path=join(root,'phoenix.sqlite'),opened=[];
 const open=(extra={})=>{const j=openPhoenixExecutionJournal(path,{...opts,now:f.now,...extra});opened.push(j);return j;},journal=open();
 t.after(()=>{for(const j of opened)j.close();rmSync(root,{recursive:true,force:true});});
 const prepare=(j=journal,changes={})=>j.prepareOrder({id,workflowId,ownerAccountHash:owner,controlRevision:'revision-1',wire:f.wire,simulation,request:f.request,...changes});
 const signed=Buffer.from(f.wire.serializedTxBase64,'base64');sign(null,signed.subarray(65),keys.privateKey).copy(signed,1);
 return {...f,root,path,open,journal,prepare,signedBase64:signed.toString('base64'),simulation,
  signWire(wire){const b=Buffer.from(wire.serializedTxBase64,'base64');sign(null,b.subarray(65),keys.privateKey).copy(b,1);return b.toString('base64');}};
}

test('durable preparation requires sealed same-wire simulation and excludes another pending wallet attempt',async t=>{
 const f=await fixture(t);assert.equal(requirePhoenixExecutionJournal(f.journal),f.journal);
 assert.throws(()=>requirePhoenixExecutionJournal({...f.journal}));
 assert.throws(()=>f.prepare(f.journal,{simulation:{...f.simulation}}),/UNVERIFIED/);
 assert.equal(f.journal.heldWorkflows(f.wallet).length,0);
 const claim=f.prepare();assert.equal(requirePhoenixOrderClaim(claim,f.journal).state,'PREPARED');
 assert.throws(()=>requirePhoenixOrderClaim({...claim},f.journal));
 assert.equal(f.journal.pending(f.wallet).length,1);
 const second=f.open();assert.throws(()=>f.prepare(second,{id:other,workflowId:other}));
 assert.equal(second.pending(f.wallet).length,1);assert.equal(second.heldWorkflows(f.wallet).length,1);
 assert.equal(f.journal.readAttempt(id,other),null);assert.equal(f.journal.readWorkflow(workflowId,other),null);
});

test('signed attempt is committed UNKNOWN before broadcast and survives closed process state',async t=>{
 const f=await fixture(t),claim=f.prepare();
 assert.throws(()=>f.journal.markBroadcast(id,owner));
 assert.throws(()=>f.journal.persistSigned(claim,Buffer.from(f.wire.serializedTxBase64,'base64').toString('base64')),/SIGNATURE/);
 const signed=f.journal.persistSigned(claim,f.signedBase64);assert.equal(signed.state,'SIGNED');
 assert.throws(()=>f.journal.persistSigned(claim,f.signedBase64));
 f.journal.close();const reopened=f.open({initialize:false,explicitOperatorApproval:false});
 assert.equal(reopened.pending(f.wallet)[0].state,'SIGNED');
 const unknown=reopened.markBroadcast(id,owner);assert.equal(unknown.state,'UNKNOWN');
 assert.throws(()=>reopened.markBroadcast(id,owner));
 reopened.close();f.advance(60000);const afterCrash=f.open({initialize:false,explicitOperatorApproval:false});
 assert.equal(afterCrash.pending(f.wallet)[0].state,'UNKNOWN');
 const restored=await afterCrash.recoveryEvidence(id,owner);assert.equal(restored.signature,signed.signature);
 const pending=await reconcilePhoenixOrder(restored,{request:async method=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:1001},value:[null]};
  throw Error('NO_SEND_ALLOWED');
 }});
 assert.equal(pending.state,'UNKNOWN');assert.equal(pending.mayRetry,false);
 assert.throws(()=>afterCrash.recordFinalized(id,owner,pending));
 assert.equal(afterCrash.heldWorkflows(f.wallet)[0].state,'HELD');
});

test('only exact sealed finalized fill advances position; finalized attempt does not release workflow',async t=>{
 const f=await fixture(t),claim=f.prepare();f.journal.persistSigned(claim,f.signedBase64);const row=f.journal.markBroadcast(id,owner);
 const proof=await f.journal.recoveryEvidence(id,owner),plan=f.review.plan,quote=BigInt(plan.baseLots)*123456n,fee=(quote*350n+999999n)/1000000n;
 const result=await reconcilePhoenixOrder(proof,{request:async method=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:1001},value:[{slot:1001,confirmationStatus:'finalized',err:null}]};
  if(method==='getTransaction')return {slot:1001,transaction:[f.signedBase64,'base64'],meta:{err:null,fee:5600,
   innerInstructions:phoenixEventBatches({wire:f.wire,plan,traderAddress:f.a.trader,slot:1001,timestamp:Math.floor(f.now()/1000),quote,fee,
    postBase:BigInt(plan.baseLots),postVirtual:-quote,postCollateral:10000000n-fee})}};
  throw Error('NO_SEND_ALLOWED');
 }});
 assert.equal(result.signature,row.signature);assert.throws(()=>f.journal.recordFinalized(id,owner,{...result}));
 const workflow=f.journal.recordFinalized(id,owner,result);assert.equal(workflow.state,'OPEN');
 assert.equal(f.journal.pending(f.wallet).length,0);assert.equal(f.journal.heldWorkflows(f.wallet).length,1);
 f.journal.close();const reopened=f.open({initialize:false,explicitOperatorApproval:false});
 assert.equal(reopened.readWorkflow(workflowId,owner).state,'OPEN');assert.equal(reopened.readAttempt(id,owner).state,'FINALIZED');
 assert.throws(()=>reopened.recordFinalized(id,owner,result));
 // Closing uses current authorization, not stale opening policy. A partial or
 // missing payout must still leave the workflow held after a finalized close.
 const close=await phoenixSimulationFixture({wallet:f.wallet,close:true});
 const closeSimulation=await simulatePhoenixOrder(close.args,close.simulationOptions);
 const closeClaim=reopened.prepareOrder({id:other,workflowId,ownerAccountHash:owner,controlRevision:'revision-2',wire:close.wire,simulation:closeSimulation,request:close.request});
 assert.throws(()=>reopened.recordCloseConsent({id:other,ownerAccountHash:owner,maximumLamports:'30000',expiresAt:f.now()+300000}));
 assert.throws(()=>reopened.recordCloseConsent({id:other,ownerAccountHash:other,maximumLamports:'30000',expiresAt:f.now()+300000,explicitApproval:true}));
 const consent=reopened.recordCloseConsent({id:other,ownerAccountHash:owner,maximumLamports:'30000',expiresAt:f.now()+300000,explicitApproval:true});
 assert.equal(consent.workflow,workflowId);assert.equal(reopened.closeConsent(workflowId,owner).maximum_lamports,'30000');
 assert.throws(()=>reopened.recordCloseConsent({id:other,ownerAccountHash:owner,maximumLamports:'30000',expiresAt:f.now()+300000,explicitApproval:true}));
 const closeSigned=f.signWire(close.wire);reopened.persistSigned(closeClaim,closeSigned);reopened.markBroadcast(other,owner);
 const closeProof=await reopened.recoveryEvidence(other,owner),closePlan=close.review.plan,closeQuote=BigInt(closePlan.baseLots)*123456n;
 const closeResult=await reconcilePhoenixOrder(closeProof,{request:async method=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSignatureStatuses')return {context:{slot:1001},value:[{slot:1001,confirmationStatus:'finalized',err:null}]};
  if(method==='getTransaction')return {slot:1001,transaction:[closeSigned,'base64'],meta:{err:null,fee:5600,
   innerInstructions:phoenixEventBatches({wire:close.wire,plan:closePlan,traderAddress:close.a.trader,slot:1001,timestamp:Math.floor(close.now()/1000),quote:closeQuote,
    fee:(closeQuote*350n+999999n)/1000000n,postBase:0n,postVirtual:0n,postCollateral:10010000n})}};
  throw Error('NO_SEND_ALLOWED');
 }});
 assert.equal(reopened.recordFinalized(other,owner,closeResult).state,'SETTLING');assert.equal(closeResult.walletCredited,false);
 reopened.close();assert.equal(f.open().heldWorkflows(f.wallet)[0].state,'SETTLING');
});

test('only never-signed preparation can be cancelled after restart without holding the next attempt',async t=>{
 const f=await fixture(t);f.prepare();f.journal.close();const reopened=f.open();
 assert.throws(()=>reopened.recoverUnsignedOrder(id,other));
 assert.equal(reopened.recoverUnsignedOrder(id,owner).state,'CANCELLED');
 assert.equal(reopened.heldWorkflows(f.wallet).length,0);assert.equal(reopened.pending(f.wallet).length,0);
 const next=f.prepare(reopened,{id:other,workflowId:other});reopened.persistSigned(next,f.signedBase64);
 assert.throws(()=>reopened.recoverUnsignedOrder(other,owner));
 assert.equal(reopened.pending(f.wallet)[0].state,'SIGNED');
 reopened.close();assert.equal(f.open().heldWorkflows(f.wallet).length,1);
});

test('missing/unrelated database is never initialized without explicit approval',async t=>{
 const f=await fixture(t),missing=join(f.root,'missing.sqlite');
 assert.throws(()=>openPhoenixExecutionJournal(missing,{...opts,initialize:false}));
 const unrelated=join(f.root,'unrelated.sqlite'),db=new DatabaseSync(unrelated);db.exec('CREATE TABLE unrelated(id TEXT)');db.close();chmodSync(unrelated,0o600);
 assert.throws(()=>openPhoenixExecutionJournal(unrelated,opts),/JOURNAL_UNAVAILABLE/);
});
