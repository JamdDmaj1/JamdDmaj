// Phoenix wrapper around the fixed-recipient USDC fee wire/effect verifier.
// It does not make a Jupiter assessment or broaden Jupiter custody grants.
import {createHash} from 'node:crypto';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
import {requirePhoenixPlatformFeeAssessment} from './phoenix-platform-fee-assessment.js';
import {readPerpsPlatformFeePaymentReview,verifySignedPerpsPlatformFeePayment,revalidatePerpsPlatformFeePayment,
 readPerpsPlatformFeePaymentReceipt,requirePerpsPlatformFeePaymentReceipt} from './perps-platform-fee-payment.js';
const receipts=new WeakSet(),signed=new WeakMap();
const fail=()=>{throw Error('PHOENIX_FEE_PAYMENT_REJECTED');};
export function requirePhoenixFeePaymentReview(review){
 const p=readPerpsPlatformFeePaymentReview(review);if(review.stage!=='PHOENIX_PLATFORM_FEE_PAYMENT_REVIEW')fail();requirePhoenixPlatformFeeAssessment(p.assessment);return p;
}
export function capturePhoenixSignedFee(review,encoded){
 const p=requirePhoenixFeePaymentReview(review),s=verifySignedPerpsPlatformFeePayment(review,encoded),assessment=p.assessment;
 const archive=Object.freeze({phase:'FEE',version:1,walletAddress:review.walletAddress,workflowId:assessment.reservation,assessmentId:assessment.id,
  openingSignature:assessment.opening_signature,subaccountIndex:assessment.subaccountIndex,review,serializedTxBase64:encoded,signature:s.signature,wireHash:s.wireHash});
 signed.set(archive,{review,proof:s});return archive;
}
export async function revalidatePhoenixSignedFee(archive,{request}={}){const p=signed.get(archive);if(!p)fail();return revalidatePerpsPlatformFeePayment(p.review,p.proof,{request});}
export function requirePhoenixFeeReceipt(value){if(!receipts.has(value))fail();return value;}
export async function reconcilePhoenixFee(archive,{request,now=Date.now}={}){
 if(!archive||archive.phase!=='FEE'||archive.version!==1||archive.workflowId!==archive.review?.reservationId||archive.walletAddress!==archive.review?.walletAddress||
    archive.assessmentId!==archive.review?.assessmentId||archive.review.stage!=='PHOENIX_PLATFORM_FEE_PAYMENT_REVIEW'||!Number.isInteger(archive.subaccountIndex)||archive.subaccountIndex<1||archive.subaccountIndex>255)fail();
 const terms=quotePerpsPlatformFee(archive.review.marginUnits),expected=createHash('sha256').update(JSON.stringify(['phoenix',terms.version,archive.walletAddress,archive.openingSignature])).digest('hex');
 if(expected!==archive.assessmentId)fail();
 const receipt=await readPerpsPlatformFeePaymentReceipt({assessment_id:archive.assessmentId,wallet:archive.walletAddress,signature:archive.signature,
  signed_base64:archive.serializedTxBase64,wire_hash:archive.wireHash,review_json:JSON.stringify(archive.review)},{request,now});
 if(receipt===null)return Object.freeze({stage:'PHOENIX_FEE_UNRESOLVED',state:'UNKNOWN',signature:archive.signature,mayRetry:false});
 requirePerpsPlatformFeePaymentReceipt(receipt);
 const result=Object.freeze({...receipt,stage:'PHOENIX_FINALIZED_FEE',phase:'FEE',workflowId:archive.workflowId,subaccountIndex:archive.subaccountIndex,
  openingSignature:archive.openingSignature,amountUnits:receipt.feeUnits,mayRetry:false});receipts.add(result);return result;
}
