// One-use same-origin handoff, not a wallet signer or direct keeper/RPC client.
// The IndexedDB uncertainty claim already exists before bytes may leave here.
import {consumeWebPerpsServerHandoff} from './perps-web-wallet-session.js';
export function createWebPerpsSubmissionClient({doc,journal,fetchImpl,readSessionToken}={}){
 if(!doc||!journal||typeof fetchImpl!=='function'||typeof readSessionToken!=='function')throw Error('WEB_SUBMISSION_CLIENT_UNAVAILABLE');
 return Object.freeze({async submit(claim){
  let session;try{session=readSessionToken();}catch{throw Error('LOGIN_REQUIRED');}
  if(typeof session!=='string'||!/^[a-f0-9]{64}$/.test(session))throw Error('LOGIN_REQUIRED');
  const held=await consumeWebPerpsServerHandoff(claim,{doc,journal});
  const unknown=()=>Object.freeze({stage:'WEB_PERPS_SUBMISSION_UNCONFIRMED',reviewId:held.reviewId,walletAddress:claim.walletAddress,
   signature:held.signature,state:'UNCERTAIN',requiresFinalizedReconciliation:true,readyForRetry:false,tradingEnabled:false});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let reader;
  try{
   if(readSessionToken()!==session)throw Error();
   const response=await fetchImpl('/api/perps-submit',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{Authorization:'Bearer '+session,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({reviewId:held.reviewId,signedBase64:held.signedBase64,signature:held.signature,explicitApproval:true})});
   if(response?.status!==200||response.redirected||!response.body||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return unknown();
   reader=response.body.getReader();let size=0;const parts=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)return unknown();parts.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),result=data?.result;
   if(controller.signal.aborted||readSessionToken()!==session||!data||Object.keys(data).sort().join(',')!=='ok,result'||data.ok!==true
    ||!result||Object.keys(result).sort().join(',')!=='requiresFinalizedReconciliation,reviewId,signature,stage,state,tradingEnabled,walletAddress,readyForRetry'.split(',').sort().join(',')
    ||!['WEB_PERPS_BROADCAST_ACKNOWLEDGED','WEB_PERPS_BROADCAST_UNKNOWN'].includes(result.stage)||result.reviewId!==held.reviewId
    ||result.walletAddress!==claim.walletAddress||result.signature!==held.signature||result.state!=='UNCERTAIN'||result.requiresFinalizedReconciliation!==true
    ||result.readyForRetry!==false||result.tradingEnabled!==false)return unknown();
   return Object.freeze({...result});
  }catch{return unknown();}finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
 }});
}
