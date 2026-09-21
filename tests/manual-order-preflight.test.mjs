import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightManualOrder} from '../lib/manual-order-preflight.js';
const now=Date.parse('2026-09-21T12:00:00Z');
const draft={symbol:'BTCUSDT',side:'LONG',margin:5,leverage:3,reference:100,stop:90,take:110};
const quote={symbol:'BTCUSDT',price:100,timestamp:now,minLeverage:'1',maxLeverage:'125',minNotional:'5',minQuantity:'0.01',quantityStep:'0.01'};
const state=()=>({config:{livePaused:false},executor:{mode:'live',ok:true,bitgetSynced:true,entrySource:'manual-only',manualOrderVersion:1,livePaused:false,receivedAt:new Date(now).toISOString(),accountRisk:{updatedAt:new Date(now).toISOString(),available:20}}});
test('server preview calculates quantity but never authorizes or sends an order',()=>{
 const s=state(),before=JSON.stringify(s),result=preflightManualOrder(draft,quote,s,now);
 assert.deepEqual(result.blockers,[]);assert.equal(result.estimatedQuantity,0.15);
 assert.equal(result.submitted,false);assert.equal(result.liveOrderEnabled,false);assert.equal(JSON.stringify(s),before);
});
test('new quote cannot invalidate stop geometry silently',()=>{
 assert.throws(()=>preflightManualOrder(draft,{...quote,price:89},state(),now));
 assert.throws(()=>preflightManualOrder(draft,{...quote,symbol:'ETHUSDT'},state(),now));
 assert.throws(()=>preflightManualOrder(draft,{...quote,timestamp:now-31000},state(),now));
});
test('pause, balance and changed price are surfaced together',()=>{
 const s=state();s.config.livePaused=true;s.executor.accountRisk.available=0;
 const r=preflightManualOrder(draft,{...quote,price:101},s,now);
 for(const reason of ['entries_paused_or_unknown','insufficient_balance_with_fee_reserve','price_changed_review_again'])assert.ok(r.blockers.includes(reason));
});
test('exchange minimums, leverage and missing rules fail closed',()=>{
 for(const [override,reason] of [[{minNotional:'100'},'below_exchange_minimum'],[{maxLeverage:'2'},'exchange_leverage_limit'],[{quantityStep:null},'contract_size_rules_unavailable']]){
 assert.ok(preflightManualOrder(draft,{...quote,...override},state(),now).blockers.includes(reason));
 }
});
