// Fixed TLS boundary only. No wallet, signer, journal or selectable destination.
const paths=new Set(['/api/perps-manual-policy','/api/perps-signing-review','/api/perps-submit','/api/perps-close']);
function reply(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
async function bounded(body,maximum){
 const reader=body?.getReader();if(!reader)throw Error();
 try{let size=0;const parts=[];while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>maximum)throw Error();parts.push(item.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{try{await reader.cancel();}catch{}}
}
export function createManualPerpsRelay({path,fetchImpl=globalThis.fetch,limit}={}){
 if(!paths.has(path)||typeof fetchImpl!=='function'||typeof limit!=='function')throw Error('INVALID_MANUAL_RELAY');
 const close=path==='/api/perps-close',submit=path==='/api/perps-submit',maximum=submit||close?12000:2048;
 return async request=>{
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url),origin=request.headers.get('origin'),authorization=request.headers.get('authorization');
  if(url.pathname!==path||url.search||origin&&origin!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'INVALID_MANUAL_REQUEST'},400);
  if(!/^Bearer [a-f0-9]{64}$/.test(authorization||''))return reply({error:'LOGIN_REQUIRED'},401);
  let input;
  try{const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>maximum))throw Error();
   input=await bounded(request.body,maximum);if(!input||Array.isArray(input)||typeof input!=='object')throw Error();
   const fields=Object.keys(input).sort().join(',');
   if(path==='/api/perps-manual-policy'&&(input.action==='read'?fields!=='action,walletAddress':input.action==='save'?fields!=='action,expectedRevision,explicitApproval,limits,walletAddress':true))throw Error();
   if(path==='/api/perps-signing-review'&&fields!=='draft,walletAddress')throw Error();
   if(submit&&(fields!=='explicitApproval,reviewId,signature,signedBase64'||input.explicitApproval!==true))throw Error();
   if(close){const allowed={prepare:'action,maxSlippageBps,positionAddress,referencePrice,walletAddress',next:'action,closeId,maxSlippageBps,minimumUsdcUnits,walletAddress',submit:'action,explicitApproval,reviewId,signedBase64',recover:'action,closeId,reviewId,walletAddress',list:'action,walletAddress'};
    if(!Object.hasOwn(allowed,input.action)||allowed[input.action]!==fields||input.action==='submit'&&input.explicitApproval!==true)throw Error();}
  }catch{return reply({error:'INVALID_MANUAL_REQUEST'},400);}
  try{await limit(request);}catch(error){return reply({error:'SERVICE_UNAVAILABLE'},error?.status===429?429:503);}
  try{
   const signal=AbortSignal.timeout(submit||close?12000:10000),response=await fetchImpl('https://157.230.54.133'+path,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal,
    headers:{Authorization:authorization,'Content-Type':'application/json',Accept:'application/json',Origin:'https://www.jamddmaj.com'},body:JSON.stringify(input)});
   if(response.redirected||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>12000))throw Error();
   const value=await bounded(response.body,12000);if(signal.aborted||!value||Array.isArray(value)||typeof value!=='object')throw Error();
   if(response.status!==200){
    if(![400,401,405,409,429,503].includes(response.status)||typeof value.error!=='string'||!/^[_A-Z]{3,80}$/.test(value.error))throw Error();
    return reply(submit||close&&input.action==='submit'?{error:value.error,requiresReconciliation:true,readyForRetry:false}:{error:value.error},response.status);
   }
   const fields=Object.keys(value).sort().join(',');
   if(value.ok!==true||path==='/api/perps-manual-policy'&&(fields!=='executionAvailable,ok,policy,readyForSigning'||value.readyForSigning!==false||typeof value.executionAvailable!=='boolean')
    ||path==='/api/perps-signing-review'&&(fields!=='ok,packet'||!value.packet)||submit&&(fields!=='ok,result'||!value.result)
    ||close&&(fields!==(['prepare','next'].includes(input.action)?'ok,packet':input.action==='submit'?'ok,result':input.action==='recover'?'ok,status':'closes,ok')))throw Error();
   return reply(value);
  }catch{return reply(submit||close&&input.action==='submit'?{error:'WEB_SUBMISSION_UNCONFIRMED',requiresReconciliation:true,readyForRetry:false}:{error:'WEB_SERVICE_UNAVAILABLE'},503);}
 };
}
