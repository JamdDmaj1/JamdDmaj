// Protected first-leg lifecycle only. This is not an HTTP handler or a bot
// custody grant. Server ownership/risk/backup exclusion must wrap this engine.
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {prepareProtectedPerpsEntryConversion,readPreparedPerpsEntryConversion} from './perps-entry-conversion-preparation.js';
import {simulatePerpsEntryConversion} from './perps-entry-conversion-simulation.js';
import {createWebSwapEngine} from './web-swap-engine.js';
const grants=new WeakMap();
function fail(code='PERPS_ENTRY_CONVERSION_APPROVAL_REQUIRED'){throw Error(code);}
export async function consumePerpsEntryConversionGrant(grant,walletAddress){
 const p=grants.get(grant);grants.delete(grant);if(!p||p.walletAddress!==walletAddress)fail();
 await p.revalidate();p.markConsumed();return Object.freeze({message:Uint8Array.from(p.message),current:p.current});
}
export function createPerpsEntryConversionEngine({request,sendRequest,journal,isCurrent,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if([request,sendRequest,isCurrent,now,monotonicNow].some(fn=>typeof fn!=='function')||['read','begin','resolve'].some(k=>typeof journal?.[k]!=='function'))fail();
 const states=new WeakMap();let generation=0;
 const invalidate=()=>{generation++;};
 function current(s){if(s.generation!==generation||s.used||isCurrent()!==true||now()>=s.review.expiresAt)fail('PERPS_ENTRY_CONVERSION_REVIEW_EXPIRED');readPreparedPerpsEntryConversion(s.review);}
 async function revalidate(s){
  current(s);if(await journal.read(s.review.walletAddress))fail('PERPS_ENTRY_CONVERSION_PENDING');
  const proof=readPreparedPerpsEntryConversion(s.review),r=await simulatePerpsEntryConversion(proof.wire,{request,minimumSlot:s.review.observedSlot,now,monotonicNow});current(s);
  if(r.networkFeeLamports!==s.review.networkFeeLamports||r.rentLockedLamports!==s.review.rentLockedLamports)fail('PERPS_ENTRY_CONVERSION_COST_CHANGED');
 }
 async function prepare(draft,walletAddress){
  invalidate();const ticket=generation;if(isCurrent()!==true||await journal.read(walletAddress))fail('PERPS_ENTRY_CONVERSION_PENDING');
  const review=await prepareProtectedPerpsEntryConversion(draft,walletAddress,{request,now,monotonicNow});
  const s={review,generation:ticket,used:false,authorized:false,consumed:false};current(s);states.set(review,s);return review;
 }
 function authorize(review,explicitApproval){
  const s=states.get(review);if(!s||explicitApproval!==true||s.authorized)fail();current(s);s.authorized=true;
  const proof=readPreparedPerpsEntryConversion(review),grant=Object.freeze({});
  grants.set(grant,{walletAddress:review.walletAddress,message:Buffer.from(proof.wire.messageBase64,'base64'),current:()=>current(s),revalidate:()=>revalidate(s),markConsumed:()=>{s.consumed=true;}});return grant;
 }
 async function submit(review,signedBase64){
  const s=states.get(review);if(!s||!s.consumed)fail();current(s);
  if(typeof signedBase64!=='string'||signedBase64.length>1644)fail();
  const raw=Buffer.from(signedBase64,'base64'),proof=readPreparedPerpsEntryConversion(review),message=Buffer.from(proof.wire.messageBase64,'base64');
  if(raw.toString('base64')!==signedBase64||raw.length!==message.length+65||raw[0]!==1||!raw.subarray(65).equals(message)||!ed25519.verify(raw.subarray(1,65),message,bs58.decode(review.walletAddress),{zip215:false}))fail();
  await revalidate(s);current(s);const signature=bs58.encode(raw.subarray(1,65));s.used=true;
  // Durable uncertainty precedes the only external send. A timeout never
  // permits reuse of this review or an automatic replacement/retry.
  await journal.begin({address:review.walletAddress,signature,lastValidBlockHeight:proof.wire.lastValidBlockHeight});
  if(s.generation!==generation||isCurrent()!==true||now()>=review.expiresAt)fail('PERPS_ENTRY_CONVERSION_PENDING');readPreparedPerpsEntryConversion(review);
  const result=await sendRequest('sendTransaction',[signedBase64,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]);
  if(result!==signature)fail('PERPS_ENTRY_CONVERSION_PENDING');return signature;
 }
 // Existing strict finalized-status recovery; this does NOT prove the
 // received collateral amount. Opening still requires an exact receipt.
 const recovery=createWebSwapEngine({rpc:request,journal,now});
 return Object.freeze({prepare,authorize,submit,invalidate,checkPending:address=>recovery.checkPending(address)});
}
