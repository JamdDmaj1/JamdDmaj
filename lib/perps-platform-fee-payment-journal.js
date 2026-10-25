// Exact payment attempts. A SIGNING or UNKNOWN result survives restart and
// cannot be retried/replaced automatically. No signature or receipt setters.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute,dirname,resolve} from 'node:path';
import {lstatSync,realpathSync,openSync,closeSync,constants} from 'node:fs';
import {readPerpsPlatformFeePaymentReview,readSignedPerpsPlatformFeePayment,requirePerpsPlatformFeePaymentReceipt} from './perps-platform-fee-payment.js';
const journals=new WeakSet(),claims=new WeakMap(),dispatches=new WeakMap();
function fail(){throw Error('PLATFORM_FEE_PAYMENT_JOURNAL_REJECTED');}
function id(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
function copy(row){return row?Object.freeze({...row}):null;}
export function requirePerpsPlatformFeePaymentJournal(journal){if(!journals.has(journal))fail();return journal;}
export function readPerpsPlatformFeeSigningClaim(claim,journal){
 const p=claims.get(claim);if(!p||p.journal!==journal)fail();const row=journal.read(claim.assessmentId);
 if(row?.state!=='SIGNING'||row.review_json!==JSON.stringify(p.review))fail();return p;
}
export function consumePerpsPlatformFeeDispatch(value,journal){
 const p=dispatches.get(value);if(!p||p.journal!==journal||p.used)fail();p.used=true;
 const row=journal.read(value.assessmentId);if(row?.state!=='UNKNOWN'||row.dispatch_attempted!==1||row.signature!==value.signature)fail();return row;
}
export function openPerpsPlatformFeePaymentJournal(path,{now=Date.now}={}){
 if(typeof path!=='string'||!isAbsolute(path)||typeof now!=='function')fail();
 const parent=lstatSync(dirname(path));if(parent.isSymbolicLink()||!parent.isDirectory()||realpathSync(dirname(path))!==resolve(dirname(path))
  ||process.platform!=='win32'&&((parent.mode&0o077)!==0||parent.uid!==process.getuid()))fail();
 try{const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);closeSync(fd);}catch(e){if(e?.code!=='EEXIST')throw e;}
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||process.platform!=='win32'&&((stat.mode&0o077)!==0||stat.uid!==process.getuid()))fail();
 const db=new DatabaseSync(path,{timeout:5000});
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().some(row=>row.name!=='perps_platform_fee_payments')){db.close();fail();}
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
  CREATE TABLE IF NOT EXISTS perps_platform_fee_payments (
   assessment_id TEXT PRIMARY KEY, wallet TEXT NOT NULL, review_json TEXT NOT NULL,
   state TEXT NOT NULL CHECK(state IN ('SIGNING','UNKNOWN','PAID','FAILED')),
   signature TEXT UNIQUE, wire_hash TEXT UNIQUE, signed_base64 TEXT,
   dispatch_attempted INTEGER NOT NULL DEFAULT 0 CHECK(dispatch_attempted IN (0,1)),
   confirmed_slot INTEGER, receipt_json TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL
  ) STRICT;
  CREATE UNIQUE INDEX IF NOT EXISTS perps_platform_fee_pending_wallet ON perps_platform_fee_payments(wallet) WHERE state IN ('SIGNING','UNKNOWN');`);
 function time(){const t=now();if(!Number.isSafeInteger(t)||t<0)fail();return t;}
 const read=assessment=>db.prepare('SELECT * FROM perps_platform_fee_payments WHERE assessment_id=?').get(id(assessment));
 function atomic(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 const journal=Object.freeze({
  read(assessment){return copy(read(assessment));},
  beginSigning(review,{explicitApproval}={}){return atomic(()=>{
   if(explicitApproval!==true)fail();readPerpsPlatformFeePaymentReview(review);if(read(review.assessmentId))fail();const at=time();
   db.prepare("INSERT INTO perps_platform_fee_payments(assessment_id,wallet,review_json,state,created,updated) VALUES(?,?,?,'SIGNING',?,?)")
     .run(review.assessmentId,review.walletAddress,JSON.stringify(review),at,at);
   readPerpsPlatformFeePaymentReview(review);
   const claim=Object.freeze({stage:'ONE_USE_SEPARATE_FEE_SIGNING_CLAIM',assessmentId:review.assessmentId,walletAddress:review.walletAddress});
   claims.set(claim,{journal,review,consumed:false});return claim;
  });},
  recordSigned(claim,signed){return atomic(()=>{
   const p=readPerpsPlatformFeeSigningClaim(claim,journal),s=readSignedPerpsPlatformFeePayment(signed);
   if(p.review!==s.review||claim.walletAddress!==signed.walletAddress||claim.assessmentId!==signed.assessmentId)fail();
   db.prepare("UPDATE perps_platform_fee_payments SET state='UNKNOWN',signature=?,wire_hash=?,signed_base64=?,updated=? WHERE assessment_id=? AND state='SIGNING'")
    .run(signed.signature,signed.wireHash,signed.signedBase64,time(),signed.assessmentId);
   return copy(read(signed.assessmentId));
  });},
  claimDispatch(signed){return atomic(()=>{
   const s=readSignedPerpsPlatformFeePayment(signed);readPerpsPlatformFeePaymentReview(s.review);
   const row=read(signed.assessmentId);if(row?.state!=='UNKNOWN'||row.dispatch_attempted!==0||row.signature!==signed.signature||row.wire_hash!==signed.wireHash||row.signed_base64!==signed.signedBase64)fail();
   db.prepare('UPDATE perps_platform_fee_payments SET dispatch_attempted=1,updated=? WHERE assessment_id=?').run(time(),signed.assessmentId);
   const value=Object.freeze({stage:'ONE_USE_SEPARATE_FEE_DISPATCH',assessmentId:signed.assessmentId,signature:signed.signature});
   dispatches.set(value,{journal,used:false});return value;
  });},
  reconcile(assessment,receipt){return atomic(()=>{
   requirePerpsPlatformFeePaymentReceipt(receipt);const row=read(assessment),at=time();
   if(!row||receipt.assessmentId!==assessment||receipt.signature!==row.signature||receipt.wireHash!==row.wire_hash||receipt.observedAt>at+2000||at-receipt.observedAt>10000)fail();
   if(row.state==='PAID'||row.state==='FAILED'){
    if(row.state!==receipt.state||row.confirmed_slot!==receipt.slot)fail();return copy(row);
   }
   if(row.state!=='UNKNOWN')fail();
   db.prepare('UPDATE perps_platform_fee_payments SET state=?,confirmed_slot=?,receipt_json=?,updated=? WHERE assessment_id=?')
    .run(receipt.state,receipt.slot,JSON.stringify(receipt),at,assessment);return copy(read(assessment));
  });},
  close(){db.close();}
 });journals.add(journal);return journal;
}
