import {createPrivateKey, sign} from 'node:crypto';

const PROJECT='jamddmaj-2afc8';
const OAUTH='https://oauth2.googleapis.com/token';
const SCOPE='https://www.googleapis.com/auth/firebase.messaging';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');

// The credential stays on the server. Never return provider bodies or targets.
export function createPushSender({credential,fetchImpl=fetch,now=Date.now}={}){
 if(credential?.type!=='service_account'||credential.project_id!==PROJECT||credential.token_uri!==OAUTH||!String(credential.client_email||'').endsWith('.iam.gserviceaccount.com'))throw Error('PUSH_CONFIGURATION');
 const key=createPrivateKey(credential.private_key);
 if(key.asymmetricKeyType!=='rsa')throw Error('PUSH_CONFIGURATION');
 let cached=null,pending=null;
 async function access(){
  if(cached&&cached.until>now()+60000)return cached.value;
  if(pending)return pending;
  pending=(async()=>{
   const seconds=Math.floor(now()/1000),input=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:credential.client_email,scope:SCOPE,aud:OAUTH,iat:seconds,exp:seconds+3600});
   const assertion=input+'.'+sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
   const response=await fetchImpl(OAUTH,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('PUSH_AUTH');
   const result=await response.json();
   if(typeof result.access_token!=='string'||!Number.isFinite(result.expires_in)||result.expires_in<=60)throw Error('PUSH_AUTH');
   cached={value:result.access_token,until:now()+Math.min(result.expires_in,3600)*1000};return cached.value;
  })();
  try{return await pending;}finally{pending=null;}
 }
 return {async send({transport,target,kind,body,eventId,validateOnly=false}={}){
  if(!['android-token','web-fid'].includes(transport)||typeof target!=='string'||!/^[a-zA-Z0-9_:\-]{20,4096}$/.test(target)||!['price','signal','test'].includes(kind)||typeof body!=='string'||!body.trim()||body.length>240||! /^[a-zA-Z0-9_-]{8,100}$/.test(eventId||''))throw Error('PUSH_INPUT');
  const message={data:{kind,body,eventId},[transport==='web-fid'?'fid':'token']:target};
  if(transport==='android-token')message.android={priority:'high',ttl:'300s'};
  else message.webpush={headers:{TTL:'300',Urgency:'normal'}};
  let response;
  try{response=await fetchImpl(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`,{method:'POST',headers:{Authorization:'Bearer '+await access(),'Content-Type':'application/json'},body:JSON.stringify({validate_only:validateOnly===true,message}),signal:AbortSignal.timeout(15000)});}catch{throw Error('PUSH_UNAVAILABLE');}
  if(response.ok)return {accepted:true,validationOnly:validateOnly===true};
  let code='';try{const result=await response.json();code=result?.error?.details?.find(x=>typeof x?.errorCode==='string')?.errorCode||'';}catch{}
  return {accepted:false,invalidTarget:code==='UNREGISTERED',retryable:response.status===429||response.status>=500,code:response.status===401||response.status===403?'PUSH_ACCESS':'PUSH_REJECTED'};
 }};
}
