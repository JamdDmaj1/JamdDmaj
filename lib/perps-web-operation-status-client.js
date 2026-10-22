// Bounded same-origin read-only recovery. No wallet/provider or send feature.
import {requireWebPerpsSigningJournal} from './perps-web-signing-journal.js';
import {validateWebPerpsOperationStatus} from './perps-web-operation-status.js';
const proofs=new WeakMap();
function fail(){throw Error('WEB_PERPS_STATUS_NOT_VERIFIED');}
export function consumeWebPerpsOperationStatus(value,{journal}={}){
 const proof=proofs.get(value);if(!proof||proof.used||proof.journal!==journal)fail();proof.check();proof.used=true;return proof;
}
export function createWebPerpsOperationStatusClient({journal,fetchImpl,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireWebPerpsSigningJournal(journal);if(typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 return Object.freeze({async inspect(operationId){
  const row=await journal.read(operationId);if(!row||!['OWNER_SIGNED','SUBMISSION_UNCERTAIN'].includes(row.state))fail();
  const rowJson=JSON.stringify(row),started=monotonicNow(),at=now();
  const check=()=>{const age=monotonicNow()-started,clock=now();if(!Number.isFinite(age)||age<0||age>15000||!Number.isSafeInteger(clock)||clock<at||clock-at>15000)fail();};check();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader;
  try{
   const response=await fetchImpl('/api/perps-operation-status',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({reviewId:row.operationId,walletAddress:row.walletAddress,signature:row.signature,recordBinding:row.recordBinding})});
   if(response?.status!==200||response.redirected||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))fail();
   reader=response.body?.getReader();if(!reader)fail();const parts=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)fail();parts.push(part.value);}
   if(controller.signal.aborted)fail();const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   const reply=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!reply||Object.keys(reply).sort().join(',')!=='ok,status'||reply.ok!==true)fail();
   check();if(JSON.stringify(await journal.read(operationId))!==rowJson)fail();if(reply.status===null)return null;
   const status=await validateWebPerpsOperationStatus(structuredClone(reply.status),row,{now:now()});check();
   const value=Object.freeze({stage:'WEB_PERPS_TERMINAL_STATUS_VERIFIED',operationId,walletAddress:row.walletAddress,outcome:status.outcome,readyForRetry:false});
   proofs.set(value,{journal,rowJson,status,check,used:false});return value;
  }finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
 }});
}
