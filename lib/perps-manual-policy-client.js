import {validateManualPerpsLimits} from './perps-manual-limits.js';
import bs58 from 'bs58';
function fail(code='MANUAL_POLICY_UNAVAILABLE'){throw Object.assign(Error(code),{code});}
export function createManualPerpsPolicyClient({fetchImpl,readSessionToken}={}){
 if(typeof fetchImpl!=='function'||typeof readSessionToken!=='function')fail();
 async function request(body){
  let token;try{token=readSessionToken();}catch{fail('LOGIN_REQUIRED');}
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('LOGIN_REQUIRED');
  try{if(typeof body.walletAddress!=='string'||bs58.decode(body.walletAddress).length!==32||bs58.encode(bs58.decode(body.walletAddress))!==body.walletAddress)fail('INVALID_WALLET');}catch{fail('INVALID_WALLET');}
  let reader;const signal=AbortSignal.timeout(8000);
  try{
   const response=await fetchImpl('/api/perps-manual-policy',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
   if(signal.aborted)fail();if(readSessionToken()!==token)fail('SESSION_CHANGED');
   if(response.status===401)fail('LOGIN_REQUIRED');
   if(!response.ok||response.redirected||!response.body||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')fail();
   reader=response.body.getReader();let size=0;const parts=[];
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096)fail();parts.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(signal.aborted)fail();if(readSessionToken()!==token)fail('SESSION_CHANGED');
   if(!value||Object.keys(value).sort().join(',')!=='executionAvailable,ok,policy,readyForSigning'||value.ok!==true||value.readyForSigning!==false||typeof value.executionAvailable!=='boolean')fail();
   let policy=null;
   if(value.policy!==null){
    const v=value.policy;if(!v||Object.keys(v).sort().join(',')!=='limits,revision,updatedAt,walletAddress'||v.walletAddress!==body.walletAddress
     ||typeof v.revision!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.revision)||!Number.isSafeInteger(v.updatedAt)||v.updatedAt<0)fail();
    const limits=validateManualPerpsLimits(v.limits);if(JSON.stringify(limits)!==JSON.stringify(v.limits))fail();policy=Object.freeze({...v,limits});
   }
   if(body.action==='save'&&(!policy||policy.revision===body.expectedRevision||JSON.stringify(policy.limits)!==JSON.stringify(body.limits)))fail();
   return Object.freeze({policy,executionAvailable:value.executionAvailable,readyForSigning:false});
  }catch(error){if(['LOGIN_REQUIRED','SESSION_CHANGED'].includes(error?.code))throw error;fail();}
  finally{if(reader)try{await reader.cancel();}catch{}}
 }
 return Object.freeze({read:walletAddress=>request({action:'read',walletAddress}),save({walletAddress,expectedRevision,limits,explicitApproval}={}){
  if(explicitApproval!==true)fail('EXPLICIT_APPROVAL_REQUIRED');
  if(expectedRevision!==null&&(typeof expectedRevision!=='string'||!/^[a-f0-9-]{36}$/.test(expectedRevision)))fail('INVALID_REVISION');
  return request({action:'save',walletAddress,expectedRevision,limits:validateManualPerpsLimits(limits),explicitApproval:true});
 }});
}
