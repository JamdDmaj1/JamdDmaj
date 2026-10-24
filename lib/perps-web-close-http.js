function reply(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export function createWebPerpsCloseHandler({coordinator,authenticate,limit}={}){
 if(!coordinator||['prepareClose','prepareNext','submit','recover','list'].some(k=>typeof coordinator[k]!=='function')||typeof authenticate!=='function'||typeof limit!=='function')throw Error('WEB_CLOSE_NOT_CONFIGURED');
 return async request=>{
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(url.pathname!=='/api/perps-close'||url.search||origin&&origin!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'INVALID_CLOSE_REQUEST'},400);
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return reply({error:'LOGIN_REQUIRED'},401);
  let account;try{account=await authenticate(request);if(typeof account!=='string'||!/^[a-f0-9]{64}$/.test(account))throw Error();}
  catch(error){return reply({error:error?.status===401?'LOGIN_REQUIRED':'AUTHENTICATION_UNAVAILABLE'},error?.status===401?401:503);}
  try{if(await limit({ownerAccountHash:account,scope:'manual-perps-close'})!==true)return reply({error:'RATE_LIMIT'},429);}catch{return reply({error:'SERVICE_UNAVAILABLE'},503);}
  let input,reader;
  try{const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>12000))throw Error();
   reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>12000)throw Error();parts.push(Buffer.from(item.value));}
   input=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   const fields={prepare:'action,maxSlippageBps,positionAddress,referencePrice,walletAddress',next:'action,closeId,maxSlippageBps,minimumUsdcUnits,walletAddress',submit:'action,explicitApproval,reviewId,signedBase64',recover:'action,closeId,reviewId,walletAddress',list:'action,walletAddress'};
   if(!input||!Object.hasOwn(fields,input.action)||Object.keys(input).sort().join(',')!==fields[input.action]||input.action==='submit'&&(input.explicitApproval!==true||typeof input.signedBase64!=='string'||input.signedBase64.length>1644))throw Error();
  }catch{return reply({error:'INVALID_CLOSE_REQUEST'},400);}finally{try{await reader?.cancel();}catch{}}
  try{
   if(input.action==='prepare')return reply({ok:true,packet:await coordinator.prepareClose(account,input)});
   if(input.action==='next')return reply({ok:true,packet:await coordinator.prepareNext(account,input.walletAddress,input.closeId,input)});
   if(input.action==='submit')return reply({ok:true,result:await coordinator.submit(account,input)});
   if(input.action==='recover')return reply({ok:true,status:await coordinator.recover(account,input.walletAddress,input.closeId,input.reviewId)});
   return reply({ok:true,closes:coordinator.list(account,input.walletAddress)});
  }catch(error){
   const code=['WEB_CLOSE_EXECUTION_DISABLED','WEB_CLOSE_RECONCILIATION_REQUIRED','WEB_CLOSE_UNTRACKED_POSITION','MANUAL_PERPS_LIMITS_REQUIRED'].includes(error?.message)?error.message:'WEB_CLOSE_UNAVAILABLE';
   return reply(input.action==='submit'?{error:code,requiresReconciliation:true,readyForRetry:false}:{error:code},503);
  }
 };
}
