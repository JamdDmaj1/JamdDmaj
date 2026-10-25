// Browser/native control plane only. No wallet keys, transaction transport,
// automatic provisioning/activation, retries or caller-selected service URLs.
import bs58 from 'bs58';
import {exactUsdUnits} from './jupiter-perps-order.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
export const PERPS_CONTROL_ORIGIN='https://157.230.54.133';
// Finance is a separate same-origin page, not the main chat window. Navigation
// preserves sessionStorage but does not preserve the chat's JamdTrial object.
export function readExistingPerpsControlSession(context=globalThis){
 try{
  if(typeof context.JamdTrial?.getToken==='function')return context.JamdTrial.getToken();
  return context.sessionStorage?.getItem('jamdWebTrialSession')||'';
 }catch{return '';}
}
const failures=new WeakSet();
function fail(code='controls-unavailable'){const error=Object.assign(Error(code),{code});failures.add(error);throw error;}
function address(value){try{if(typeof value!=='string'||value.length>44||bs58.decode(value).length!==32||bs58.encode(bs58.decode(value))!==value)fail('invalid-request');return value;}catch{fail('invalid-request');}}
function revision(value){if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))fail('invalid-request');return value;}
export function createPerpsControlClient({fetchImpl=globalThis.fetch,readSessionToken,validateSettings,now=Date.now}={}){
 if(typeof fetchImpl!=='function'||typeof readSessionToken!=='function'||typeof validateSettings!=='function'||typeof now!=='function')fail();
 const activationReviews=new WeakMap();
 function session(){let token;try{token=readSessionToken();}catch{fail('session-missing');}if(typeof token!=='string'||!/^([a-f0-9]{64})$/.test(token))fail('session-missing');return token;}
 function sameSession(token){if(session()!==token)fail('session-changed');}
 function controls(value){
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.enabled!=='boolean'||typeof value.paused!=='boolean'
   ||value.enabled===value.paused||typeof value.reason!=='string'||!/^[A-Z_]{1,80}$/.test(value.reason)||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<0)fail();
  let settings;try{settings=validateSettings(value.settings);}catch{fail();}
  return Object.freeze({walletAddress:address(value.walletAddress),revision:revision(value.revision),settings:Object.freeze(settings),enabled:value.enabled,paused:value.paused,reason:value.reason,updatedAt:value.updatedAt});
 }
 async function json(path,{token,body}={}){
  const response=await fetchImpl(PERPS_CONTROL_ORIGIN+path,{method:body?'POST':'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000),
   headers:{Accept:'application/json',...token?{Authorization:'Bearer '+token}:{},...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}});
  if(!response||response.redirected||!response.body||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail();
  const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>8192))fail();
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>8192)fail();chunks.push(item.value);}}
  finally{void reader.cancel().catch(()=>{});}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{fail();}
  if(!response.ok){
   const code={400:value?.error?.code==='invalid-settings'?'invalid-settings':'invalid-request',401:'login-required',403:'controls-unavailable',409:value?.error?.code==='activation-review-expired'?'activation-review-expired':'settings-changed',422:'risk-limit',429:'rate-limit',503:value?.error?.code==='custody-unavailable'?'custody-unavailable':value?.error?.code==='execution-unavailable'?'execution-unavailable':'controls-unavailable'}[response.status];fail(code);
  }
  if(value?.ok!==true)fail();return value;
 }
 function recovery(value,state){
  // Older servers omit this projection. Absence is unknown, never verified.
  if(value===undefined||value===null){if(value===null&&state!==null)fail();return null;}
  if(!state||typeof value!=='object'||Array.isArray(value)||value.walletAddress!==state.walletAddress
   ||typeof value.backupVerified!=='boolean'||value.fundingAvailable!==false||value.readyForSigning!==false
   ||value.stage!==(value.backupVerified?'BACKUP_VERIFIED_EXECUTION_PENDING':'BACKUP_VERIFICATION_REQUIRED')
   ||(value.backupVerified?(!Number.isSafeInteger(value.verifiedAt)||value.verifiedAt<0):value.verifiedAt!==null))fail();
  return Object.freeze({walletAddress:state.walletAddress,stage:value.stage,backupVerified:value.backupVerified,
   verifiedAt:value.verifiedAt,fundingAvailable:false,readyForSigning:false});
 }
 function funding(value,state){
  if(value===undefined||value===null)return null;
  if(!state||typeof value!=='object'||Array.isArray(value)||value.walletAddress!==state.walletAddress||value.fundingAvailable!==false||value.readyForSigning!==false)fail();
  if(value.stage==='EXCLUSIVE_WALLET_FUNDS_UNAVAILABLE'){
   if(['availableUsdcUnits','payerLamports','configuredMarginUsdcUnits','hasConfiguredCollateral','observedAt','observedSlot'].some(key=>Object.hasOwn(value,key)))fail();
   return Object.freeze({walletAddress:state.walletAddress,stage:value.stage,fundingAvailable:false,readyForSigning:false});
  }
  if(value.stage!=='OBSERVED_EXCLUSIVE_WALLET_FUNDS')fail();
  for(const key of ['availableUsdcUnits','payerLamports','configuredMarginUsdcUnits'])if(typeof value[key]!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value[key])||BigInt(value[key])>18446744073709551615n)fail();
  if(value.configuredMarginUsdcUnits!==exactUsdUnits(state.settings.margin)||typeof value.hasConfiguredCollateral!=='boolean'
   ||value.hasConfiguredCollateral!==(BigInt(value.availableUsdcUnits)>=BigInt(value.configuredMarginUsdcUnits))
   ||!Number.isSafeInteger(value.observedAt)||value.observedAt<0||!Number.isSafeInteger(value.observedSlot)||value.observedSlot<0)fail();
  return Object.freeze({walletAddress:state.walletAddress,stage:value.stage,availableUsdcUnits:value.availableUsdcUnits,payerLamports:value.payerLamports,
   configuredMarginUsdcUnits:value.configuredMarginUsdcUnits,hasConfiguredCollateral:value.hasConfiguredCollateral,observedAt:value.observedAt,observedSlot:value.observedSlot,fundingAvailable:false,readyForSigning:false});
 }
 async function request(body,withStatus=false){
  const token=session();
  try{
   const health=await json('/health');sameSession(token);
   if(!['controls-only','execute'].includes(health.mode)||typeof health.executionAvailable!=='boolean'||typeof health.custodyProvisioningAvailable!=='boolean'||typeof health.tradingEnabled!=='boolean')fail();
   if(body?.action==='provision'&&health.custodyProvisioningAvailable!==true)fail('custody-unavailable');
   if(['activationReview','activate'].includes(body?.action)&&(health.mode!=='execute'||health.executionAvailable!==true))fail('execution-unavailable');
   const response=await json('/v1/automation',{token,body});sameSession(token);
   if(body?.action==='activationReview'){
    const v=response.review,at=now();let settings;
    try{settings=validateSettings(v?.settings);}catch{fail();}
    if(!v||Object.keys(v).sort().join(',')!==(v.platformFee===undefined?'expiresAt,revision,settings,token,walletAddress':'expiresAt,platformFee,revision,settings,token,walletAddress')||v.walletAddress!==body.walletAddress||v.revision!==body.expectedRevision
     ||typeof v.token!=='string'||!/^[a-f0-9]{64}$/.test(v.token)||!Number.isSafeInteger(at)||!Number.isSafeInteger(v.expiresAt)||v.expiresAt<=at||v.expiresAt>at+60000)fail();
    let platformFee;
    if(v.platformFee!==undefined){platformFee=quotePerpsPlatformFee(exactUsdUnits(settings.margin));
     if(!v.platformFee||Object.keys(v.platformFee).sort().join(',')!==Object.keys(platformFee).sort().join(',')
      ||Object.keys(platformFee).some(key=>v.platformFee[key]!==platformFee[key]))fail();}
    const review=Object.freeze({walletAddress:address(v.walletAddress),revision:revision(v.revision),settings:Object.freeze(settings),expiresAt:v.expiresAt,...platformFee?{platformFee}:{}});
    activationReviews.set(review,{token:v.token,session:token,started:at,used:false});return review;
   }
   if(!Object.hasOwn(response,'controls'))fail();const state=controls(response.controls);
   if(body&&(state===null||body.action!=='provision'&&state.walletAddress!==body.walletAddress))fail();
   if(body&&(body.action==='activate'?(!state.enabled||state.paused||state.revision===body.expectedRevision):(state.enabled||!state.paused)))fail();
   if(body?.action==='provision'){
    const setup=response.setup;if(setup?.stage!=='BACKUP_VERIFICATION_REQUIRED'||setup.backupVerified!==false||setup.fundingAvailable!==false||setup.readyForSigning!==false)fail();
    return Object.freeze({controls:state,setup:Object.freeze({stage:setup.stage,backupVerified:false,fundingAvailable:false,readyForSigning:false})});
   }
   return withStatus?Object.freeze({controls:state,recovery:recovery(response.recovery,state),funding:funding(response.funding,state),executionAvailable:health.mode==='execute'&&health.executionAvailable===true}):state;
  }catch(error){if(failures.has(error))throw error;fail();}
 }
 return Object.freeze({
  read:()=>request(),
  readStatus:()=>request(undefined,true),
  prepareActivation({walletAddress,expectedRevision}={}){return request({action:'activationReview',walletAddress:address(walletAddress),expectedRevision:revision(expectedRevision)});},
  activate({review,explicitApproval,explicitFeeApproval=false}={}){
   const p=activationReviews.get(review),at=now();
   if(explicitApproval!==true||!p||p.used||!Number.isSafeInteger(at)||at<p.started||at>=review.expiresAt)fail('activation-review-expired');
   if(review.platformFee&&explicitFeeApproval!==true)fail('fee-approval-required');
   p.used=true;sameSession(p.session);
   // One attempt: an HTTP error cannot prove activation did not commit.
   return request({action:'activate',walletAddress:review.walletAddress,expectedRevision:review.revision,token:p.token,explicitApproval:true,
    ...review.platformFee?{explicitFeeApproval:true,feeTermsVersion:review.platformFee.version}:{}}).then(state=>{
    if(JSON.stringify(state.settings)!==JSON.stringify(review.settings))fail();return state;
   });
  },
  provision({settings,explicitCustodyApproval}={}){
   if(explicitCustodyApproval!==true)fail('custody-approval-required');
   let canonical;try{canonical=validateSettings(settings);}catch{fail('invalid-settings');}
   if(canonical.capital<10||canonical.margin<10)fail('invalid-settings');
   return request({action:'provision',settings:canonical,explicitCustodyApproval:true});
  },
  save({walletAddress,expectedRevision,settings}){
   let canonical;try{canonical=validateSettings(settings);}catch{fail('invalid-settings');}
   return request({action:'save',walletAddress:address(walletAddress),expectedRevision:revision(expectedRevision),settings:canonical});
  },
  pause:({walletAddress})=>request({action:'pause',walletAddress:address(walletAddress)})
 });
}
