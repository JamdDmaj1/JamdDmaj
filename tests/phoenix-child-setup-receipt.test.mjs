import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {reconcilePhoenixChildSetup,requirePhoenixChildSetupReceipt} from '../lib/phoenix-child-setup-receipt.js';
import {openPhoenixExecutionJournal} from '../lib/phoenix-execution-journal.js';
import {phoenixChildSetupReceiptFixture} from './helpers/phoenix-child-setup-receipt-fixture.mjs';
test('signed local native setup verifies fee/rent, system creation and protected wallet-owned state after quote expiry',async()=>{
 const f=phoenixChildSetupReceiptFixture(),r=await reconcilePhoenixChildSetup(f.row,f);
 assert.equal(r.state,'READY');assert.equal(r.networkFeeLamports,'5300');assert.equal(r.rentLockedLamports,JSON.parse(f.row.simulation).rentLockedLamports);
 assert.equal(r.authorizesTrading,false);assert.equal(r.mayRetry,false);assert.equal(requirePhoenixChildSetupReceipt(r),r);assert.throws(()=>requirePhoenixChildSetupReceipt({...r}));
 assert.ok(f.calls.every(c=>['getGenesisHash','getSignatureStatuses','getTransaction','getMultipleAccounts'].includes(c.method)));
});
test('lost/confirmed-only setup responses remain unknown without retry permission',async()=>{
 for(const mode of ['missing-status','confirmed','missing-tx']){
  const f=phoenixChildSetupReceiptFixture(),request=async(method,params)=>{
   if(method==='getSignatureStatuses'&&mode!=='missing-tx')return {context:{slot:f.tx.slot},value:[mode==='missing-status'?null:{slot:f.tx.slot,confirmationStatus:'confirmed',err:null}]};
   if(method==='getTransaction'&&mode==='missing-tx')return null;return f.request(method,params);
  };
  const result=await reconcilePhoenixChildSetup(f.row,{request,now:f.now});assert.equal(result.state,'UNKNOWN');assert.equal(result.mayRetry,false);
 }
});
test('modified wire, wrong fees/rent, unrelated SOL change, absent CPI and unsafe post-state cannot become READY',async()=>{
 for(const mutate of [f=>{const b=Buffer.from(f.tx.transaction[0],'base64');b[1]^=1;f.tx.transaction[0]=b.toString('base64');},
  f=>{f.tx.meta.fee++;},f=>{f.tx.meta.postBalances[0]--;},f=>{f.tx.meta.postBalances[1]++;},f=>{f.tx.meta.innerInstructions=[];},
  f=>{f.accounts.context.slot=f.tx.slot-1;},f=>{f.tx.blockTime=Number.MAX_SAFE_INTEGER;},
  f=>{const b=Buffer.from(f.accounts.value[0].data[0],'base64');b.writeUInt32LE(0,116);f.accounts.value[0].data[0]=b.toString('base64');},
  f=>{const b=Buffer.from(f.accounts.value[1].data[0],'base64');b.writeBigInt64LE(1n,88);f.accounts.value[1].data[0]=b.toString('base64');},
  f=>{const b=Buffer.from(f.accounts.value[1].data[0],'base64');b.set(Buffer.alloc(32,9),120);f.accounts.value[1].data[0]=b.toString('base64');}]){
  const f=phoenixChildSetupReceiptFixture();mutate(f);await assert.rejects(()=>reconcilePhoenixChildSetup(f.row,f));
 }
});
test('failed setup is finalized as failed with only network cost, never readiness or an automatic retry',async()=>{
 const f=phoenixChildSetupReceiptFixture();f.tx.meta.err={InstructionError:[3,'Custom']};f.tx.meta.postBalances=[...f.tx.meta.preBalances];f.tx.meta.postBalances[0]-=f.tx.meta.fee;
 const r=await reconcilePhoenixChildSetup(f.row,f);assert.equal(r.state,'FAILED');assert.equal(r.rentLockedLamports,'0');assert.equal(r.requiresNewReview,true);assert.equal(r.mayRetry,false);
});
test('only sealed native setup finality releases the pending hold and survives a closed/reopened ledger',async t=>{
 const f=phoenixChildSetupReceiptFixture(),root=mkdtempSync(join(tmpdir(),'jamd-child-finality-'));chmodSync(root,0o700);const path=join(root,'phoenix.sqlite');
 const options={allowNonPosixForTests:process.platform==='win32',now:f.now};let journal=openPhoenixExecutionJournal(path,{...options,initialize:true,explicitOperatorApproval:true});
 t.after(()=>{journal.close();if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith('jamd-child-finality-'))throw Error('TEST_TEMP_PATH');rmSync(root,{recursive:true,force:true});});journal.close();
 // Import captured LOCAL test recovery evidence, not a live signing grant.
 const db=new DatabaseSync(path),r=f.row;db.prepare('INSERT INTO phoenix_setup_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(r.id,r.owner,r.wallet,r.revision,r.phase,r.parent,r.message,r.message_hash,r.last_height,r.maximum_lamports,r.expires,r.preparation,r.simulation,r.state,r.signature,r.signed,r.receipt,r.created,r.updated);db.close();
 journal=openPhoenixExecutionJournal(path,options);assert.equal(journal.pending(f.row.wallet)[0].kind,'CHILD');const receipt=await journal.childSetupReceipt(r.id,r.owner,f);
 assert.throws(()=>journal.recordFinalizedChildSetup(r.id,r.owner,{...receipt}));journal.recordFinalizedChildSetup(r.id,r.owner,receipt);assert.equal(journal.pending(r.wallet).length,0);
 journal.close();journal=openPhoenixExecutionJournal(path,options);assert.equal(journal.readChildSetup(r.id,r.owner).state,'FINALIZED');assert.equal(journal.readParentAttempt(r.id,r.owner),null);
 assert.throws(()=>journal.recordFinalizedChildSetup(r.id,r.owner,receipt));assert.equal(journal.readChildSetup(r.id,'a'.repeat(64)),null);
});
