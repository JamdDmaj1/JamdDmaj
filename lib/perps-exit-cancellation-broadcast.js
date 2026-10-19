// At most one attempt per durable cancellation identity. HTTP success is not
// chain confirmation. No retry, implicit fetch, wallet selection or key access.
import {readOwnerSignedPerpsExitCancellation} from './perps-exit-cancellation-signing.js';
const ENDPOINT='https://perps-api.jup.ag/v2/transaction/execute';
function fail(){throw Error('PERPS_CANCELLATION_BROADCAST_NOT_AUTHORIZED');}
export function createServerPerpsExitCancellationBroadcaster({journal,fetchImpl}={}){
 if(typeof journal?.readExitCancellation!=='function'||typeof journal?.recordExitCancellationBroadcastIntent!=='function'||typeof fetchImpl!=='function')fail();
 return async function submit(signed,{ownerAccountHash,controlRevision}={}){
  const first=readOwnerSignedPerpsExitCancellation(signed,{journal}),authority=first.authorization;
  if(authority.ownerAccountHash!==ownerAccountHash||authority.controlRevision!==controlRevision)fail();
  // Re-read native request/funds, block height, controls, backup and runtime
  // readiness after signature creation. These readers are bound in the private
  // authorization, not replaceable by submission arguments.
  await authority.revalidateFreshForBroadcast();
  const envelope=readOwnerSignedPerpsExitCancellation(signed,{journal});
  journal.recordExitCancellationBroadcastIntent(signed.cancellationId,{walletAddress:signed.walletAddress,signature:signed.signature,wireHash:signed.wireHash});
  const row=journal.readExitCancellation(signed.cancellationId);
  if(row?.state!=='UNCERTAIN'||row.wallet!==signed.walletAddress||row.address!==signed.exitAddress||row.signature!==signed.signature||row.wire_hash!==signed.wireHash)fail();
  // No await occurs between the last private check, the durable write and this
  // single transport attempt. A concurrent submit loses the SIGNING-bound check.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader,acknowledged=false;
  try{
   const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({action:'cancel-tpsl',serializedTxBase64:envelope.signedBase64})});
   if(response?.status!==200||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error();
   reader=response.body.getReader();const chunks=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)throw Error();chunks.push(Buffer.from(part.value));}
   if(controller.signal.aborted)throw Error();const body=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
   acknowledged=body?.action==='cancel-tpsl'&&body.txid===signed.signature;
  }catch{ /* Uncertainty is never permission to resend or free collateral. */ }
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  return Object.freeze({stage:acknowledged?'CANCELLATION_BROADCAST_ACKNOWLEDGED':'CANCELLATION_BROADCAST_UNKNOWN',walletAddress:signed.walletAddress,
   cancellationId:signed.cancellationId,signature:signed.signature,state:'UNCERTAIN',requiresChainReconciliation:true,readyForRetry:false});
 };
}
