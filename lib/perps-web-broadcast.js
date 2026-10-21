// Fixed Jupiter transport. No implicit fetch, keys, replacement quote or retry.
// An HTTP acknowledgement is never reported as a confirmed/open position.
import {requireWebPerpsSubmissionJournal,consumeWebPerpsSubmissionClaim} from './perps-web-submission-journal.js';
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
const endpoint='https://perps-api.jup.ag/v2/transaction/execute';
function fail(){throw Error('WEB_PERPS_BROADCAST_NOT_AUTHORIZED');}
export function createWebPerpsBroadcaster({journal,fetchImpl}={}){
 requireWebPerpsSubmissionJournal(journal);if(typeof fetchImpl!=='function')fail();
 return async evidence=>{
  const claim=journal.claim(evidence),held=consumeWebPerpsSubmissionClaim(claim,{journal});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader,acknowledged=false;
  try{
   // Durable uncertainty and a one-use original native capability precede
   // the ONLY network attempt, including on thrown fetch or HTTP rejection.
   const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({action:'increase-position',serializedTxBase64:held.signedBase64})});
   if(response?.status!==200||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error();
   reader=response.body.getReader();const parts=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)throw Error();parts.push(Buffer.from(part.value));}
   if(controller.signal.aborted)throw Error();const result=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   acknowledged=result&&Object.keys(result).sort().join(',')==='action,txid'&&result.action==='increase-position'&&result.txid===held.signature;
  }catch{ /* All ambiguity remains held for read-only chain reconciliation. */ }
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  return Object.freeze({stage:acknowledged?'WEB_PERPS_BROADCAST_ACKNOWLEDGED':'WEB_PERPS_BROADCAST_UNKNOWN',reviewId:held.reviewId,walletAddress:held.walletAddress,
   signature:held.signature,state:'UNCERTAIN',requiresFinalizedReconciliation:true,readyForRetry:false,tradingEnabled:false});
 };
}

// Read-only NETWORK observation of the RECORDED identity; never the client's
// txid. A verified rooted receipt is retained in the permanent local ledger.
// Finalized transaction success alone does not prove the full position/economy
// or authorize unlocking collateral, so the durable row remains UNCERTAIN.
export async function readWebPerpsSubmissionReceipt(reviewId,{journal,rpcRequest,now=Date.now}={}){
 requireWebPerpsSubmissionJournal(journal);if(typeof rpcRequest!=='function')fail();
 const row=journal.read(reviewId);if(!row)fail();
 const receipt=await readPerpsBroadcastReceipt({walletAddress:row.wallet,signature:row.signature,wireHash:row.wire_hash},rpcRequest,{now,requireFinalized:true});
 if(JSON.stringify(journal.read(reviewId))!==JSON.stringify(row))fail();
 if(receipt===null)return null;
 if(receipt.slot<JSON.parse(row.packet_json).review.observedSlot)fail();
 journal.recordFinalizedReceipt(reviewId,receipt);
 return receipt;
}
