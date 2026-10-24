import {authenticateTrial} from '../lib/web-trial-session.js';
import {readGoogleSyncProfile} from './account.js';
import {corsHeaders,jsonResponse} from '../lib/server.js';
export const config={runtime:'edge'};
export function createHandler({authenticate=authenticateTrial,read=readGoogleSyncProfile,secret=()=>process.env.JAMDDMAJ_ACCOUNT_SECRET}={}){
 return async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='GET'||new URL(request.url).search)return jsonResponse(request,{error:'INVALID_REQUEST'},400);
  try {const owner=await authenticate(request);return jsonResponse(request,await read(owner,secret()));}
  catch(error){return jsonResponse(request,{error:error?.status===401?'LOGIN_REQUIRED':'SYNC_UNAVAILABLE'},error?.status===401?401:503);}
 };
}
export default createHandler();
