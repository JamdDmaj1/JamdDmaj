// Edge-compatible identity introspection for the user's existing opaque session.
// Does not issue tokens, grant trading/custody rights or disclose Google PII.
import {jsonResponse,corsHeaders} from './server.js';
import {authenticateTrial} from './web-trial-session.js';
export function createPerpsSessionIdentityHandler({authenticate=authenticateTrial,now=Date.now}={}){
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='GET')return jsonResponse(request,{error:{code:'method'}},405);
  if(new URL(request.url).search)return jsonResponse(request,{error:{code:'invalid-request'}},400);
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return jsonResponse(request,{error:{code:'login-required'}},401);
  try{
   const accountHash=await authenticate(request),verifiedAt=now();
   if(typeof accountHash!=='string'||!/^[a-f0-9]{64}$/.test(accountHash)||!Number.isSafeInteger(verifiedAt)||verifiedAt<0)throw Error();
   return jsonResponse(request,{ok:true,accountHash,verifiedAt});
  }catch(error){return jsonResponse(request,{error:{code:error?.status===401?'login-required':'identity-unavailable'}},error?.status===401?401:503);}
 };
}
