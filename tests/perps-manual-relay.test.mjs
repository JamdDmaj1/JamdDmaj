import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualPerpsRelay} from '../lib/perps-manual-relay.js';
const path='/api/perps-manual-policy',token='e'.repeat(64);
const request=(body,headers={})=>new Request('https://www.jamddmaj.com'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://www.jamddmaj.com',...headers},body:JSON.stringify(body)});
test('manual relay forwards only the fixed TLS endpoint, bearer and approved body, never cookies or host overrides',async()=>{
 let calls=0;const handler=createManualPerpsRelay({path,limit:async()=>{},fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://157.230.54.133'+path);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Authorization','Content-Type','Origin']);assert.equal(options.headers.Authorization,'Bearer '+token);
  return Response.json({ok:true,policy:null,executionAvailable:false,readyForSigning:false});
 }});
 const response=await handler(request({action:'read',walletAddress:'fixture'},{Cookie:'private','X-Forwarded-Host':'evil.test'}));assert.equal(response.status,200);assert.equal(calls,1);
 assert.equal((await handler(request({action:'read',walletAddress:'fixture',owner:'victim'}))).status,400);
 assert.equal((await handler(request({action:'read',walletAddress:'fixture'},{Authorization:''}))).status,401);
 assert.equal((await handler(request({action:'read',walletAddress:'fixture'},{Origin:'https://evil.test'}))).status,400);assert.equal(calls,1);
});
test('relay failure and malformed upstream responses remain bounded and submission is never retried',async()=>{
 let calls=0;const submitPath='/api/perps-submit',handler=createManualPerpsRelay({path:submitPath,limit:async()=>{},fetchImpl:async()=>{calls++;throw Error('private upstream details');}});
 const response=await handler(new Request('https://www.jamddmaj.com'+submitPath,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({explicitApproval:true,reviewId:'fixture',signature:'fixture',signedBase64:'fixture'})}));
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'WEB_SUBMISSION_UNCONFIRMED',requiresReconciliation:true,readyForRetry:false});assert.equal(calls,1);
 const malformed=createManualPerpsRelay({path,limit:async()=>{},fetchImpl:async()=>Response.json({ok:true,policy:null,executionAvailable:false,readyForSigning:true,secret:'private'})});
 assert.deepEqual(await (await malformed(request({action:'read',walletAddress:'fixture'}))).json(),{error:'WEB_SERVICE_UNAVAILABLE'});
});
