// Bounded restart reconciliation only. No cancellation builder, signing, send,
// replacement attempt or parent-entry closure capability is used here.
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
export async function reconcilePendingPerpsExitCancellations(journal,walletAddress,{request,now=Date.now,limit=20}={}){
 if(typeof journal?.pendingExitCancellations!=='function'||typeof journal?.reconcileExitCancellation!=='function'
  ||typeof request!=='function'||typeof now!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_CANCELLATION_RECOVERY');
 const result={checked:0,confirmed:0,failed:0,unresolved:0,manualReview:0,deferred:0};
 for(const row of journal.pendingExitCancellations(walletAddress)){
  if(row.state!=='UNCERTAIN'){result.manualReview++;continue;}
  if(result.checked>=limit){result.deferred++;continue;}result.checked++;
  try{
   const receipt=await readPerpsBroadcastReceipt({walletAddress:row.wallet,signature:row.signature,wireHash:row.wire_hash},request,{now,requireFinalized:true});
   if(!receipt){result.unresolved++;continue;}
   const value=journal.reconcileExitCancellation(row.id,receipt);
   if(value.state==='CONFIRMED')result.confirmed++;else if(value.state==='FAILED')result.failed++;else throw Error('INVALID_CANCELLATION_RECOVERY');
  }catch{result.unresolved++;}
 }
 return Object.freeze(result);
}
