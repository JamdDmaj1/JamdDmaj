// Public preparation is fixed to the operator's public address. Submission
// requires that address's exact transaction signature, never a body owner flag.
export function createFeeRecipientSetupHandler({service,rateLimit}={}){
 if(!service||!['prepare','submit','recover'].every(k=>typeof service[k]==='function')||typeof rateLimit!=='function')throw Error('SETUP_HTTP_UNAVAILABLE');
 return async request=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const reply=(value,status=200)=>Response.json(value,{status,headers});
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return reply({error:'ORIGIN_DENIED'},403);
  if(!['GET','POST'].includes(request.method))return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(url.pathname!=='/api/fee-recipient-setup'||url.search)return reply({error:'INVALID_REQUEST'},400);
  let input;
  if(request.method==='POST'){
   try{
    if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error();
    const length=request.headers.get('content-length');if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>8192))throw Error();
    const reader=request.body?.getReader();if(!reader)throw Error();const parts=[];let size=0,timer;
    const expired=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),5000);timer.unref?.();});
    try{while(true){const chunk=await Promise.race([reader.read(),expired]);if(chunk.done)break;size+=chunk.value.length;if(size>8192)throw Error();parts.push(chunk.value);}}
    finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!input||Array.isArray(input)||typeof input!=='object')throw Error();
    const keys=Object.keys(input).sort().join(',');
    if(input.action==='submit'){if(keys!=='action,explicitApproval,packet,signedBase64'||input.explicitApproval!==true||typeof input.signedBase64!=='string')throw Error();}
    else if(input.action==='recover'){if(keys!=='action,signature'||typeof input.signature!=='string'||input.signature.length>88)throw Error();}
    else throw Error();
   }catch{return reply({error:'INVALID_REQUEST'},400);}
  }
  try{await rateLimit(request);}catch(error){return reply({error:'SETUP_RATE_LIMIT_UNAVAILABLE'},error?.status===429?429:503);}
  try{
   const result=request.method==='GET'?await service.prepare():input.action==='recover'?await service.recover(input.signature):await service.submit(input);
   return reply({ok:true,result});
  }catch{
   // No request bodies, signatures, wallet state or credentials are logged.
   return reply({error:request.method==='POST'&&input.action==='submit'?'SETUP_SUBMISSION_UNCONFIRMED':'SETUP_UNAVAILABLE',requiresReconciliation:request.method==='POST'&&input.action==='submit'},503);
  }
 };
}
