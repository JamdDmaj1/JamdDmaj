import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createHandler} from '../api/perps-operation-status.js';
const input={reviewId:'a'.repeat(64),recordBinding:'b'.repeat(64),walletAddress:bs58.encode(new Uint8Array(32).fill(1)),signature:bs58.encode(new Uint8Array(64).fill(2))};
const settled={...input,stage:'WEB_PERPS_OPERATION_SETTLED',wireHash:'c'.repeat(64),outcome:'CONFIRMED',financialState:'OPEN',confirmedSlot:100,executionDay:'2026-10-22',settledAt:Date.now()};
const request=(body=input,options={})=>new Request('https://www.jamddmaj.com/api/perps-operation-status'+(options.search||''),{method:'POST',headers:{Origin:'https://www.jamddmaj.com','Content-Type':'application/json',Cookie:'private-cookie',Authorization:'Bearer private',...options.headers},body:JSON.stringify(body)});
test('same-origin status relay forwards only a narrow read capability to a fixed TLS endpoint and returns no-store facts',async()=>{
 for(const status of [null,settled]){
  let calls=0,quotas=0;const handler=createHandler({limit:async()=>{quotas++;},fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,'https://157.230.54.133/api/perps-operation-status');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.method,'POST');
   assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Content-Type','Origin']);assert.deepEqual(JSON.parse(options.body),input);return Response.json({ok:true,status});
  }});
  const result=await handler(request());assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true,status});assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.headers.get('set-cookie'),null);assert.equal(calls,1);assert.equal(quotas,1);
 }
});
test('relay rejects foreign origins, query parameters, executable data, malformed keys and oversized requests before quota or transport',async()=>{
 let calls=0;const handler=createHandler({limit:async()=>{calls++;},fetchImpl:async()=>{throw Error('must not contact');}});
 for(const req of [new Request('https://www.jamddmaj.com/api/perps-operation-status'),request(input,{search:'?execute=true'}),request(input,{headers:{Origin:'https://foreign.test'}}),
  request({...input,signedBase64:'wire'}),request({...input,url:'https://foreign.test'}),request({...input,reviewId:[input.reviewId]}),request({...input,signature:'invalid'}),request({...input,padding:'x'.repeat(1025)})]){
  assert.equal((await handler(req)).status,req.method==='GET'?405:400);
 }
 assert.equal(calls,0);
});
test('invalid upstream facts, errors and quota failure cannot reflect private data or reset an uncertain operation',async()=>{
 for(const response of [()=>Response.json({ok:true,status:{...settled,balance:'private'}}),()=>Response.json({ok:true,status:{...settled,signature:'foreign'}}),
  ()=>Response.json({ok:true,status:{...settled,outcome:'FAILED'}}),()=>Response.json({ok:true,status:{...settled,wireHash:[settled.wireHash]}}),
  ()=>new Response('private details',{status:503}),()=>new Response('private'.repeat(1000),{headers:{'Content-Type':'application/json'}}),()=>Response.json({ok:true,status:[]})]){
  const handler=createHandler({limit:async()=>{},fetchImpl:async()=>response(),diagnostic:()=>{}}),result=await handler(request());
  assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'WEB_PERPS_STATUS_UNAVAILABLE'});
 }
 let calls=0;const handler=createHandler({limit:async()=>{throw Object.assign(Error('secret'),{status:429});},fetchImpl:async()=>{calls++;},diagnostic:()=>{}});
 assert.equal((await handler(request())).status,429);assert.equal(calls,0);
});
test('an upstream transport ignoring the deadline is still rejected after abort',async t=>{
 const controller=new AbortController();t.mock.method(AbortSignal,'timeout',()=>controller.signal);
 const handler=createHandler({limit:async()=>{},fetchImpl:async()=>{controller.abort();return Response.json({ok:true,status:settled});},diagnostic:()=>{}});
 assert.equal((await handler(request())).status,502);
});
