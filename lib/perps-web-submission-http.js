// Explicit server composition only. No default transport, automatic startup,
// policy creation, owner key use or retry. The browser supplies no risk limits.
import {inspectWebPerpsSubmission,requireWebPerpsSubmissionJournal} from './perps-web-submission-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {createRiskBoundWebPerpsBroadcaster} from './perps-web-risk-broadcast.js';
import bs58 from 'bs58';
import {requireOwnerBoundWebPerpsReviewStore} from './perps-web-review-store.js';
function reply(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export function createWebPerpsSubmissionHandler({journal,riskJournal,authenticate,limit,reviewStoreForOwner,readLimits,readAccount,rpcRequest,fetchImpl,
 isExecutionAvailable,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireWebPerpsSubmissionJournal(journal);requirePerpsExecutionJournal(riskJournal);
 if([authenticate,limit,reviewStoreForOwner,readLimits,readAccount,rpcRequest,fetchImpl,isExecutionAvailable,now,monotonicNow].some(v=>typeof v!=='function'))throw Error('WEB_PERPS_SUBMISSION_NOT_CONFIGURED');
 const inFlight=new Set();
 return async request=>{
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(url.pathname!=='/api/perps-submit'||url.search||origin&&origin!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'INVALID_SUBMISSION'},400);
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return reply({error:'LOGIN_REQUIRED'},401);
  let owner;
  try{owner=await authenticate(request);if(typeof owner!=='string'||!/^[a-f0-9]{64}$/.test(owner))throw Error();}
  catch(error){return reply({error:error?.status===401?'LOGIN_REQUIRED':'AUTHENTICATION_UNAVAILABLE'},error?.status===401?401:503);}
  try{if(await limit({ownerAccountHash:owner,scope:'web-perps-submit'})!==true)return reply({error:'RATE_LIMIT'},429);}
  catch{return reply({error:'SERVICE_UNAVAILABLE'},503);}
  if(isExecutionAvailable()!==true)return reply({error:'WEB_EXECUTION_UNAVAILABLE',readyForRetry:false},503);
  let input,reader;
  try{
   const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>12000))throw Error();
   reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>12000)throw Error();parts.push(Buffer.from(part.value));}
   input=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   if(!input||Object.keys(input).sort().join(',')!=='explicitApproval,reviewId,signature,signedBase64'||input.explicitApproval!==true
    ||typeof input.reviewId!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewId)||typeof input.signedBase64!=='string'||input.signedBase64.length>8192
    ||typeof input.signature!=='string'||input.signature.length>88||bs58.decode(input.signature).length!==64||bs58.encode(bs58.decode(input.signature))!==input.signature)throw Error();
  }catch{return reply({error:'INVALID_SUBMISSION',readyForRetry:false},400);}finally{if(reader)try{await reader.cancel();}catch{}}
  if(inFlight.has(input.reviewId))return reply({error:'SUBMISSION_ALREADY_PENDING',readyForRetry:false},409);
  inFlight.add(input.reviewId);
  try{
   const guard=()=>{if(isExecutionAvailable()!==true)throw Error('WEB_EXECUTION_UNAVAILABLE');};guard();
   // The factory must return a private owner-bound store, not a body-selected
   // endpoint or a packet accepted from HTTP. Read the original reviewed wire.
   const store=requireOwnerBoundWebPerpsReviewStore(reviewStoreForOwner({ownerAccountHash:owner}),owner),packet=await store.read(input.reviewId);guard();
   const policy=()=>{guard();return readLimits({ownerAccountHash:owner,walletAddress:packet.review.walletAddress});};
   const expectedPolicy=JSON.stringify(policy());
   if(journal.read(input.reviewId)!==null)return reply({error:'SUBMISSION_ALREADY_PENDING',readyForRetry:false},409);
   const evidence=await inspectWebPerpsSubmission(packet,input.signedBase64,{reviewStore:store,rpcRequest,now,monotonicNow});guard();
   if(evidence.signature!==input.signature)throw Error();
   const submit=createRiskBoundWebPerpsBroadcaster({journal,riskJournal,readAccount,readLimits:()=>{
    const current=policy();if(JSON.stringify(current)!==expectedPolicy)throw Error();return current;
   },fetchImpl:(url,options)=>{guard();return fetchImpl(url,options);}});
   const result=await submit(evidence);
   return reply({ok:true,result});
  }catch{
   // An exception may follow a durable signed-risk claim. Never tell a browser
   // to retry or infer that money was not sent. No private error is serialized.
   return reply({error:'WEB_SUBMISSION_UNCONFIRMED',requiresReconciliation:true,readyForRetry:false},503);
  }finally{inFlight.delete(input.reviewId);}
 };
}
