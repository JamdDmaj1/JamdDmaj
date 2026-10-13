import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareConfiguredAutomation} from '../lib/automation-preparation.js';
const now=Date.now(),address='11111111111111111111111111111111';
const input={settings:{capital:100,loss:20,positions:2,margin:10,leverage:3,dailyTrades:5},signal:{id:'signal-1',createdAt:new Date(now).toISOString(),pair:'SOLUSDT',side:'LONG',entry:100,sl:95,tp1:110},decision:{ok:true},walletAddress:address,snapshot:{updatedAt:now,walletAddress:address,availableUsd:100,allocatedUsd:0,lossTodayUsd:0,openPositions:0,tradesToday:0},enabled:true,paused:false,maxSlippageBps:50,now};
test('configured preparation binds account, limits and exits without signing',async()=>{
 let body;
 const result=await prepareConfiguredAutomation({...input,settings:{...input.settings,stopLossPercent:2}},async(url,options)=>{body=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({serializedTxBase64:'AQ==',quote:{side:'long'},positionPubkey:address,txMetadata:{blockhash:address,lastValidBlockHeight:100}})};});
 assert.equal(body.inputTokenAmount,'10000000');assert.equal(body.tpsl[0].triggerPrice,'98000000');assert.equal(body.tpsl[1].triggerPrice,'110000000');
 assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);assert.equal(result.requiresFreshAccountBeforeSigning,true);
});
test('invalid state never reaches Jupiter',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('unexpected');};
 for(const override of [{enabled:false},{snapshot:{...input.snapshot,tradesToday:5}},{snapshot:{...input.snapshot,walletAddress:'other'}},{snapshot:{...input.snapshot,updatedAt:now-11000}},{snapshot:{...input.snapshot,lossTodayUsd:15}}])await assert.rejects(prepareConfiguredAutomation({...input,...override},request));
 assert.equal(calls,0);
});
