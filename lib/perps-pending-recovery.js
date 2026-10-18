// Server worker recovery only: never prepares, signs, sends, or retries a trade.
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';

export async function reconcilePendingPerps(journal,walletAddress,{readReceipt=readPerpsBroadcastReceipt,limit=25}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_RECOVERY_LIMIT');
 const pending=journal.pending(walletAddress);
 const result={checked:0,confirmed:0,failed:0,unresolved:0,manualReview:0,deferred:0};
 for(const row of pending){
  // A crash while signing has no proven signature to query. Never cancel or
  // manufacture a replacement just because this worker has restarted.
  if(row.state!=='UNCERTAIN'){result.manualReview++;continue;}
  if(result.checked>=limit){result.deferred++;continue;}
  result.checked++;
  try{
   const receipt=await readReceipt({walletAddress:row.wallet,signature:row.signature,wireHash:row.wire_hash});
   if(receipt===null){result.unresolved++;continue;}
   // The journal independently checks proof provenance, freshness and binding.
   const settled=journal.reconcileBroadcast(row.reservation,receipt);
   if(settled.state==='OPEN')result.confirmed++;
   else if(settled.state==='CLOSED')result.failed++;
   else throw Error('INVALID_RECOVERY_RESULT');
  }catch{
   // RPC outage, changed identity, stale evidence or another worker winning
   // the reconciliation race never grants permission to send a replacement.
   result.unresolved++;
  }
 }
 return Object.freeze(result);
}
