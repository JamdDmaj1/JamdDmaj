// Same-origin read-only relay. No journal, custody, signing or send imports.
import bs58 from 'bs58';
import {enforceQuoteLimit} from './swap-quote.js';
const TARGET='https://157.230.54.133/api/perps-operation-status';
const keys='confirmedSlot,executionDay,financialState,outcome,recordBinding,reviewId,settledAt,signature,stage,walletAddress,wireHash';
function reply(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
async function bounded(body,maximum){
 const reader=body?.getReader();if(!reader)throw Error();
 try{let size=0;const parts=[];while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>maximum)throw Error();parts.push(item.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{try{await reader.cancel();}catch{}}
}
export function createHandler({fetchImpl=(...args)=>fetch(...args),limit=enforceQuoteLimit,diagnostic=()=>console.warn('web_perps_status_unavailable')}={}){
 if(typeof fetchImpl!=='function'||typeof limit!=='function'||typeof diagnostic!=='function')throw Error('INVALID_STATUS_RELAY');
 return async request=>{
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(url.search||origin&&origin!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'INVALID_STATUS_QUERY'},400);
  let input;
  try{
   const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>1024))throw Error();
   input=await bounded(request.body,1024);
   if(!input||Object.keys(input).sort().join(',')!=='recordBinding,reviewId,signature,walletAddress'||typeof input.reviewId!=='string'||typeof input.recordBinding!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewId)||!/^[a-f0-9]{64}$/.test(input.recordBinding)
    ||typeof input.walletAddress!=='string'||input.walletAddress.length>44||typeof input.signature!=='string'||input.signature.length>88
    ||bs58.decode(input.walletAddress).length!==32||bs58.decode(input.signature).length!==64)throw Error();
  }catch{return reply({error:'INVALID_STATUS_QUERY'},400);}
  try{
   await limit(request);
   const signal=AbortSignal.timeout(5000);
   const response=await fetchImpl(TARGET,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal,
    headers:{'Content-Type':'application/json',Accept:'application/json',Origin:'https://www.jamddmaj.com'},body:JSON.stringify(input)});
   if(response.status!==200||response.redirected||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error();
   const value=await bounded(response.body,4096);if(signal.aborted||!value||Object.keys(value).sort().join(',')!=='ok,status'||value.ok!==true)throw Error();
   const status=value.status;
   if(status!==null){
    if(!status||Object.keys(status).sort().join(',')!==keys||status.stage!=='WEB_PERPS_OPERATION_SETTLED'||status.reviewId!==input.reviewId||status.recordBinding!==input.recordBinding
     ||status.walletAddress!==input.walletAddress||status.signature!==input.signature||typeof status.wireHash!=='string'||!/^[a-f0-9]{64}$/.test(status.wireHash)||!['CONFIRMED','FAILED'].includes(status.outcome)
     ||!['OPEN','CLOSED'].includes(status.financialState)||status.outcome==='FAILED'&&status.financialState!=='CLOSED'||!Number.isSafeInteger(status.confirmedSlot)||status.confirmedSlot<1
     ||!Number.isSafeInteger(status.settledAt)||status.settledAt<0||typeof status.executionDay!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(status.executionDay))throw Error();
   }
   return reply({ok:true,status});
  }catch(error){diagnostic();return reply({error:'WEB_PERPS_STATUS_UNAVAILABLE'},error?.status===429?429:502);}
 };
}
export default {fetch:createHandler()};
