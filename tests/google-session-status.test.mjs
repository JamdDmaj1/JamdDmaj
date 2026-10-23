import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGoogleSession} from '../web-trial-ui.js';
const token='a'.repeat(64),at=1792789000000;
test('saved profiles do not imply sessions and missing access makes no network request',async()=>{
 let calls=0;for(const value of ['',null,'profile@example.com','a'.repeat(63)]){
  assert.equal(await inspectGoogleSession({readToken:()=>value,fetchImpl:async()=>{calls++;}}),'missing');
 }assert.equal(calls,0);
});
test('identity verification uses only the existing credential and returns no account or credential',async()=>{
 let calls=0;const result=await inspectGoogleSession({readToken:()=>token,now:()=>at,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'/api/perps-identity');assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  assert.equal(options.headers.Authorization,'Bearer '+token);return Response.json({ok:true,accountHash:'b'.repeat(64),verifiedAt:at});
 }});assert.equal(result,'valid');assert.equal(calls,1);
});
test('rejected, unavailable, malformed, stale and changed sessions are distinct without retry or token removal',async()=>{
 for(const [reply,expected]of [[()=>Response.json({}, {status:401}),'rejected'],[()=>Response.json({}, {status:503}),'unavailable'],
  [()=>Response.json({ok:true,accountHash:'b'.repeat(64),verifiedAt:at-20000}),'unavailable'],[()=>Response.json({ok:true,accountHash:'profile',verifiedAt:at}),'unavailable'],
  [()=>Response.json({private:'x'.repeat(5000)}),'unavailable'],[()=>{throw Error('private');},'unavailable']]){
  let calls=0;assert.equal(await inspectGoogleSession({readToken:()=>token,now:()=>at,fetchImpl:async()=>{calls++;return reply();}}),expected);assert.equal(calls,1);
 }
 let current=token;assert.equal(await inspectGoogleSession({readToken:()=>current,fetchImpl:async()=>{current='c'.repeat(64);return Response.json({});}}),'changed');
 assert.equal(await inspectGoogleSession({readToken:()=>token,apiRoot:'https://untrusted.invalid',fetchImpl:()=>assert.fail()}),'unavailable');
});
