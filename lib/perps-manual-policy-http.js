import {requireManualPerpsPolicyStore} from './perps-manual-policy-store.js';
function reply(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export function createManualPerpsPolicyHandler({store,authenticate,limit,isExecutionAvailable,isOpen=()=>true}={}){
 requireManualPerpsPolicyStore(store);
 if([authenticate,limit,isExecutionAvailable,isOpen].some(v=>typeof v!=='function'))throw Error('MANUAL_POLICY_HTTP_NOT_CONFIGURED');
 return async request=>{
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(url.pathname!=='/api/perps-manual-policy'||url.search||origin&&origin!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'INVALID_MANUAL_POLICY_REQUEST'},400);
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return reply({error:'LOGIN_REQUIRED'},401);
  let owner;
  try{owner=await authenticate(request);if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))throw Error();}
  catch(error){return reply({error:error?.status===401?'LOGIN_REQUIRED':'AUTHENTICATION_UNAVAILABLE'},error?.status===401?401:503);}
  try{if(await limit({ownerAccountHash:owner,scope:'manual-perps-policy'})!==true)return reply({error:'RATE_LIMIT'},429);}catch{return reply({error:'SERVICE_UNAVAILABLE'},503);}
  let input,reader;
  try{
   const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>2048))throw Error();
   reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2048)throw Error();parts.push(Buffer.from(part.value));}
   input=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   const fields=input?.action==='read'?'action,walletAddress':input?.action==='save'?'action,expectedRevision,explicitApproval,limits,walletAddress':null;
   if(!input||fields===null||Object.keys(input).sort().join(',')!==fields)throw Error();
  }catch{return reply({error:'INVALID_MANUAL_POLICY_REQUEST'},400);}finally{if(reader)try{await reader.cancel();}catch{}}
  try{
   if(isOpen()!==true)throw Error();
   const who={ownerAccountHash:owner,walletAddress:input.walletAddress};
   const policy=input.action==='read'?store.read(who):store.save({...who,expectedRevision:input.expectedRevision,limits:input.limits,explicitApproval:input.explicitApproval});
   return reply({ok:true,policy,executionAvailable:isExecutionAvailable()===true,readyForSigning:false});
  }catch(error){
   const mapping={INVALID_MANUAL_PERPS_LIMITS:[400,'INVALID_MANUAL_LIMITS'],MANUAL_PERPS_POLICY_APPROVAL_REQUIRED:[400,'EXPLICIT_APPROVAL_REQUIRED'],
    STALE_MANUAL_PERPS_POLICY:[409,'MANUAL_LIMITS_CHANGED'],MANUAL_PERPS_POLICY_CAPACITY:[503,'POLICY_CAPACITY']};
   const [status,code]=mapping[error?.message]??[503,'MANUAL_POLICY_UNAVAILABLE'];return reply({error:code},status);
  }
 };
}
