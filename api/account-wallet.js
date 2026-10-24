// Account-scoped PUBLIC watch address only. No ownership proof or authority.
import bs58 from 'bs58';
import {authenticateTrial} from '../lib/web-trial-session.js';
import {jsonResponse,corsHeaders,redisRequest} from '../lib/server.js';
import {enforceQuoteLimit} from './swap-quote.js';
export const config={runtime:'edge'};
const fields='address,expectedRevision,explicitApproval';
const validAddress=v=>{try{return typeof v==='string'&&v.length<=44&&bs58.decode(v).length===32&&bs58.encode(bs58.decode(v))===v;}catch{return false;}};
function validate(v){if(!v||Object.keys(v).sort().join(',')!=='address,linkedAt,network,readOnly,revision,signingAuthorized,version'||v.version!==1||!validAddress(v.address)||v.network!=='solana:mainnet'||v.readOnly!==true||v.signingAuthorized!==false||!/^[a-f0-9]{64}$/.test(v.revision)||!Number.isSafeInteger(v.linkedAt)||v.linkedAt<0)throw Error('INVALID_LINK');return v;}
const cas=`local old=redis.call('GET',KEYS[1]); if ARGV[1]=='' then if old then return 0 end else if not old then return 0 end; local ok,v=pcall(cjson.decode,old); if not ok or v.revision~=ARGV[1] then return 0 end end; redis.call('SET',KEYS[1],ARGV[2]); return 1`;
export function createHandler({authenticate=authenticateTrial,storage=redisRequest,limit=enforceQuoteLimit,now=Date.now}={}){
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(!['GET','POST'].includes(request.method))return jsonResponse(request,{error:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(url.search||origin&&!['https://www.jamddmaj.com','https://jamddmaj.com','https://localhost','capacitor://localhost'].includes(origin)&&origin!==url.origin)return jsonResponse(request,{error:'INVALID_REQUEST'},400);
  let owner;try{owner=await authenticate(request);if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))throw Error();}catch(e){return jsonResponse(request,{error:e?.status===401?'LOGIN_REQUIRED':'SERVICE_UNAVAILABLE'},e?.status===401?401:503);}
  try{
   await limit(request);const key='jamd:account:public-wallet:v1:'+owner;
   if(request.method==='GET'){
    const rows=await storage('pipeline',[['GET',key]]);if(rows?.[0]?.error||rows?.[0]?.result===undefined)throw Error();
    const value=rows[0].result;return jsonResponse(request,{ok:true,wallet:value===null?null:validate(JSON.parse(value))});
   }
   if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return jsonResponse(request,{error:'INVALID_REQUEST'},400);
   let input;try{
    if(Number(request.headers.get('content-length')||0)>512)throw Error();const reader=request.body?.getReader();if(!reader)throw Error();let size=0,parts=[];
    try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>512)throw Error();parts.push(p.value);}}finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!input||Object.keys(input).sort().join(',')!==fields||!validAddress(input.address)||input.explicitApproval!==true||input.expectedRevision!==null&&!/^[a-f0-9]{64}$/.test(input.expectedRevision))throw Error();
   }catch{return jsonResponse(request,{error:'INVALID_REQUEST'},400);}
   const wallet=validate({version:1,address:input.address,network:'solana:mainnet',readOnly:true,signingAuthorized:false,revision:[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join(''),linkedAt:now()});
   const rows=await storage('pipeline',[['EVAL',cas,1,key,input.expectedRevision??'',JSON.stringify(wallet)]]);if(rows?.[0]?.error)throw Error();
   if(rows?.[0]?.result===0)return jsonResponse(request,{error:'LINK_CHANGED_REFRESH_FIRST'},409);if(rows?.[0]?.result!==1)throw Error();
   return jsonResponse(request,{ok:true,wallet});
  }catch(e){return jsonResponse(request,{error:e?.status===429?'RATE_LIMITED':'SERVICE_UNAVAILABLE'},e?.status===429?429:503);}
 };
}
export default createHandler();
