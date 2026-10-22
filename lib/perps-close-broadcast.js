// One native keeper attempt. Acknowledgement is not chain finality. Persist
// uncertainty BEFORE transport, never retry or change the reviewed message.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {readAuthorizedNativePerpsCloseSignature} from './perps-close-signing.js';
const ENDPOINT='https://perps-api.jup.ag/v2/transaction/execute';
function fail(){throw Error('PERPS_NATIVE_CLOSE_BROADCAST_NOT_AUTHORIZED');}
export function createNativePerpsCloseBroadcaster({journal,fetchImpl}={}){
 requirePerpsExecutionJournal(journal);if(typeof fetchImpl!=='function')fail();
 return async(signed,{ownerAccountHash,controlRevision}={})=>{
  const original=readAuthorizedNativePerpsCloseSignature(signed,{journal}),authority=original.authority;
  if(authority.ownerAccountHash!==ownerAccountHash||authority.controlRevision!==controlRevision)fail();
  await authority.revalidateFreshForBroadcast();
  const proof=readAuthorizedNativePerpsCloseSignature(signed,{journal});
  journal.recordPositionCloseBroadcast(signed.closeId,proof.intent);
  const row=journal.readPositionCloseExecution(signed.closeId);
  if(row?.state!=='UNCERTAIN'||row.signature!==signed.signature||row.wire_hash!==signed.wireHash||row.owner_signed_wire!==proof.encoded)fail();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader,acknowledged=false;
  try{
   const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({action:'decrease-position',serializedTxBase64:proof.encoded})});
   if(response?.status!==200||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error();
   reader=response.body.getReader();const parts=[];let size=0;
   while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>4096)throw Error();parts.push(Buffer.from(item.value));}
   if(controller.signal.aborted)throw Error();const data=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   acknowledged=data?.action==='decrease-position'&&data.txid===signed.signature;
  }catch{/* Unknown transport outcome is never authority to send again. */}
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  return Object.freeze({stage:acknowledged?'NATIVE_CLOSE_BROADCAST_ACKNOWLEDGED':'NATIVE_CLOSE_BROADCAST_UNKNOWN',closeId:signed.closeId,
   walletAddress:signed.walletAddress,signature:signed.signature,state:'UNCERTAIN',requiresChainReconciliation:true,readyForRetry:false});
 };
}
