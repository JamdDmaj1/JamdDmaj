// Node Web Standard handler: read-only chain validation, never an execute API.
import {corsHeaders,jsonResponse} from '../lib/server.js';
import {enforceQuoteLimit} from './swap-quote.js';
import {perpsNavigationDraft} from '../lib/perps-navigation.js';
import {prepareInspectedPerpsManualOrder} from '../lib/perps-manual-preparation.js';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import bs58 from 'bs58';
export function createHandler({env=process.env,prepare,limit=enforceQuoteLimit,fetchImpl=(...args)=>fetch(...args),diagnostic=code=>console.warn('perps_manual_review',code),persistSigningReview=null}={}){
 if(persistSigningReview!==null&&typeof persistSigningReview!=='function')throw Error('INVALID_PERPS_REVIEW_HANDLER');
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='POST')return jsonResponse(request,{error:'METHOD_NOT_ALLOWED'},405);
  if(!env.UPSTASH_REDIS_REST_URL||!env.UPSTASH_REDIS_REST_TOKEN)return jsonResponse(request,{error:'PERPS_REVIEW_NOT_CONFIGURED',tradingEnabled:false},503);
  if(new URL(request.url).search||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return jsonResponse(request,{error:'INVALID_PERPS_REVIEW'},400);
  let input,reader;
  try{
   const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>2048))throw Error();
   reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2048)throw Error();parts.push(Buffer.from(part.value));}
   input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,size)));
   if(!input||Object.keys(input).sort().join(',')!=='draft,walletAddress'||typeof input.walletAddress!=='string'||input.walletAddress.length>44
    ||bs58.decode(input.walletAddress).length!==32||bs58.encode(bs58.decode(input.walletAddress))!==input.walletAddress)throw Error();
   input={walletAddress:input.walletAddress,draft:perpsNavigationDraft(input.draft)};
  }catch{return jsonResponse(request,{error:'INVALID_PERPS_REVIEW'},400);}
  finally{if(reader)try{await reader.cancel();}catch{}}
  try{
   await limit(request);
   const review=await (prepare||((draft,wallet)=>prepareInspectedPerpsManualOrder(draft,wallet,{
    rpcRequest:createServerPerpsReadOnlyRpc({fetchImpl}),builderRequest:fetchImpl})))(input.draft,input.walletAddress);
   if(review?.stage!=='MANUAL_PERPS_REVIEW_VALIDATED'||review.readyForSigning!==false||review.tradingEnabled!==false)throw Error();
   if(persistSigningReview!==null){
    // This callback is server-configured, never selected by an HTTP field. The
    // private native-review proof must survive persistence and read-back.
    const packet=await persistSigningReview(review);return jsonResponse(request,{ok:true,packet});
   }
   return jsonResponse(request,{ok:true,review});
  }catch(error){
   const code=['PERPS_MANUAL_INSUFFICIENT_USDC','PERPS_MANUAL_INSUFFICIENT_SOL'].includes(error?.message)?error.message:error?.status===429?'PERPS_REVIEW_RATE_LIMIT':'PERPS_REVIEW_UNAVAILABLE';
   diagnostic(code);return jsonResponse(request,{error:code,tradingEnabled:false},code==='PERPS_REVIEW_RATE_LIMIT'?429:code.includes('INSUFFICIENT')?409:502);
  }
 };
}
export default {fetch:createHandler()};
