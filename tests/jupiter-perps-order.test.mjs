import test from 'node:test';
import assert from 'node:assert/strict';
import {planJupiterManualOrder} from '../lib/jupiter-perps-order.js';
const intent=()=>({asset:'SOL',side:'LONG',walletAddress:'ENEw7sNPtWu7g5bRMy3WkxAaHbWY5pmySwpXU6VHGaB5',marginUsd:'10.000001',leverage:2,maxSlippageBps:50});
test('manual Long/Short plans preserve exact USDC margin and never imply signing approval',()=>{
 for(const side of ['LONG','SHORT'])for(const asset of ['BTC','ETH','SOL']){
   const plan=planJupiterManualOrder({...intent(),side,asset});
   assert.equal(plan.body.inputTokenAmount,'10000001');assert.equal(plan.body.side,side.toLowerCase());
   assert.equal(plan.requiresTransactionValidation,true);assert.equal(plan.body.tpsl,undefined);
   assert.ok(Object.isFrozen(plan.body));assert.equal(plan.readyForSigning,undefined);
 }
});
test('optional exits are exact directional prices, not leveraged profit percentages',()=>{
 const plan=planJupiterManualOrder({...intent(),referencePrice:'100',stopLoss:'95.000001',takeProfit:'110'});
 assert.equal(plan.body.tpsl[0].triggerPrice,'95000001');assert.equal(plan.body.tpsl[1].triggerPrice,'110000000');
 assert.throws(()=>planJupiterManualOrder({...intent(),referencePrice:'100',stopLoss:'101'}),/INVALID_EXIT_LEVELS/);
 assert.throws(()=>planJupiterManualOrder({...intent(),side:'SHORT',referencePrice:'100',takeProfit:'110'}),/INVALID_EXIT_LEVELS/);
 assert.throws(()=>planJupiterManualOrder({...intent(),stopLoss:'95'}));
 assert.equal(planJupiterManualOrder({...intent(),side:'SHORT',referencePrice:'100',stopLoss:'105',takeProfit:'90'}).body.tpsl.length,2);
});
test('manual intent rejects unavailable markets, invalid wallet and rounded or excessive risk inputs',()=>{
 for(const change of [{asset:'XRP'},{side:'BUY'},{walletAddress:'bad'},{marginUsd:'9.999999'},{marginUsd:'10.0000001'},
   {leverage:0},{leverage:51},{leverage:2.01},{maxSlippageBps:0},{maxSlippageBps:101}])
   assert.throws(()=>planJupiterManualOrder({...intent(),...change}));
});
