// VPS HTTP adapter. Authentication and shared rate limiting are mandatory
// server dependencies; neither the owner identity nor readiness comes from JSON.
import {validateServerPerpsAutomationSettings} from './perps-automation-controls.js';
const ORIGINS=new Set(['https://www.jamddmaj.com','https://jamddmaj.com','https://localhost','capacitor://localhost']);
const FIELDS={provision:['action','settings','explicitCustodyApproval'],save:['action','walletAddress','expectedRevision','settings'],pause:['action','walletAddress'],
 activationReview:['action','walletAddress','expectedRevision'],activate:['action','walletAddress','expectedRevision','token','explicitApproval']};
const ERRORS=new Map([
 ['PERPS_CUSTODY_CAPACITY_REACHED',[503,'custody-capacity']],
 ['PERPS_CONTROLS_UNAVAILABLE',[403,'controls-unavailable']],['STALE_PERPS_CONTROLS',[409,'settings-changed']],
 ['INVALID_PERPS_SETTINGS',[400,'invalid-settings']],['PERPS_EXECUTION_NOT_CONFIGURED',[503,'execution-unavailable']],
 ['INVALID_PERPS_ACTIVATION_APPROVAL',[409,'activation-review-expired']],['EXPIRED_PERPS_ACTIVATION_REVIEW',[409,'activation-review-expired']],
 ['PERPS_ACTIVATION_RISK_LIMIT',[422,'risk-limit']]
]);
async function input(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))throw Error('INPUT');
 const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error('INPUT');
 if(!request.body)throw Error('INPUT');const reader=request.body.getReader(),parts=[];let size=0,timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('INPUT')),5000);});
 try{
  while(true){const chunk=await Promise.race([reader.read(),expired]);if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)throw Error('INPUT');parts.push(Buffer.from(chunk.value));}
  const value=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.action!=='string'||!Object.hasOwn(FIELDS,value.action)
   ||Object.keys(value).some(key=>!FIELDS[value.action].includes(key)))throw Error('INPUT');
  return value;
 }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export function createPerpsAutomationApi({authenticate,rateLimit,controls,provisionCustody=null}={}){
 if(typeof authenticate!=='function'||typeof rateLimit!=='function'||provisionCustody!==null&&typeof provisionCustody!=='function'||!['read','readForOwner','save','pause','issueActivationChallenge','activate'].every(k=>typeof controls?.[k]==='function'))throw Error('PERPS_API_NOT_CONFIGURED');
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store, max-age=0','Vary':'Origin','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
  if(origin&&ORIGINS.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(origin&&!ORIGINS.has(origin))return reply({error:{code:'origin-denied'}},403);
  const url=new URL(request.url);if(url.pathname!=='/v1/automation')return reply({error:{code:'not-found'}},404);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(request.method))return reply({error:{code:'method'}},405);
  // Bearer sessions are verified against the existing server session ledger.
  // Cookies, device IDs and a saved Google profile do not authorize controls.
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return reply({error:{code:'login-required'}},401);
  let ownerAccountHash;
  try{ownerAccountHash=await authenticate(request);if(!/^[a-f0-9]{64}$/.test(ownerAccountHash||''))throw Object.assign(Error(),{status:401});}
  catch(error){return reply({error:{code:error?.status===401?'login-required':'authentication-unavailable'}},error?.status===401?401:503);}
  try{if(await rateLimit({ownerAccountHash,scope:'perps-automation-controls'})!==true)return reply({error:{code:'rate-limit'}},429);}
  catch{return reply({error:{code:'controls-unavailable'}},503);}
  try{
   if(request.method==='GET'){
    if(!url.search)return reply({ok:true,controls:controls.readForOwner({ownerAccountHash})});
    if([...url.searchParams.keys()].some(k=>k!=='walletAddress')||url.searchParams.getAll('walletAddress').length!==1)return reply({error:{code:'invalid-request'}},400);
    return reply({ok:true,controls:controls.read({ownerAccountHash,walletAddress:url.searchParams.get('walletAddress')})});
   }
   if(url.search)return reply({error:{code:'invalid-request'}},400);
   let body;try{body=await input(request);}catch{return reply({error:{code:'invalid-request'}},400);}
   const args={...body,ownerAccountHash};delete args.action;
   if(body.action==='provision'){
    if(body.explicitCustodyApproval!==true)return reply({error:{code:'custody-approval-required'}},400);
    let settings;try{settings=validateServerPerpsAutomationSettings(body.settings);}catch{return reply({error:{code:'invalid-settings'}},400);}
    if(!provisionCustody)return reply({error:{code:'custody-unavailable'}},503);
    const prepared=await provisionCustody({ownerAccountHash,settings,explicitCustodyApproval:true});
    // The authenticated durable mapping, not a callback-supplied owner or UI
    // boolean, determines which public wallet can be returned. No funding or
    // activation capability is granted by this setup response.
    const state=controls.readForOwner({ownerAccountHash});
    if(!state||state.walletAddress!==prepared?.walletAddress||state.enabled!==false||state.paused!==true
      ||prepared.backupVerified!==false||prepared.fundingAvailable!==false||prepared.readyForSigning!==false)throw Error();
    return reply({ok:true,controls:state,setup:{stage:'BACKUP_VERIFICATION_REQUIRED',backupVerified:false,fundingAvailable:false,readyForSigning:false}});
   }
   if(body.action==='activationReview')return reply({ok:true,review:controls.issueActivationChallenge(args)});
   const state=body.action==='activate'?await controls.activate(args):body.action==='save'?controls.save(args):controls.pause(args);
   return reply({ok:true,controls:state});
  }catch(error){const [status,code]=ERRORS.get(error?.message)||[503,'controls-unavailable'];return reply({error:{code}},status);}
 };
}
