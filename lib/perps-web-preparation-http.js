import {prepareInspectedPerpsManualOrder} from './perps-manual-preparation.js';
import {requireOwnerBoundWebPerpsReviewStore} from './perps-web-review-store.js';
import {requireManualPerpsPolicyStore} from './perps-manual-policy-store.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {perpsNavigationDraft} from './perps-navigation.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
import bs58 from 'bs58';
function reply(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export function createWebPerpsPreparationHandler({authenticate,limit,policyStore,riskJournal,reviewStoreForOwner,rpcRequest,builderRequest,isExecutionAvailable,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireManualPerpsPolicyStore(policyStore);
 requirePerpsExecutionJournal(riskJournal);
 if([authenticate,limit,reviewStoreForOwner,rpcRequest,builderRequest,isExecutionAvailable,now,monotonicNow].some(v=>typeof v!=='function'))throw Error('WEB_PREPARATION_NOT_CONFIGURED');
 return async request=>{
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(url.pathname!=='/api/perps-signing-review'||url.search||origin&&origin!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'INVALID_SIGNING_REVIEW'},400);
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return reply({error:'LOGIN_REQUIRED'},401);
  let owner;try{owner=await authenticate(request);if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))throw Error();}
  catch(error){return reply({error:error?.status===401?'LOGIN_REQUIRED':'AUTHENTICATION_UNAVAILABLE'},error?.status===401?401:503);}
  try{if(await limit({ownerAccountHash:owner,scope:'web-perps-review'})!==true)return reply({error:'RATE_LIMIT'},429);}catch{return reply({error:'SERVICE_UNAVAILABLE'},503);}
  if(isExecutionAvailable()!==true)return reply({error:'WEB_EXECUTION_UNAVAILABLE'},503);
  let input,reader;
  try{
   const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>2048))throw Error();
   reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2048)throw Error();parts.push(Buffer.from(part.value));}
   input=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   if(!input||Object.keys(input).sort().join(',')!=='draft,walletAddress'||typeof input.walletAddress!=='string'||input.walletAddress.length>44||bs58.decode(input.walletAddress).length!==32||bs58.encode(bs58.decode(input.walletAddress))!==input.walletAddress)throw Error();
   input.draft=perpsNavigationDraft(input.draft);
  }catch{return reply({error:'INVALID_SIGNING_REVIEW'},400);}finally{if(reader)try{await reader.cancel();}catch{}}
  try{
   const who={ownerAccountHash:owner,walletAddress:input.walletAddress},policy=policyStore.readLimits(who);
   const held=()=>riskJournal.pending(who.walletAddress).length||riskJournal.pendingPositionCloses(who.walletAddress).length||riskJournal.pendingExitCancellations(who.walletAddress).length;
   if(held())return reply({error:'WEB_OPERATION_PENDING'},409);
   if(BigInt(exactUsdUnits(input.draft.margin))>BigInt(exactUsdUnits(policy.limits.capitalUsd)))return reply({error:'MANUAL_CAPITAL_LIMIT'},409);
   const review=await prepareInspectedPerpsManualOrder(input.draft,input.walletAddress,{rpcRequest,builderRequest,now,monotonicNow});
   if(isExecutionAvailable()!==true||held()||JSON.stringify(policyStore.readLimits(who))!==JSON.stringify(policy))throw Error();
   const store=requireOwnerBoundWebPerpsReviewStore(reviewStoreForOwner({ownerAccountHash:owner}),owner),packet=await store.prepare(review);
   if(isExecutionAvailable()!==true||JSON.stringify(policyStore.readLimits(who))!==JSON.stringify(policy))throw Error();
   return reply({ok:true,packet});
  }catch(error){return reply({error:error?.message==='MANUAL_PERPS_LIMITS_REQUIRED'?'MANUAL_LIMITS_REQUIRED':'WEB_SIGNING_REVIEW_UNAVAILABLE'},error?.message==='MANUAL_PERPS_LIMITS_REQUIRED'?409:503);}
 };
}
