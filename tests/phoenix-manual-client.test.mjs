import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createPhoenixManualClient} from '../lib/phoenix-manual-client.js';
const wallet='11111111111111111111111111111112',workflowId='b'.repeat(64),reviewId='c'.repeat(64),signature=bs58.encode(new Uint8Array(64).fill(7));
function fixture(){
 let clock=1800000000000,token='a'.repeat(64),tamper=null;const sent=[];
 const review={stage:'PHOENIX_MANUAL_CLOSE_REVIEW',venue:'phoenix',walletAddress:wallet,workflowId,id:reviewId,symbol:'DOGE',expiresAt:clock+15000,
  submitted:false,maxSlippageBps:50,closePercent:100,returnsToUsdc:true,withdrawalMayQueue:true,platformCloseFeeUnits:'0',networkFeeLamports:'5600',
  maximumNetworkAndRentLamports:'25600',authorizationDurationMs:300000,estimatesAreGuaranteed:false,maximumProtocolTakerFeeMicro:350,
  protocolCloseFeeUsdcUnits:'10420',estimatedReceivedCollateralUnits:'9980000',referencePrice:'0.13',priceLimitUsd:'0.13065',side:'LONG',baseLots:'240'};
 const operation={stage:'PHOENIX_MANUAL_OPERATION',venue:'phoenix',walletAddress:wallet,workflowId,state:'CANONICAL_READY',attemptId:reviewId,attemptState:'UNKNOWN',phase:'UNWRAP',signature,
  submitted:true,walletCredited:false,readyForRetry:false,requiresPolling:true,requiresQueueReconciliation:false};
 const client=createPhoenixManualClient({now:()=>clock,readSessionToken:()=>token,fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);sent.push({url,options,body});const value=body.action==='phoenixClosePrepare'?structuredClone(review):structuredClone(operation);
  tamper?.(value);return Response.json({ok:true,phoenix:value});
 }});
 return {client,sent,review,advance(ms){clock+=ms;},setToken(v){token=v;},tamper(fn){tamper=fn;}};
}
test('close review uses existing bearer session and wallet, and confirmation is one-use without wire submission',async()=>{
 const f=fixture(),r=await f.client.prepareClose(wallet,workflowId);
 await assert.rejects(()=>f.client.confirmClose({...r},true),/review-required/);
 await assert.rejects(()=>f.client.confirmClose(r,false),/review-required/);
 const result=await f.client.confirmClose(r,true);assert.equal(result.readyForRetry,false);assert.equal(result.walletCredited,false);
 await assert.rejects(()=>f.client.confirmClose(r,true),/review-required/);assert.equal(f.sent.length,2);
 assert.deepEqual(f.sent[1].body,{action:'phoenixCloseConfirm',walletAddress:wallet,id:reviewId,explicitApproval:true});
 assert.equal(f.sent[0].options.credentials,'omit');assert.equal(f.sent[0].options.redirect,'error');assert.equal(f.sent[0].options.headers.Authorization,'Bearer '+'a'.repeat(64));
 assert.equal(JSON.stringify(f.sent.map(v=>v.body)).includes('serializedTxBase64'),false);
});
test('session change, expired review and a broadened price tolerance cannot authorize confirmation',async()=>{
 const f=fixture(),r=await f.client.prepareClose(wallet,workflowId);f.setToken('d'.repeat(64));
 await assert.rejects(()=>f.client.confirmClose(r,true),/review-required/);assert.equal(f.sent.length,1);
 const g=fixture(),expired=await g.client.prepareClose(wallet,workflowId);g.advance(15001);await assert.rejects(()=>g.client.confirmClose(expired,true),/review-required/);
 const h=fixture();h.tamper(v=>{v.maxSlippageBps=500;});await assert.rejects(()=>h.client.prepareClose(wallet,workflowId),/review-required/);
});
test('another wallet response, inconsistent credited state and malformed workflow ids fail before being trusted',async()=>{
 const f=fixture();f.tamper(v=>{v.walletAddress='11111111111111111111111111111113';});await assert.rejects(()=>f.client.prepareClose(wallet,workflowId),/unavailable/);
 const g=fixture();g.tamper(v=>{v.walletCredited=true;});await assert.rejects(()=>g.client.recoverClose(wallet,workflowId),/status-unverified/);
 await assert.rejects(()=>g.client.prepareClose(wallet,'invalid'),/review-required/);assert.equal(g.sent.length,1);
});
