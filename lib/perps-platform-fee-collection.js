// The separate-payment workflow. Caller supplies an authenticated, wallet-bound
// signing UI/custody adapter. This module never loads a key or enables a bot.
import {verifySignedPerpsPlatformFeePayment,revalidatePerpsPlatformFeePayment,readPerpsPlatformFeePaymentReceipt} from './perps-platform-fee-payment.js';
import {requirePerpsPlatformFeePaymentJournal,consumePerpsPlatformFeeDispatch} from './perps-platform-fee-payment-journal.js';
function fail(){throw Error('PLATFORM_FEE_COLLECTION_NOT_AUTHORIZED');}
export async function collectReviewedPerpsPlatformFee(review,{journal,signReviewed,request,explicitApproval}={}){
 requirePerpsPlatformFeePaymentJournal(journal);
 if(explicitApproval!==true||typeof signReviewed!=='function'||typeof request!=='function')fail();
 // Committing the claim precedes the prompt. A lost prompt/result stays held;
 // another process cannot solicit a second signature for this assessment.
 const claim=journal.beginSigning(review,{explicitApproval:true});
 let signed;
 try{
  const encoded=await signReviewed(review,claim);
  signed=verifySignedPerpsPlatformFeePayment(review,encoded);
  // Exact owner-signed identity is retained even when the approval has expired
  // in the wallet dialog. Only fresh, revalidated bytes may leave this process.
  journal.recordSigned(claim,signed);
  await revalidatePerpsPlatformFeePayment(review,signed,{request});
  const dispatch=journal.claimDispatch(signed),record=consumePerpsPlatformFeeDispatch(dispatch,journal);
  // maxRetries=0: uncertainty is reconciled, never automatically replaced.
  const reply=await request('sendTransaction',[record.signed_base64,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]);
  return Object.freeze({stage:reply===record.signature?'PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED':'PLATFORM_FEE_SUBMISSION_UNKNOWN',
    assessmentId:review.assessmentId,signature:record.signature,paid:false,requiresReconciliation:true,readyForRetry:false});
 }catch{
  const record=journal.read(review.assessmentId);
  return Object.freeze({stage:record?.state==='UNKNOWN'?'PLATFORM_FEE_SUBMISSION_UNKNOWN':'PLATFORM_FEE_SIGNING_UNCONFIRMED',
    assessmentId:review.assessmentId,...record?.signature?{signature:record.signature}:{},paid:false,requiresReconciliation:true,readyForRetry:false});
 }
}
export async function reconcilePerpsPlatformFeePayment(assessmentId,{journal,request,now=Date.now}={}){
 requirePerpsPlatformFeePaymentJournal(journal);if(typeof request!=='function')fail();
 const record=journal.read(assessmentId);if(!record)fail();
 if(record.state==='SIGNING')return Object.freeze({state:'SIGNING',paid:false,requiresOwnerReview:true,readyForRetry:false});
 if(record.state==='PAID'||record.state==='FAILED')return Object.freeze({state:record.state,paid:record.state==='PAID',signature:record.signature,readyForRetry:false});
 const receipt=await readPerpsPlatformFeePaymentReceipt(record,{request,now});
 if(receipt===null)return Object.freeze({state:'UNKNOWN',paid:false,signature:record.signature,readyForRetry:false});
 const settled=journal.reconcile(assessmentId,receipt);
 return Object.freeze({state:settled.state,paid:settled.state==='PAID',signature:settled.signature,readyForRetry:false});
}
