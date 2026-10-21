// Server-only prepared-review persistence. No owner keys, signatures, wallet
// locks or financial submission are accepted by this short-lived store.
import {randomBytes} from 'node:crypto';
import {readInspectedPerpsManualReview,prepareInspectedPerpsManualOrder} from './perps-manual-preparation.js';
import {webPerpsReviewBindingText,webPerpsSha256,validateWebPerpsSigningPacket} from './perps-web-review-protocol.js';
const prefix='jamd:web-perps:review:v1:';
function fail(){throw Error('WEB_PERPS_REVIEW_NOT_DURABLE');}
function id(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
export function createWebPerpsReviewStore({command,now=Date.now}={}){
 if(typeof command!=='function'||typeof now!=='function')fail();
 const read=async reviewId=>{
  const text=await command(['GET',prefix+id(reviewId)]);
  if(typeof text!=='string'||text.length>8192)fail();let value;try{value=JSON.parse(text);}catch{fail();}
  if(value.reviewId!==reviewId)fail();
  await validateWebPerpsSigningPacket(value,{draft:value.review?.draft,walletAddress:value.review?.walletAddress,now:now()});
  return {text,value};
 };
 return Object.freeze({
  async prepare(review){
   const proof=readInspectedPerpsManualReview(review),reviewId=randomBytes(32).toString('hex');
   const value={stage:'WEB_PERPS_SIGNING_REVIEW',reviewId,review,preparation:proof.material,recordBinding:null,
    serverRecordState:'AWAITING_WALLET',readyForSigning:false,tradingEnabled:false,requiresOwnerApproval:true,requiresServerRevalidation:true};
   value.recordBinding=await webPerpsSha256(webPerpsReviewBindingText(value));readInspectedPerpsManualReview(review);
   const text=JSON.stringify(value);if(text.length>8192||await command(['SET',prefix+reviewId,text,'EX',120,'NX'])!=='OK')fail();
   readInspectedPerpsManualReview(review);const saved=await read(reviewId);readInspectedPerpsManualReview(review);
   if(saved.text!==text)fail();return Object.freeze({...value,preparation:Object.freeze({...proof.material})});
  },
  async read(reviewId){return structuredClone((await read(reviewId)).value);},
  async revalidate(reviewId,{rpcRequest,monotonicNow=()=>performance.now()}={}){
   const original=await read(reviewId),{review,preparation}=original.value;
   const verified=await prepareInspectedPerpsManualOrder(review.draft,review.walletAddress,{rpcRequest,now,monotonicNow,
    // Reinspect the ORIGINAL packet. Never request another quote/blockhash.
    builderRequest:async()=>Response.json({...preparation,quote:{side:review.draft.side.toLowerCase()},txMetadata:{blockhash:preparation.blockhash,lastValidBlockHeight:preparation.lastValidBlockHeight}})});
   const proof=readInspectedPerpsManualReview(verified),again=await read(reviewId);readInspectedPerpsManualReview(verified);
   if(again.text!==original.text||proof.material.serializedTxBase64!==preparation.serializedTxBase64||verified.marginUsdcUnits!==review.marginUsdcUnits||verified.sizeUsdUnits!==review.sizeUsdUnits
    ||BigInt(verified.networkFeeLamports)>BigInt(review.networkFeeLamports)||BigInt(verified.rentLockedLamports)>BigInt(review.rentLockedLamports))fail();
   return verified;
  }
 });
}
