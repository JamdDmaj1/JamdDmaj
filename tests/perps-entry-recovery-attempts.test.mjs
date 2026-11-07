// Pure identity/audit-chain tests; these rows are not native execution proofs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readEntryRecoveryAttempts,planEntryRecoveryAttempt} from '../lib/perps-entry-recovery-attempts.js';
const context={walletAddress:'11111111111111111111111111111112',reservationId:'original',conversionSignature:'original-signature'};
function fixture(){
 const rows=new Map(),read=id=>rows.get(id)??null;
 const append=(plan,state)=>{
  const row={id:plan.id,owner:'a'.repeat(64),wallet:context.walletAddress,state,
   review:JSON.stringify({stage:'ENTRY_COLLATERAL_RECOVERY_INTENT',...plan,...context,maxSlippageBps:50})};rows.set(row.id,row);return row;
 };
 return {rows,read,append};
}
test('fresh explicit review advances only an immutable never-broadcast aborted attempt',()=>{
 const f=fixture(),first=planEntryRecoveryAttempt(f.read,context),original=f.append(first,'ABORTED'),saved=JSON.stringify(original);
 const second=planEntryRecoveryAttempt(f.read,context,{previousRecoveryId:first.id});assert.notEqual(second.id,first.id);
 assert.equal(second.recoveryAttempt,1);assert.equal(second.previousRecoveryId,first.id);
 assert.throws(()=>planEntryRecoveryAttempt(f.read,context)); // stale approval
 f.append(second,'UNKNOWN');const chain=readEntryRecoveryAttempts(f.read,context);
 assert.equal(chain.current.id,second.id);assert.equal(chain.rows.length,2);assert.equal(chain.canReview,false);
 assert.equal(JSON.stringify(f.rows.get(first.id)),saved);
 assert.throws(()=>planEntryRecoveryAttempt(f.read,context,{previousRecoveryId:second.id}));
});
test('uncertain, signed-pending, finalized and on-chain failed rows never allow another attempt',()=>{
 for(const state of ['SIGNING','UNKNOWN','FINALIZED','FAILED']){
  const f=fixture(),first=planEntryRecoveryAttempt(f.read,context);f.append(first,state);
  assert.equal(readEntryRecoveryAttempts(f.read,context).canReview,false);
  assert.throws(()=>planEntryRecoveryAttempt(f.read,context,{previousRecoveryId:first.id}));
 }
});
test('legacy root remains readable; changed ancestry, owner or live predecessor are rejected',()=>{
 for(const change of ['owner','ancestor','live','missing']){
  const f=fixture(),first=planEntryRecoveryAttempt(f.read,context),root=f.append(first,'ABORTED');
  const legacy=JSON.parse(root.review);delete legacy.recoveryAttempt;delete legacy.rootRecoveryId;delete legacy.previousRecoveryId;root.review=JSON.stringify(legacy);
  const second=planEntryRecoveryAttempt(f.read,context,{previousRecoveryId:first.id}),child=f.append(second,'FINALIZED');
  if(change==='owner')child.owner='b'.repeat(64);
  if(change==='ancestor'){const review=JSON.parse(child.review);review.previousRecoveryId='f'.repeat(64);child.review=JSON.stringify(review);}
  if(change==='live')root.state='UNKNOWN';if(change==='missing')f.rows.delete(root.id);
  assert.throws(()=>readEntryRecoveryAttempts(f.read,context));
 }
});
test('attempt chain has a finite audit bound and never invents automatic retries',()=>{
 const f=fixture();let previousRecoveryId=null;
 for(let index=0;index<32;index++){
  const next=planEntryRecoveryAttempt(f.read,context,{previousRecoveryId});assert.equal(next.recoveryAttempt,index);
  f.append(next,'ABORTED');previousRecoveryId=next.id;
 }
 assert.equal(readEntryRecoveryAttempts(f.read,context).rows.length,32);
 assert.throws(()=>planEntryRecoveryAttempt(f.read,context,{previousRecoveryId}));
});

test('a failure reference plans only an immutable identity and must match its signed ancestor',()=>{
 const f=fixture(),first=planEntryRecoveryAttempt(f.read,context),root=f.append(first,'FAILED');
 root.signature='pure-fixture-signature';root.signed=Buffer.from('pure-fixture-not-a-financial-wire').toString('base64');
 const reference={signature:root.signature,wireHash:createHash('sha256').update(Buffer.from(root.signed,'base64')).digest('hex'),slot:200,day:'2026-10-20'};
 for(const change of [{signature:'other'},{wireHash:'f'.repeat(64)},{slot:-1},{day:'2026-02-31'}]){
  assert.throws(()=>planEntryRecoveryAttempt(f.read,context,{previousRecoveryId:first.id,failureReference:{...reference,...change}}));
 }
 const plan=planEntryRecoveryAttempt(f.read,context,{previousRecoveryId:first.id,failureReference:reference});
 reference.slot=201;assert.equal(plan.previousFailure.slot,200);assert.equal(f.rows.size,1);
 f.append(plan,'SIGNING');const chain=readEntryRecoveryAttempts(f.read,context);
 assert.equal(chain.current.id,plan.id);assert.equal(chain.canReview,false);assert.equal(chain.rows[0].state,'FAILED');
});
