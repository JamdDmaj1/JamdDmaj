import {authenticateTrial} from '../lib/web-trial-session.js';
import {readGoogleSyncProfile} from './account.js';
import {corsHeaders,jsonResponse} from '../lib/server.js';
import {relinkGoogleSync} from '../lib/google-sync-relink.js';
import {enforceQuoteLimit} from './swap-quote.js';
export const config={runtime:'edge'};
export function createHandler({authenticate=authenticateTrial,read=readGoogleSyncProfile,relink=relinkGoogleSync,limit=enforceQuoteLimit,secret=()=>process.env.JAMDDMAJ_ACCOUNT_SECRET}={}){
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(!['GET','POST'].includes(request.method)||new URL(request.url).search)return jsonResponse(request,{error:'INVALID_REQUEST'},400);
  try {
   const owner=await authenticate(request);
   if(request.method==='GET')return jsonResponse(request,await read(owner,secret()));
   const origin=request.headers.get('origin');
   if(origin&&!['https://www.jamddmaj.com','https://jamddmaj.com','https://localhost','capacitor://localhost',new URL(request.url).origin].includes(origin))return jsonResponse(request,{error:'INVALID_REQUEST'},400);
   await limit(request);
   if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return jsonResponse(request,{error:'INVALID_REQUEST'},400);
   let input;try{
    const reader=request.body?.getReader();if(!reader)throw Error();let size=0,parts=[];
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>512)throw Error();parts.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   }catch{return jsonResponse(request,{error:'INVALID_REQUEST'},400);}
   return jsonResponse(request,await relink(owner,input,secret()));
  }catch(error){const code=['INVALID_REQUEST','BOTH_BACKUPS_REQUIRED','SYNC_CHANGED_REFRESH_FIRST'].includes(error?.message)?error.message:error?.status===401?'LOGIN_REQUIRED':'SYNC_UNAVAILABLE';return jsonResponse(request,{error:code},error?.status===401?401:code==='INVALID_REQUEST'?400:code==='BOTH_BACKUPS_REQUIRED'||code==='SYNC_CHANGED_REFRESH_FIRST'?409:503);}
 };
}
export default createHandler();
