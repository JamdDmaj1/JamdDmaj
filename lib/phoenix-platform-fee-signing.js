// One claimed Phoenix commission under the entry's own bounded fee consent.
// Never an automation mandate, generic transfer, order or withdrawal signer.
import {requirePhoenixExecutionJournal,requirePhoenixOrderClaim} from './phoenix-execution-journal.js';
import {requirePhoenixFeePaymentReview} from './phoenix-platform-fee-payment.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
const grants=new WeakMap(),issued=new WeakSet();
const fail=()=>{throw Error('PHOENIX_FEE_SIGNING_NOT_AUTHORIZED');};
export function authorizePhoenixFeeSigning({ownerAccountHash,journal,claim,review,controls,backupRegistry,riskJournal,swapJournal,assertUncontended,now=Date.now}={}){
 requirePhoenixExecutionJournal(journal);requirePerpsExecutionJournal(riskJournal);requireBotSwapJournal(swapJournal);
 if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)||typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||
    typeof assertUncontended!=='function'||typeof now!=='function'||issued.has(claim))fail();
 requirePhoenixFeePaymentReview(review);const initial=requirePhoenixOrderClaim(claim,journal),who={ownerAccountHash,walletAddress:review.walletAddress};
 if(initial.kind!=='FEE'||initial.owner!==ownerAccountHash||initial.wallet!==who.walletAddress||initial.message!==review.messageBase64||initial.workflow!==review.reservationId)fail();
 function revalidate(signed=false){
  requirePhoenixFeePaymentReview(review);const row=journal.readAttempt(initial.id,ownerAccountHash),state=controls.read(who),c=journal.feeConsent(initial.workflow,ownerAccountHash),at=now();
  const spent=journal.workflowAttempts(initial.workflow,ownerAccountHash).filter(r=>r.kind==='FEE'&&r.state==='FINALIZED').reduce((n,r)=>n+BigInt(JSON.parse(r.receipt).networkFeeLamports),0n);
  if(!row||row.state!==(signed?'SIGNED':'PREPARED')||row.message!==review.messageBase64||row.revision!==initial.revision||row.kind!=='FEE'||
     !c||!Number.isSafeInteger(at)||at<c.accepted||at>=c.expires||c.revision!==row.revision||spent+BigInt(review.networkFeeLamports)>BigInt(c.maximum_lamports)||
     state.walletAddress!==who.walletAddress||state.enabled!==false||state.paused!==true||state.revision!==row.revision)fail();
  if(journal.pending(who.walletAddress).some(r=>r.id!==initial.id)||swapJournal.pending(who.walletAddress).length||riskJournal.pending(who.walletAddress).length||
     riskJournal.pendingPositionCloses(who.walletAddress).length||riskJournal.pendingExitCancellations(who.walletAddress).length||riskJournal.pendingPlatformFeePayments(who.walletAddress).length)fail();
  assertUncontended(who);const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(!backup.phoenixStateIncluded||!backup.platformFeeStateIncluded||!backup.botSwapStateIncluded)fail();
 }
 revalidate();issued.add(claim);const grant=Object.freeze({stage:'ONE_USE_PHOENIX_FEE',id:initial.id});
 grants.set(grant,{...who,used:false,messageBase64:review.messageBase64,revalidate,
  persistSigned(encoded){revalidate();const row=journal.persistSigned(claim,encoded);revalidate(true);return row;}});return grant;
}
export function consumePhoenixFeeSigning(grant){const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;}
export function revalidatePhoenixFeeDispatch(grant){const p=grants.get(grant);if(!p||!p.used)fail();p.revalidate(true);return true;}
