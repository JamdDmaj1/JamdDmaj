import {authenticateTrial} from './web-trial-session.js';
import {hashIdentifier,redisRequest,jsonResponse} from './server.js';
export const ACCOUNT_COOKIE='__Host-jamd-access';
export function sameOriginBrowser(request){
 const url=new URL(request.url),origin=request.headers.get('origin');
 return ['https://www.jamddmaj.com','https://jamddmaj.com'].includes(url.origin)&&origin===url.origin&&['same-origin',null].includes(request.headers.get('sec-fetch-site'));
}
export function sessionCookie(token,seconds){
 if(token&&!/^[a-f0-9]{64}$/.test(token))throw Error('session-format');
 if(!Number.isInteger(seconds)||seconds<0||seconds>604800)throw Error('session-expiry');
 return `${ACCOUNT_COOKIE}=${token}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Strict`;
}
function cookieToken(request){
 const values=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(ACCOUNT_COOKIE+'='));
 if(values.length!==1)return '';
 const token=values[0].slice(ACCOUNT_COOKIE.length+1);return /^[a-f0-9]{64}$/.test(token)?token:'';
}
export function browserAccountSessionHandler({storage=redisRequest,authenticate=authenticateTrial}={}){
 return async request=>{
  if(request.method!=='POST')return jsonResponse(request,{code:'SESSION_METHOD'},405);
  if(!sameOriginBrowser(request))return jsonResponse(request,{code:'SESSION_ORIGIN'},403);
  let input;try{const text=await request.text();if(text.length>128)throw Error();input=JSON.parse(text);}catch{return jsonResponse(request,{code:'SESSION_INPUT'},400);}
  if(!['remember','resume','forget'].includes(input?.action))return jsonResponse(request,{code:'SESSION_INPUT'},400);
  const saved=cookieToken(request);
  let checkedToken='';
  try{
   if(input.action==='forget'){
    const provided=(request.headers.get('authorization')||'').replace(/^Bearer /,''),target=provided||saved;
    if(target){if(!/^[a-f0-9]{64}$/.test(target))return jsonResponse(request,{code:'SESSION_INPUT'},400);const r=await storage('pipeline',[['DEL','jamd:trial:session:'+await hashIdentifier(target)]]);if(r[0]?.error)throw Error();}
    return jsonResponse(request,{ok:true},200,!saved||saved===target?{'Set-Cookie':sessionCookie('',0)}:{});
   }
   const token=input.action==='remember'?(request.headers.get('authorization')||'').replace(/^Bearer /,''):saved;
   checkedToken=token;
   if(!/^[a-f0-9]{64}$/.test(token))return jsonResponse(request,{code:'SESSION_MISSING'},401);
   const authRequest=new Request(request.url,{headers:{Authorization:'Bearer '+token}});
   await authenticate(authRequest,storage);
   const rows=await storage('pipeline',[['TTL','jamd:trial:session:'+await hashIdentifier(token)]]);
   const ttl=rows[0]?.result;if(rows[0]?.error||!Number.isInteger(ttl)||ttl<=0||ttl>604800)throw Error();
   // Preserve remaining server lifetime, never refresh/extend or issue a token.
   return jsonResponse(request,{ok:true,...input.action==='resume'?{token}:{}},200,{'Set-Cookie':sessionCookie(token,ttl)});
  }catch(error){const clear=error.status===401&&(input.action==='resume'||saved===checkedToken);return jsonResponse(request,{code:error.status===401?'SESSION_REJECTED':'SESSION_UNAVAILABLE'},error.status===401?401:503,clear?{'Set-Cookie':sessionCookie('',0)}:{});}
 };
}
