// Narrow bot custody grant: never an arbitrary message signer. The reviewed fee,
// prior mandate, real payment claim, shared risk lock and backup must all agree.
import {readPerpsPlatformFeePaymentReview} from './perps-platform-fee-payment.js';
import {readPerpsPlatformFeeSigningClaim} from './perps-platform-fee-payment-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
const grants=new WeakMap();
function fail(){throw Error('PLATFORM_FEE_CUSTODY_NOT_AUTHORIZED');}
export function authorizePerpsPlatformFeeCustody(review,claim,{ownerAccountHash,feeJournal,paymentJournal,riskJournal,backupRegistry,isExecutionRunning}={}){
 requirePerpsExecutionJournal(riskJournal);
 if(typeof feeJournal?.requireAutomationPaymentConsent!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof isExecutionRunning!=='function')fail();
 const identity={ownerAccountHash,walletAddress:review?.walletAddress};let revision;
 function revalidate(){
  if(isExecutionRunning()!==true)fail();
  readPerpsPlatformFeePaymentReview(review);
  const signing=readPerpsPlatformFeeSigningClaim(claim,paymentJournal);if(signing.review!==review)fail();
  const state=feeJournal.requireAutomationPaymentConsent({...identity,review,controlRevision:revision});
  if(revision===undefined)revision=state.revision;
  riskJournal.revalidatePlatformFeeLock(review);
  const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(identity),identity);
  if(backup.platformFeeStateIncluded!==true)fail();
  if(isExecutionRunning()!==true)fail();
 }
 revalidate();const grant=Object.freeze({stage:'ONE_USE_PLATFORM_FEE_CUSTODY_GRANT',assessmentId:review.assessmentId});
 grants.set(grant,{used:false,...identity,review,revalidate});return grant;
}
export function consumePerpsPlatformFeeCustody(grant){
 const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;
}
