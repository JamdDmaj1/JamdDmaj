// Private capability for ONE inspected manual entry in exclusive custody.
// Never accepts transaction bytes, a wallet address or approval from HTTP alone.
import {createHash} from 'node:crypto';
import {readInspectedPerpsManualReview} from './perps-manual-preparation.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
import {verifyWebPerpsOwnerSignature} from './perps-web-envelope.js';
const grants=new WeakMap();
function fail(){throw Error('BOT_MANUAL_SIGNING_NOT_AUTHORIZED');}
export async function authorizeBotManualSigning(review,{ownerAccountHash,journal,reservationId,readAccount,backupRegistry,readLimits,assertCurrent,explicitApproval}={}){
 requirePerpsExecutionJournal(journal);
 if(explicitApproval!==true||typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)
  ||[readAccount,readLimits,assertCurrent].some(fn=>typeof fn!=='function')||typeof backupRegistry?.readVerified!=='function')fail();
 const native=readInspectedPerpsManualReview(review),walletAddress=review.walletAddress;
 const who={ownerAccountHash,walletAddress},expected=JSON.stringify(readLimits(who));
 const snapshot=await readAccount({...who,minimumSlot:review.observedSlot});
 function revalidate(){
  assertCurrent(who);readInspectedPerpsManualReview(review);
  requireFreshServerPerpsDailyAccount(snapshot,{walletAddress,minimumSlot:review.observedSlot,journal});
  const policy=readLimits(who);if(JSON.stringify(policy)!==expected||policy.walletAddress!==walletAddress)fail();
  requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  const row=journal.read(reservationId);
  if(row?.state!=='SIGNING'||row.wallet!==walletAddress||row.signal!=='manual:'+reservationId
   ||String(row.margin)!==review.marginUsdcUnits||row.position_address!==native.material.positionPubkey
   ||row.entry_exit_plan!==canonicalServerPerpsEntryExitPlan(native.entryExitPlan))fail();
  journal.revalidateSigning(reservationId,{limits:policy.limits,snapshot});
 }
 revalidate();
 const grant=Object.freeze({stage:'ONE_USE_BOT_MANUAL_ENTRY',reservationId});
 grants.set(grant,{who,review,native,revalidate,used:false});return grant;
}
export function consumeBotManualSigning(grant){
 const proof=grants.get(grant);if(!proof||proof.used)fail();proof.revalidate();proof.used=true;
 return Object.freeze({...proof.who,serializedTxBase64:proof.native.material.serializedTxBase64,revalidate:proof.revalidate,
  verify(signedBase64){
   proof.revalidate();
   const signed=verifyWebPerpsOwnerSignature(signedBase64,proof.native.material.serializedTxBase64,proof.who.walletAddress);
   return Object.freeze({signedBase64,signature:signed.signature,wireHash:createHash('sha256').update(Buffer.from(signedBase64,'base64')).digest('hex')});
  }});
}
