import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {swapFixture} from './fixtures/web-swap.mjs';
import {createBotWalletSwapReviewer,botSwapAmountUnits} from '../lib/perps-bot-swap-review.js';
const owner='a'.repeat(64);
async function fixture({nativeInput=true}={}){
 const walletAddress=bs58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(82))),chain=await swapFixture(walletAddress,{nativeInput,slippageBps:50});
 const state={walletAddress,revision:1,enabled:false,paused:true},custody={ownerAccountHash:owner,walletAddress,exclusive:true},pending={known:true,operations:[]};let builds=0,reads=0;
 const service=createBotWalletSwapReviewer({controls:{readForOwner:who=>{assert.equal(who.ownerAccountHash,owner);return {...state};}},vault:{describe:who=>{assert.equal(who.walletAddress,walletAddress);return {...custody};}},readPending:async()=>pending,
  readRequest:async(method,params)=>{reads++;assert.notEqual(method,'sendTransaction');return chain.rpc(method,params);},fetchImpl:async(url)=>{builds++;assert(url.startsWith('https://www.jamddmaj.com/api/swap-build?'));return Response.json({ok:true,preparation:chain.preparation});}});
 return {service,state,custody,pending,walletAddress,counts:()=>({builds,reads})};
}
for(const nativeInput of [true,false])test('bot swap review uses exclusive owned account and validated simulated effects '+nativeInput,async()=>{
 const f=await fixture({nativeInput}),result=await f.service.prepare({ownerAccountHash:owner,direction:nativeInput?'SOL_TO_USDC':'USDC_TO_SOL',amount:nativeInput?'0.1':'10'});
 assert.equal(result.walletAddress,f.walletAddress);assert.equal(result.readyForSigning,false);assert.equal(result.submitted,false);assert.equal(result.slippageBps,50);
 assert.equal(result.minimumOutputUnits,nativeInput?'9950000':'99500000');assert.deepEqual(Object.keys(f.service),['prepare']);
 assert.equal(Object.hasOwn(result,'message'),false);assert.equal(Object.hasOwn(result,'signedBase64'),false);
});
test('invalid amounts and pairs cannot query builder or chain',async()=>{
 const f=await fixture();for(const amount of ['0','-1','1e2','0.0000000001','1,2'])await assert.rejects(f.service.prepare({ownerAccountHash:owner,direction:'SOL_TO_USDC',amount}),/INVALID_AMOUNT/);
 await assert.rejects(f.service.prepare({ownerAccountHash:owner,direction:'SOL_TO_BTC',amount:'1'}),/INVALID_PAIR/);assert.deepEqual(f.counts(),{builds:0,reads:0});
 assert.equal(botSwapAmountUnits('0.14',9),'140000000');
});
test('active bot, unavailable custody, uncertain operations and missing owner fail before preparation',async()=>{
 for(const change of [f=>{f.state.enabled=true;},f=>{f.state.paused=false;},f=>{f.custody.exclusive=false;},f=>{f.custody.walletAddress=bs58.encode(new Uint8Array(32).fill(7));},f=>{f.pending.known=false;},f=>{f.pending.operations.push({state:'UNKNOWN'});}]){
  const f=await fixture();change(f);await assert.rejects(f.service.prepare({ownerAccountHash:owner,direction:'SOL_TO_USDC',amount:'0.1'}));assert.deepEqual(f.counts(),{builds:0,reads:0});
 }
 const f=await fixture();await assert.rejects(f.service.prepare({ownerAccountHash:'not authenticated',direction:'SOL_TO_USDC',amount:'0.1'}),/LOGIN_REQUIRED/);
});
