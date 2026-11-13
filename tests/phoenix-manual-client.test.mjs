import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
import {createPhoenixManualClient} from '../lib/phoenix-manual-client.js';
const wallet='11111111111111111111111111111112',workflowId='b'.repeat(64),reviewId='c'.repeat(64),signature=bs58.encode(new Uint8Array(64).fill(7));
test('parent client rejects changed setup scope, session, replay and a falsely confirmed provider ACK',async()=>{
 let clock=1800000000000,token='a'.repeat(64),patch={};const calls=[];
 const review={stage:'PHOENIX_PARENT_REVIEW',venue:'phoenix',walletAddress:wallet,id:reviewId,parentAddress:'11111111111111111111111111111113',
  maxPositions:32,networkFeeLamports:'10000',rentLockedLamports:'8371840',maximumLamports:'8381840',expiresAt:clock+15000,
  authorizationDurationMs:300000,requiresProtocolCosignature:true,authorizesTrading:false,submitted:false};
 const operation={stage:'PHOENIX_PARENT_OPERATION',venue:'phoenix',walletAddress:wallet,id:reviewId,parentAddress:review.parentAddress,state:'UNKNOWN',signature,
  registered:false,requiresPolling:true,requiresOperatorReview:false,requiresNewReview:false,mayRetry:false,providerAcknowledged:true};
 const client=createPhoenixManualClient({now:()=>clock,readSessionToken:()=>token,fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);
  return Response.json({ok:true,phoenix:{...(body.action==='phoenixParentPrepare'?review:operation),...patch}});
 }});
 for(const change of [{authorizesTrading:true},{maxPositions:128},{requiresProtocolCosignature:false},{maximumLamports:'8381841'},
  {networkFeeLamports:'10001'},{expiresAt:clock+300000},{submitted:true}]){patch=change;await assert.rejects(()=>client.prepareParent(wallet,'DOGE'),/review-required/);}
 patch={};const r=await client.prepareParent(wallet,'DOGE');
 await assert.rejects(()=>client.confirmParent({...r},true),/review-required/);await assert.rejects(()=>client.confirmParent(r,false),/review-required/);
 await assert.rejects(()=>client.confirmEntry(r,true),/review-required/);await assert.rejects(()=>client.confirmClose(r,true),/review-required/);
 token='d'.repeat(64);await assert.rejects(()=>client.confirmParent(r,true),/review-required/);token='a'.repeat(64);
 assert.equal((await client.confirmParent(r,true)).registered,false);await assert.rejects(()=>client.confirmParent(r,true),/review-required/);
 patch={registered:true};await assert.rejects(()=>client.recoverParent(wallet,reviewId),/status-unverified/);
 patch={};const expired=await client.prepareParent(wallet,'DOGE');clock+=15001;await assert.rejects(()=>client.confirmParent(expired,true),/review-required/);
 assert.equal(calls.filter(c=>c.action==='phoenixParentConfirm').length,1);assert.equal(calls.some(c=>Object.hasOwn(c,'serializedTxBase64')),false);
});

test('entry review binds original intent, commission recipient, session and one-use confirmation',async()=>{
 const now=1800000000000,terms=quotePerpsPlatformFee('10000000'),draft={symbol:'DOGE',side:'SHORT',marginUsdcUnits:'10000000',leverageTenths:30};
 const review={...draft,stage:'PHOENIX_MANUAL_ENTRY_REVIEW',venue:'phoenix',walletAddress:wallet,id:reviewId,workflowId,expiresAt:now+15000,submitted:false,
  maxSlippageBps:50,withdrawalMayQueue:true,platformFeeUsdcUnits:terms.feeUnits,platformFeeTermsVersion:terms.version,
  maximumFeeNetworkLamports:'10000',maximumNetworkAndRentLamports:'15600',protocolFeeUsdcUnits:'10420',authorizationDurationMs:300000,
  baseLots:'240',referencePrice:'0.13',priceLimitUsd:'0.12935',maximumProtocolTakerFeeMicro:350};
 const result={stage:'PHOENIX_MANUAL_OPERATION',venue:'phoenix',walletAddress:wallet,workflowId,state:'OPEN',attemptId:reviewId,attemptState:'FINALIZED',phase:'FEE',signature,
  submitted:true,walletCredited:false,readyForRetry:false,requiresPolling:false,requiresQueueReconciliation:false};
 let patch={},token='a'.repeat(64);const calls=[];
 const client=createPhoenixManualClient({now:()=>now,readSessionToken:()=>token,fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);return Response.json({ok:true,phoenix:body.action==='phoenixEntryPrepare'?{...review,...patch}:result});
 }});
 for(const change of [{side:'LONG'},{marginUsdcUnits:'11000000'},{leverageTenths:40},{maxSlippageBps:500},{platformFeeUsdcUnits:'20001'},
  {platformFeeTermsVersion:wallet},{maximumFeeNetworkLamports:'10001'},{expiresAt:now+300000}]){
  patch=change;await assert.rejects(()=>client.prepareEntry(wallet,draft),/review-required/);
 }
 patch={};const r=await client.prepareEntry(wallet,draft);
 await assert.rejects(()=>client.confirmEntry({...r},true),/review-required/);await assert.rejects(()=>client.confirmClose(r,true),/review-required/);
 await assert.rejects(()=>client.confirmEntry(r,false),/review-required/);token='d'.repeat(64);await assert.rejects(()=>client.confirmEntry(r,true),/review-required/);
 token='a'.repeat(64);assert.equal((await client.confirmEntry(r,true)).state,'OPEN');await assert.rejects(()=>client.confirmEntry(r,true),/review-required/);
 assert.deepEqual(calls.at(-1),{action:'phoenixEntryConfirm',walletAddress:wallet,id:reviewId,explicitApproval:true});
});
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
