// Server-only, durable single-host submission barrier. Never place this file
// in Vercel /tmp. No TTL, deletion, unlock, signer or network send is exposed.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {validateWebPerpsSigningPacket,webPerpsReviewBindingText} from './perps-web-review-protocol.js';
import {verifyWebPerpsOwnerSignature} from './perps-web-envelope.js';
import {readInspectedPerpsManualReview} from './perps-manual-preparation.js';
const proofs=new WeakMap();
const schema=`CREATE TABLE web_perps_submissions (
 review_id TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE,
 signature TEXT NOT NULL UNIQUE, wire_hash TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state='UNCERTAIN'),
 packet_json TEXT NOT NULL, signed_base64 TEXT NOT NULL,
 created INTEGER NOT NULL CHECK(created>=0)
) STRICT`;
function fail(){throw Error('WEB_PERPS_SUBMISSION_NOT_DURABLE');}
function id(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}

// The HTTP packet alone is never sufficient: the original same-origin review
// must still exist and its SAME wire must pass a fresh full native inspection.
export async function inspectWebPerpsSubmission(packet,signedBase64,{reviewStore,rpcRequest,now=Date.now,monotonicNow=()=>performance.now()}={}){
 packet=structuredClone(packet);
 await validateWebPerpsSigningPacket(packet,{draft:packet.review?.draft,walletAddress:packet.review?.walletAddress,now:now()});
 const signed=verifyWebPerpsOwnerSignature(signedBase64,packet.preparation.serializedTxBase64,packet.review.walletAddress);
 if(JSON.stringify(await reviewStore.read(packet.reviewId))!==JSON.stringify(packet))fail();
 const native=await reviewStore.revalidate(packet.reviewId,{rpcRequest,monotonicNow}),proof=readInspectedPerpsManualReview(native);
 if(proof.material.serializedTxBase64!==packet.preparation.serializedTxBase64||native.walletAddress!==packet.review.walletAddress
  ||JSON.stringify(native.draft)!==JSON.stringify(packet.review.draft)||native.marginUsdcUnits!==packet.review.marginUsdcUnits||native.sizeUsdUnits!==packet.review.sizeUsdUnits
  ||BigInt(native.networkFeeLamports)>BigInt(packet.review.networkFeeLamports)||BigInt(native.rentLockedLamports)>BigInt(packet.review.rentLockedLamports))fail();
 if(JSON.stringify(await reviewStore.read(packet.reviewId))!==JSON.stringify(packet)||now()>=packet.review.expiresAt)fail();
 readInspectedPerpsManualReview(native);
 const value=Object.freeze({stage:'WEB_PERPS_SUBMISSION_INSPECTED',reviewId:packet.reviewId,walletAddress:packet.review.walletAddress,signature:signed.signature,readyForBroadcast:false});
 proofs.set(value,{packet,signedBase64,signature:signed.signature,native,now,used:false});return value;
}

export function openWebPerpsSubmissionJournal({filename,now=Date.now}={}){
 if(typeof filename!=='string'||!isAbsolute(filename)||typeof now!=='function')fail();
 const db=new DatabaseSync(filename);let closed=false;
 try{
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  const existing=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='web_perps_submissions'").get();
  if(!existing)db.exec(schema);else if(existing.sql!==schema)fail();
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail();
 }catch(error){db.close();throw error;}
 function live(){if(closed||db.prepare('PRAGMA synchronous').get().synchronous!==2)fail();}
 function read(reviewId){
  live();const row=db.prepare('SELECT * FROM web_perps_submissions WHERE review_id=?').get(id(reviewId));
  if(!row)return null;
  const packet=JSON.parse(row.packet_json),signed=verifyWebPerpsOwnerSignature(row.signed_base64,packet.preparation.serializedTxBase64,row.wallet);
  if(packet.reviewId!==row.review_id||packet.review.walletAddress!==row.wallet||signed.signature!==row.signature||row.state!=='UNCERTAIN'
   ||createHash('sha256').update(Buffer.from(row.signed_base64,'base64')).digest('hex')!==row.wire_hash
   ||createHash('sha256').update(webPerpsReviewBindingText(packet)).digest('hex')!==packet.recordBinding)fail();
  return Object.freeze({...row});
 }
 return Object.freeze({
  close(){if(!closed){closed=true;db.close();}},
  read,
  pending(wallet){live();const row=db.prepare('SELECT review_id FROM web_perps_submissions WHERE wallet=?').get(wallet);return row?read(row.review_id):null;},
  claim(evidence){
   live();const proof=proofs.get(evidence);if(!proof||proof.used)fail();proof.used=true;
   readInspectedPerpsManualReview(proof.native);
   const at=now();if(!Number.isSafeInteger(at)||at<proof.packet.review.observedAt||at>=proof.packet.review.expiresAt||proof.now()>=proof.packet.review.expiresAt)fail();
   const row={review_id:proof.packet.reviewId,wallet:proof.packet.review.walletAddress,signature:proof.signature,
    wire_hash:createHash('sha256').update(Buffer.from(proof.signedBase64,'base64')).digest('hex'),state:'UNCERTAIN',packet_json:JSON.stringify(proof.packet),signed_base64:proof.signedBase64,created:at};
   try{
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT INTO web_perps_submissions (review_id,wallet,signature,wire_hash,state,packet_json,signed_base64,created) VALUES (?,?,?,?,?,?,?,?)')
     .run(row.review_id,row.wallet,row.signature,row.wire_hash,row.state,row.packet_json,row.signed_base64,row.created);
    readInspectedPerpsManualReview(proof.native);if(now()>=proof.packet.review.expiresAt)fail();
    db.exec('COMMIT');
   }catch{try{db.exec('ROLLBACK');}catch{}fail();}
   // A failed readback leaves the committed UNCERTAIN row locked. It must
   // never be interpreted as permission to insert/send again.
   const saved=read(row.review_id);if(JSON.stringify(saved)!==JSON.stringify(row))fail();
   return Object.freeze({stage:'WEB_PERPS_SUBMISSION_DURABLY_HELD',reviewId:row.review_id,walletAddress:row.wallet,signature:row.signature,
    state:'UNCERTAIN',readyForBroadcast:false,requiresFinalizedReconciliation:true});
  }
 });
}
