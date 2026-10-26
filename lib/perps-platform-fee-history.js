// Exact journal-bound USDC expense; never trust arbitrary token transfers or an
// API-provided paid boolean. Network SOL is already counted by daily history.
import {requireVerifiedServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
import {readPerpsPlatformFeePaymentReceipt} from './perps-platform-fee-payment.js';
import {requirePerpsPlatformFeePaymentJournal} from './perps-platform-fee-payment-journal.js';
const proofs=new WeakSet();
export function requirePerpsPlatformFeeHistory(value){if(!proofs.has(value))throw Error('INVALID_PLATFORM_FEE_HISTORY');return value;}
export async function readJournalledPerpsPlatformFee(transaction,{paymentJournal,now=Date.now}={}){
 requireVerifiedServerPerpsTradeTransaction(transaction);
 if(paymentJournal===undefined||paymentJournal===null)return null;
 requirePerpsPlatformFeePaymentJournal(paymentJournal);
 const record=paymentJournal.readBySignature(transaction.signature);if(!record)return null;
 // Reuse the already independently verified FINALIZED transaction. This is a
 // private branded proof, not caller-supplied JSON. The exact-fee validator
 // still checks signatures, canonical memo/instruction, amounts and balances.
 // No second network round trip per historical fee is needed for accounting.
 const evidence=readVerifiedPerpsTransactionEvidence(transaction);
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(params?.[0]!==transaction.signature&&params?.[0]?.[0]!==transaction.signature)throw Error('INVALID_PLATFORM_FEE_HISTORY');
  if(method==='getSignatureStatuses')return {context:{slot:transaction.slot},value:[{slot:transaction.slot,confirmationStatus:'finalized',err:evidence.meta.err}]};
  if(method==='getTransaction')return {slot:transaction.slot,blockTime:transaction.blockTime,transaction:[evidence.wire,'base64'],meta:evidence.meta};
  throw Error('INVALID_PLATFORM_FEE_HISTORY');
 };
 const receipt=await readPerpsPlatformFeePaymentReceipt(record,{request,now});
 if(!receipt||receipt.walletAddress!==transaction.walletAddress||receipt.slot!==transaction.slot||receipt.blockTime!==transaction.blockTime
   ||(receipt.state==='FAILED')!==transaction.failed)throw Error('INVALID_PLATFORM_FEE_HISTORY');
 const value=Object.freeze({signature:transaction.signature,walletAddress:transaction.walletAddress,day:transaction.day,
  platformFeeUsdcUnits:receipt.state==='PAID'?receipt.feeUnits:'0',assessmentId:receipt.assessmentId});proofs.add(value);return value;
}
