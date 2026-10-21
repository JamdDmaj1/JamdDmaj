// One-use browser signature authorization. Only original same-origin response
// evidence may advance, and only after the IndexedDB signing claim commits.
// No network submission or generic wallet/message signing is exposed.
import {perpsNavigationDraft} from './perps-navigation.js';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {validateWebPerpsSigningPacket} from './perps-web-review-protocol.js';
import {requireWebPerpsSigningJournal,requireWebPerpsSigningClaim} from './perps-web-signing-journal.js';
import {verifyWebPerpsOwnerSignature} from './perps-web-envelope.js';
import {requireWebPerpsWalletSigningBinding,readWebPerpsWalletSession} from './perps-web-wallet-session.js';
const reviews=new WeakMap(),grants=new WeakMap(),signedProofs=new WeakMap(),submissionClaims=new WeakMap();
function fail(){throw Error('WEB_PERPS_SIGNATURE_NOT_AUTHORIZED');}
function selected(doc,address){const account=selectedWalletAccount(doc);if(account?.source!=='external'||account.address!==address)fail();}
function foreground(doc){if(doc.hidden===true||doc.visibilityState!=='visible'||doc.hasFocus?.()!==true)fail();}
function connected(doc,address,version=null){const session=readWebPerpsWalletSession(doc);if(!session||session.address!==address||version!==null&&!session.transactionVersions.includes(version))fail();}
function fresh(p){const elapsed=p.monotonicNow()-p.started,at=p.now();if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000||!Number.isSafeInteger(at)||at<p.receivedAt-2000||at>=p.packet.review.expiresAt)fail();}
export function createWebPerpsSigningReviewClient({doc,fetchImpl,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(!doc||typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 return Object.freeze({async prepare(draft){
  draft=perpsNavigationDraft(draft);const account=selectedWalletAccount(doc);if(account?.source!=='external')fail();foreground(doc);connected(doc,account.address);
  const started=monotonicNow();if(!Number.isFinite(started))fail();let reader;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetchImpl('/api/perps-signing-review',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({walletAddress:account.address,draft}),signal:controller.signal});
   if(response?.status!==200||response.redirected||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
   reader=response.body?.getReader();if(!reader)fail();const parts=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8192)fail();parts.push(part.value);}
   if(controller.signal.aborted)fail();const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}
   const reply=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!reply||Object.keys(reply).sort().join(',')!=='ok,packet'||reply.ok!==true)fail();
   // Copy before asynchronous hashing/PDA checks; outside code cannot alter
   // the exact native-reviewed packet retained for the eventual prompt.
   const packet=structuredClone(reply.packet),checked=await validateWebPerpsSigningPacket(packet,{draft,walletAddress:account.address,now:now()});
   const proof={doc,packet,checked,started,receivedAt:now(),now,monotonicNow,used:false};selected(doc,account.address);foreground(doc);connected(doc,account.address,checked.transactionVersion);fresh(proof);
   const value=Object.freeze({stage:'WEB_PERPS_REVIEW_FOR_OWNER_APPROVAL',reviewId:packet.reviewId,walletAddress:account.address,draft,
    networkFeeLamports:packet.review.networkFeeLamports,rentLockedLamports:packet.review.rentLockedLamports,expiresAt:packet.review.expiresAt,readyForSigning:false,tradingEnabled:false});
   reviews.set(value,proof);return value;
  }finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
 }});
}
export async function authorizeWebPerpsOwnerSignature(review,{doc,journal,explicitApproval}={}){
 const proof=reviews.get(review);if(!proof||proof.doc!==doc||proof.used||explicitApproval!==true)fail();
 requireWebPerpsSigningJournal(journal);selected(doc,review.walletAddress);foreground(doc);connected(doc,review.walletAddress,proof.checked.transactionVersion);fresh(proof);proof.used=true;
 const claim=await journal.beginSigning(proof.packet);requireWebPerpsSigningClaim(claim,journal);selected(doc,review.walletAddress);foreground(doc);connected(doc,review.walletAddress,proof.checked.transactionVersion);fresh(proof);
 const grant=Object.freeze({stage:'ONE_USE_WEB_PERPS_OWNER_SIGNATURE',reviewId:review.reviewId,walletAddress:review.walletAddress});
 grants.set(grant,{...proof,journal,claim,consumed:false});return grant;
}
export function consumeWebPerpsOwnerSignatureAuthorization(grant,doc){
 const proof=grants.get(grant);if(!proof||proof.consumed||proof.doc!==doc)fail();
 selected(doc,grant.walletAddress);foreground(doc);fresh(proof);requireWebPerpsSigningClaim(proof.claim,proof.journal);proof.consumed=true;
 return Object.freeze({packet:structuredClone(proof.packet),transactionVersion:proof.checked.transactionVersion,
  async record(signedBase64,binding){
   if(requireWebPerpsWalletSigningBinding(binding,doc,{current:false}).address!==grant.walletAddress)fail();
   const signed=verifyWebPerpsOwnerSignature(signedBase64,proof.packet.preparation.serializedTxBase64,grant.walletAddress);
   // Persist any exact owner signature even if the user changes account or
   // the approval expires during the prompt. Such a result is held, not sent.
   await proof.journal.recordOwnerSignature(proof.claim,signedBase64);
   const value=Object.freeze({stage:'WEB_PERPS_OWNER_SIGNATURE_HELD',reviewId:grant.reviewId,walletAddress:grant.walletAddress,signature:signed.signature,
    readyForBroadcast:false,tradingEnabled:false,requiresServerRevalidation:true,requiresSubmissionJournal:true});
   signedProofs.set(value,{proof,signedBase64,binding});return value;
  },
  revalidate(){selected(doc,grant.walletAddress);foreground(doc);fresh(proof);}
 });
}
export async function readWebPerpsOwnerSignature(value,{doc,journal}={}){
 const signed=signedProofs.get(value);if(!signed||signed.proof.doc!==doc||signed.proof.journal!==journal)fail();
 fresh(signed.proof);selected(doc,value.walletAddress);foreground(doc);requireWebPerpsWalletSigningBinding(signed.binding,doc);
 const row=await journal.read(value.reviewId);
 if(row?.state!=='OWNER_SIGNED'||row.signature!==value.signature||row.signedBase64!==signed.signedBase64||row.packetJson!==JSON.stringify(signed.proof.packet))fail();
 fresh(signed.proof);selected(doc,value.walletAddress);foreground(doc);requireWebPerpsWalletSigningBinding(signed.binding,doc);
 return Object.freeze({signedBase64:signed.signedBase64,packet:structuredClone(signed.proof.packet),requiresServerRevalidation:true,readyForBroadcast:false});
}

