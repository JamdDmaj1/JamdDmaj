import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {reconcilePhoenixParent,requirePhoenixParentReceipt,verifyPhoenixParentTransaction} from '../lib/phoenix-parent-receipt.js';
import {openPhoenixExecutionJournal} from '../lib/phoenix-execution-journal.js';
import {phoenixParentReceiptFixture,syntheticSameWalletParentFixture} from './helpers/phoenix-parent-receipt-fixture.mjs';
const facts=f=>verifyPhoenixParentTransaction(f.row,f.tx,{slot:JSON.parse(f.row.simulation).observedSlot+1,err:f.tx.meta.err,at:f.now()});
test('public sponsored receipt verifies provider signature and native creation facts without becoming owned consent',async()=>{
 const f=phoenixParentReceiptFixture(),r=await facts(f);
 assert.equal(r.state,'REGISTERED');assert.equal(r.networkFeeLamports,'10000');assert.equal(r.rentLockedLamports,'8371840');
 assert.throws(()=>requirePhoenixParentReceipt(r));assert.throws(()=>requirePhoenixParentReceipt({...r}));assert.equal(r.mayRetry,false);
 assert.notEqual(r.traderAuthority,r.walletAddress);await assert.rejects(()=>reconcilePhoenixParent(f.row,f));
 assert.ok(f.calls.every(c=>['getGenesisHash','getSignatureStatuses','getTransaction'].includes(c.method)));
});
test('failed transaction facts account only for the network fee and never authorize an automatic retry',async()=>{
 const f=phoenixParentReceiptFixture();f.tx.meta.err={InstructionError:[1,'Custom']};
 f.tx.meta.postBalances=[...f.tx.meta.preBalances];f.tx.meta.postBalances[0]-=10000;
 const r=await facts(f);assert.equal(r.state,'FAILED');assert.equal(r.rentLockedLamports,'0');assert.equal(r.requiresNewReview,true);assert.equal(r.mayRetry,false);
 assert.throws(()=>requirePhoenixParentReceipt(r));
});
test('pending, missing or confirmed-only results do not complete or authorize a retry',async()=>{
 for(const mode of ['missing-status','confirmed','missing-tx']){
  const f=await syntheticSameWalletParentFixture(),request=async(method,params)=>{
   if(mode==='missing-status'&&method==='getSignatureStatuses')return {context:{slot:f.tx.slot},value:[null]};
   if(mode==='confirmed'&&method==='getSignatureStatuses')return {context:{slot:f.tx.slot},value:[{slot:f.tx.slot,confirmationStatus:'confirmed',err:null}]};
   if(mode==='missing-tx'&&method==='getTransaction')return null;return f.request(method,params);
  };
  const result=await reconcilePhoenixParent(f.row,{request,now:f.now});assert.equal(result.state,'UNKNOWN');assert.equal(result.mayRetry,false);
 }
});
test('changed provider signature, native instructions, fees, rent, unrelated balance or system CPI are rejected',async()=>{
 for(const mutate of [f=>{const b=Buffer.from(f.tx.transaction[0],'base64');b[65]^=1;f.tx.transaction[0]=b.toString('base64');},
  f=>{const b=Buffer.from(f.tx.transaction[0],'base64');b[b.length-1]^=1;f.tx.transaction[0]=b.toString('base64');},
  f=>{f.tx.meta.fee++;},f=>{f.tx.meta.postBalances[0]--;},f=>{f.tx.meta.postBalances[1]--;},f=>{f.tx.meta.innerInstructions=[];},
  f=>{f.tx.meta.innerInstructions[0].instructions[0].accounts=[1,4];},f=>{f.tx.slot++;},f=>{f.tx.blockTime=Number.MAX_SAFE_INTEGER;}]){
  const f=phoenixParentReceiptFixture();mutate(f);await assert.rejects(()=>facts(f));
 }
});
test('unbranded public facts cannot release an owned same-wallet setup hold after restart',async t=>{
 const publicFacts=await facts(phoenixParentReceiptFixture()),f=await syntheticSameWalletParentFixture(),root=mkdtempSync(join(tmpdir(),'jamd-parent-finality-'));chmodSync(root,0o700);const path=join(root,'phoenix.sqlite');
 const options={allowNonPosixForTests:process.platform==='win32',now:f.now};let journal=openPhoenixExecutionJournal(path,{...options,initialize:true,explicitOperatorApproval:true});
 t.after(()=>{journal.close();rmSync(root,{recursive:true,force:true});});journal.close();
 // Seed a historical recovery record, not a live signing grant or consent.
 const db=new DatabaseSync(path);const r=f.row;db.prepare('INSERT INTO phoenix_setup_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(r.id,r.owner,r.wallet,r.revision,r.phase,r.parent,r.message,r.message_hash,r.last_height,r.maximum_lamports,r.expires,r.preparation,r.simulation,r.state,r.signature,r.signed,r.receipt,r.created,r.updated);db.close();
 journal=openPhoenixExecutionJournal(path,options);assert.equal(journal.pending(f.row.wallet).length,1);
 await assert.rejects(()=>journal.parentReceipt(f.row.id,f.row.owner,f));assert.throws(()=>journal.recordFinalizedParent(f.row.id,f.row.owner,publicFacts));
 assert.throws(()=>journal.recordFinalizedParent(f.row.id,f.row.owner,{...publicFacts,stage:'PHOENIX_PARENT_FINALIZED'}));
 assert.equal(journal.pending(f.row.wallet).length,1);journal.close();journal=openPhoenixExecutionJournal(path,options);
 assert.equal(journal.readParentAttempt(f.row.id,f.row.owner).state,'UNKNOWN');assert.equal(journal.readParentAttempt(f.row.id,'b'.repeat(64)),null);
});
