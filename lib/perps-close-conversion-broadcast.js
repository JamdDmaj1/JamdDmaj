// Single-attempt direct Solana RPC for a privately authorized Swap2 conversion.
// Never use Jupiter's keeper execute endpoint for this one-owner transaction.
import {readAuthorizedPerpsCloseConversionSignature} from './perps-close-conversion-signing.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
const ENDPOINT='https://api.mainnet-beta.solana.com';
function fail(){throw Error('PERPS_CLOSE_CONVERSION_BROADCAST_NOT_AUTHORIZED');}
export function createPerpsCloseConversionBroadcaster({journal,fetchImpl}={}){
 requirePerpsExecutionJournal(journal);if(typeof fetchImpl!=='function')fail();
 return async(signed,{ownerAccountHash,controlRevision}={})=>{
  const original=readAuthorizedPerpsCloseConversionSignature(signed,{journal}),authority=original.authority;
  if(authority.ownerAccountHash!==ownerAccountHash||authority.controlRevision!==controlRevision)fail();
  await authority.revalidateFreshForBroadcast();
  const proof=readAuthorizedPerpsCloseConversionSignature(signed,{journal});
  journal.recordPositionCloseConversionBroadcast(signed.closeId,proof.intent);
  const row=journal.readPositionCloseConversion(signed.closeId);
  if(row?.state!=='UNCERTAIN'||row.signature!==signed.signature||row.wire_hash!==signed.wireHash||row.owner_signed_wire!==proof.encoded)fail();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader,acknowledged=false;
  try{
   const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[proof.encoded,
     {encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0,minContextSlot:authority.latestSimulation().observedSlot}]})});
   if(response.status!==200||response.redirected||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error();
   reader=response.body?.getReader();if(!reader)throw Error();const parts=[];let size=0;
   while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>4096)throw Error();parts.push(Buffer.from(item.value));}
   if(controller.signal.aborted)throw Error();const data=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   acknowledged=data?.jsonrpc==='2.0'&&data.id===1&&!data.error&&data.result===signed.signature;
  }catch{/* Persisted uncertainty is never permission to retry or release risk. */}
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  return Object.freeze({stage:acknowledged?'CLOSE_CONVERSION_BROADCAST_ACKNOWLEDGED':'CLOSE_CONVERSION_BROADCAST_UNKNOWN',closeId:signed.closeId,
   walletAddress:signed.walletAddress,signature:signed.signature,state:'UNCERTAIN',requiresChainReconciliation:true,readyForRetry:false});
 };
}
