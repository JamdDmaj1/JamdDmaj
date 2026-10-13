import test from 'node:test';
import assert from 'node:assert/strict';
import {exactUsdUnits,planJupiterAutomationSignal,prepareJupiterAutomationSignal} from '../lib/jupiter-perps-automation.js';
const wallet='ENEw7sNPtWu7g5bRMy3WkxAaHbWY5pmySwpXU6VHGaB5';
const signal=()=>({id:'scanner:SOL:1',pair:'SOLUSDT',side:'LONG',entry:100,sl:95,tp1:110,createdAt:new Date(100000).toISOString()});
const options=()=>({decision:{ok:true},walletAddress:wallet,marginUsd:'10.000001',leverage:3,maxSlippageBps:50,now:100000});
test('exact USDC amounts never round and planner preserves approved signal exits',()=>{
 assert.equal(exactUsdUnits('10.000001'),'10000001');for(const v of ['1e2','0','1.0000001','-1','NaN'])assert.throws(()=>exactUsdUnits(v));
 const p=planJupiterAutomationSignal(signal(),options());assert.equal(p.body.inputTokenAmount,'10000001');assert.equal(p.body.asset,'SOL');assert.equal(p.body.tpsl[0].triggerPrice,'95000000');assert.equal(p.body.tpsl[1].triggerPrice,'110000000');assert.equal(p.body.inputToken,'USDC');
});
test('adapter rejects unsupported pairs, stale signals, missing strategy approval and unsafe limits',()=>{
 for(const s of [{...signal(),pair:'XRPUSDT'},{...signal(),contractMultiplier:1000},{...signal(),side:'BUY'},{...signal(),sl:101},{...signal(),createdAt:'invalid'}])assert.throws(()=>planJupiterAutomationSignal(s,options()));
 for(const o of [{...options(),decision:{ok:false}},{...options(),now:500001},{...options(),leverage:51},{...options(),maxSlippageBps:101},{...options(),marginUsd:9},{...options(),walletAddress:'bad'}])assert.throws(()=>planJupiterAutomationSignal(signal(),o));
});
test('preparation only calls fixed unsigned builder and never enables signing or sends a trade',async()=>{
 const calls=[];const result=await prepareJupiterAutomationSignal(signal(),options(),async(url,config)=>{calls.push({url,config});return new Response(JSON.stringify({positionPubkey:wallet,serializedTxBase64:'AQID',quote:{side:'long'},txMetadata:{blockhash:wallet,lastValidBlockHeight:'100'}}));});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://perps-api.jup.ag/v1/positions/increase');assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
 await assert.rejects(prepareJupiterAutomationSignal(signal(),options(),async()=>new Response('{}')),/INVALID_PREPARATION/);
});
