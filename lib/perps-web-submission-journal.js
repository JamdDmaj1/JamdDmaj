// Server-only, durable single-host submission barrier. Never place this file
// in Vercel /tmp. No TTL, deletion, unlock, signer or network send is exposed.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {validateWebPerpsSigningPacket,webPerpsReviewBindingText} from './perps-web-review-protocol.js';
import {verifyWebPerpsOwnerSignature} from './perps-web-envelope.js';
import {readInspectedPerpsManualReview} from './perps-manual-preparation.js';
import {isVerifiedPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {requireVerifiedWebPerpsPosition} from './perps-web-position-recovery.js';
const proofs=new WeakMap(),journals=new WeakSet(),heldClaims=new WeakMap();
const schema=`CREATE TABLE web_perps_submissions (
 review_id TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE,
 signature TEXT NOT NULL UNIQUE, wire_hash TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state='UNCERTAIN'),
 packet_json TEXT NOT NULL, signed_base64 TEXT NOT NULL,
 created INTEGER NOT NULL CHECK(created>=0)
) STRICT`;
const receiptSchema=`CREATE TABLE web_perps_submission_receipts (
 review_id TEXT PRIMARY KEY REFERENCES web_perps_submissions(review_id),
 receipt_json TEXT NOT NULL
) STRICT`;
const positionSchema=`CREATE TABLE web_perps_position_observations (
 review_id TEXT PRIMARY KEY REFERENCES web_perps_submissions(review_id),
 row_hash TEXT NOT NULL, observation_json TEXT NOT NULL
) STRICT`;
function fail(){throw Error('WEB_PERPS_SUBMISSION_NOT_DURABLE');}
function id(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
export function readWebPerpsSubmissionInspection(value){
 const proof=proofs.get(value);if(!proof)fail();readInspectedPerpsManualReview(proof.native);
 if(proof.now()>=proof.packet.review.expiresAt)fail();return proof;
}
export function requireWebPerpsSubmissionJournal(journal){if(!journals.has(journal))fail();return journal;}
export function consumeWebPerpsSubmissionClaim(value,{journal}={}){
 const proof=heldClaims.get(value);if(!proof||proof.journal!==journal||proof.used)fail();proof.used=true;
 readInspectedPerpsManualReview(proof.inspection.native);
 if(proof.inspection.now()>=proof.inspection.packet.review.expiresAt||JSON.stringify(journal.read(value.reviewId))!==proof.rowJson)fail();
 return Object.freeze({signedBase64:proof.inspection.signedBase64,signature:value.signature,walletAddress:value.walletAddress,reviewId:value.reviewId});
}

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
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  const existing=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='web_perps_submissions'").get();
  if(!existing)db.exec(schema);else if(existing.sql!==schema)fail();
  const receipts=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='web_perps_submission_receipts'").get();
  if(!receipts)db.exec(receiptSchema);else if(receipts.sql!==receiptSchema)fail();
  const observations=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='web_perps_position_observations'").get();
  if(!observations)db.exec(positionSchema);else if(observations.sql!==positionSchema)fail();
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
 function receiptFacts(receipt,row){
  if(!receipt||Object.keys(receipt).sort().join(',')!=='confirmationStatus,executionDay,network,observedAt,signature,slot,state,walletAddress,wireHash'
   ||receipt.walletAddress!==row.wallet||receipt.signature!==row.signature||receipt.wireHash!==row.wire_hash||receipt.network!=='solana-mainnet'
   ||receipt.confirmationStatus!=='finalized'||!['CONFIRMED','FAILED'].includes(receipt.state)||!Number.isSafeInteger(receipt.slot)
   ||receipt.slot<JSON.parse(row.packet_json).review.observedSlot||!Number.isSafeInteger(receipt.observedAt)||receipt.observedAt<0
   ||!/^\d{4}-\d{2}-\d{2}$/.test(receipt.executionDay))fail();
  return Object.freeze({...receipt});
 }
 function readReceipt(reviewId){
  const row=read(reviewId);if(!row)fail();
  const stored=db.prepare('SELECT receipt_json FROM web_perps_submission_receipts WHERE review_id=?').get(reviewId);
  if(!stored)return null;if(stored.receipt_json.length>2048)fail();return receiptFacts(JSON.parse(stored.receipt_json),row);
 }
 function readPositionObservation(reviewId){
  const row=read(reviewId);if(!row)fail();
  const stored=db.prepare('SELECT row_hash,observation_json FROM web_perps_position_observations WHERE review_id=?').get(reviewId);if(!stored)return null;
  if(stored.row_hash!==createHash('sha256').update(JSON.stringify(row)).digest('hex')||stored.observation_json.length>8192)fail();
  const value=JSON.parse(stored.observation_json),packet=JSON.parse(row.packet_json),receipt=readReceipt(reviewId);
  if(value.stage!=='WEB_PERPS_FINALIZED_ENTRY_AND_CURRENT_POSITION'||value.reviewId!==reviewId||value.walletAddress!==row.wallet||value.signature!==row.signature
   ||value.positionAddress!==packet.preparation.positionPubkey||value.entrySizeUsdUnits!==packet.review.sizeUsdUnits||receipt?.state!=='CONFIRMED'||value.entrySlot!==receipt.slot
   ||!Number.isSafeInteger(value.observedAt)||value.observedAt<0||!Number.isSafeInteger(value.observedSlot)||value.observedSlot<value.entrySlot
   ||value.readyForSigning!==false||value.tradingEnabled!==false||value.requiresFinancialLedgerIntegration!==true||value.requiresReconciledDailyAccounting!==true)fail();
  // Stored facts never reconstruct the private current-observation capability.
  return Object.freeze(value);
 }
 const journal=Object.freeze({
  close(){if(!closed){closed=true;db.close();}},
  read,
  readReceipt,
  readPositionObservation,
  recordPositionObservation(value){
   requireVerifiedWebPerpsPosition(value,{journal});
   const row=read(value.reviewId),previous=readPositionObservation(value.reviewId),receipt=readReceipt(value.reviewId),text=JSON.stringify(value);
   if(!row||receipt?.state!=='CONFIRMED'||receipt.slot!==value.entrySlot||text.length>8192
    ||previous&&(value.observedSlot<previous.observedSlot||value.observedAt<previous.observedAt||value.entryExitPlan!==previous.entryExitPlan))fail();
   const rowHash=createHash('sha256').update(JSON.stringify(row)).digest('hex');
   try{
    db.exec('BEGIN IMMEDIATE');requireVerifiedWebPerpsPosition(value,{journal});
    if(JSON.stringify(readPositionObservation(value.reviewId))!==JSON.stringify(previous))fail();
    db.prepare('INSERT INTO web_perps_position_observations (review_id,row_hash,observation_json) VALUES (?,?,?) ON CONFLICT(review_id) DO UPDATE SET row_hash=excluded.row_hash,observation_json=excluded.observation_json')
     .run(value.reviewId,rowHash,text);db.exec('COMMIT');
   }catch{try{db.exec('ROLLBACK');}catch{}fail();}
   const saved=readPositionObservation(value.reviewId);if(JSON.stringify(saved)!==text)fail();return saved;
  },
  recordFinalizedReceipt(reviewId,receipt){
   const row=read(reviewId),at=now();
   if(!row||!isVerifiedPerpsBroadcastReceipt(receipt)||!Number.isSafeInteger(at)||receipt.observedAt>at+2000||at-receipt.observedAt>10000)fail();
   receiptFacts(receipt,row);
   const previous=readReceipt(reviewId);
   if(previous){
    if(previous.state!==receipt.state||previous.slot!==receipt.slot||previous.executionDay!==receipt.executionDay)fail();return previous;
   }
   try{
    db.exec('BEGIN IMMEDIATE');if(JSON.stringify(read(reviewId))!==JSON.stringify(row))fail();
    db.prepare('INSERT INTO web_perps_submission_receipts (review_id,receipt_json) VALUES (?,?)').run(reviewId,JSON.stringify(receipt));
    db.exec('COMMIT');
   }catch{try{db.exec('ROLLBACK');}catch{}fail();}
   const saved=readReceipt(reviewId);if(JSON.stringify(saved)!==JSON.stringify(receipt))fail();return saved;
  },
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
   const value=Object.freeze({stage:'WEB_PERPS_SUBMISSION_DURABLY_HELD',reviewId:row.review_id,walletAddress:row.wallet,signature:row.signature,
    state:'UNCERTAIN',readyForBroadcast:false,requiresFinalizedReconciliation:true});
   heldClaims.set(value,{journal,inspection:proof,rowJson:JSON.stringify(saved),used:false});return value;
  }
 });journals.add(journal);return journal;
}