// This hands exact bytes to a future fixed server transport, NOT to RPC or a
// relayer. Server-side durable exclusivity and fresh native inspection remain
// mandatory. There is deliberately no fetch, retry, reset or send authority.
export async function claimWebPerpsServerHandoff(value,{doc,journal,explicitApproval}={}){
 if(explicitApproval!==true)fail();
 const signed=await readWebPerpsOwnerSignature(value,{doc,journal});
 await journal.beginSubmission(value.reviewId,{packetJson:JSON.stringify(signed.packet),signedBase64:signed.signedBase64,signature:value.signature});
 // Recheck after persistence. If this fails the row stays uncertain for
 // explicit recovery, even when no request has actually left this browser.
 const original=signedProofs.get(value);fresh(original.proof);selected(doc,value.walletAddress);foreground(doc);requireWebPerpsWalletSigningBinding(original.binding,doc);
 const claim=Object.freeze({stage:'WEB_PERPS_SERVER_HANDOFF_CLAIM',reviewId:value.reviewId,walletAddress:value.walletAddress,readyForBroadcast:false});
 submissionClaims.set(claim,{doc,journal,value,signed,used:false});return claim;
}

export async function consumeWebPerpsServerHandoff(claim,{doc,journal}={}){
 const proof=submissionClaims.get(claim);if(!proof||proof.used||proof.doc!==doc||proof.journal!==journal)fail();
 proof.used=true;
 const original=signedProofs.get(proof.value);fresh(original.proof);selected(doc,claim.walletAddress);foreground(doc);requireWebPerpsWalletSigningBinding(original.binding,doc);
 const row=await journal.read(claim.reviewId);
 if(row?.state!=='SUBMISSION_UNCERTAIN'||row.packetJson!==JSON.stringify(proof.signed.packet)||row.signedBase64!==proof.signed.signedBase64||row.signature!==proof.value.signature)fail();
 fresh(original.proof);selected(doc,claim.walletAddress);foreground(doc);requireWebPerpsWalletSigningBinding(original.binding,doc);
 return Object.freeze({reviewId:claim.reviewId,signedBase64:proof.signed.signedBase64,signature:proof.value.signature,requiresServerRevalidation:true,requiresServerSubmissionJournal:true,readyForBroadcast:false});
}
