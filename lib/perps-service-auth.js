// VPS -> existing JamdDmaj session ledger over a fixed TLS origin. No caller
// chooses the endpoint, and no token, cookie or private error is persisted.
const IDENTITY_URL='https://www.jamddmaj.com/api/perps-identity';
function unavailable(){throw Error('PERPS_SESSION_IDENTITY_UNAVAILABLE');}
function login(){throw Object.assign(Error('PERPS_LOGIN_REQUIRED'),{status:401});}
export function createPerpsServiceAuthenticator({fetchImpl=globalThis.fetch,now=Date.now}={}){
 if(typeof fetchImpl!=='function'||typeof now!=='function')unavailable();
 return async request=>{
  const authorization=request.headers.get('authorization');if(!/^Bearer [a-f0-9]{64}$/.test(authorization||''))login();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);let reader;
  try{
   const response=await fetchImpl(IDENTITY_URL,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
    headers:{Authorization:authorization,Accept:'application/json'},signal:controller.signal});
   if(response?.status===401)login();
   if(!response?.ok||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))unavailable();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))unavailable();
   reader=response.body.getReader();const parts=[];let size=0;
   while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)unavailable();parts.push(Buffer.from(chunk.value));}
   if(controller.signal.aborted)unavailable();const body=JSON.parse(Buffer.concat(parts,size).toString('utf8')),time=now();
   if(body?.ok!==true||typeof body.accountHash!=='string'||!/^[a-f0-9]{64}$/.test(body.accountHash)||!Number.isSafeInteger(body.verifiedAt)
    ||!Number.isSafeInteger(time)||body.verifiedAt<time-10000||body.verifiedAt>time+2000)unavailable();
   return body.accountHash;
  }catch(error){if(error?.status===401)login();unavailable();}
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
 };
}
