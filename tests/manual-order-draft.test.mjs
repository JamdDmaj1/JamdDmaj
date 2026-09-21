import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewManualOrder} from '../lib/manual-order-draft.js';
const base={symbol:'BTCUSDT',side:'LONG',margin:5,leverage:3,reference:100,stop:90,take:120};
test('review calculates notional without claiming verification or submission',()=>{
 const r=reviewManualOrder(base);assert.equal(r.notional,15);assert.equal(r.submitted,false);assert.equal(r.contractVerified,false);assert.ok(Object.isFrozen(r));
});
test('invalid inputs and protection geometry fail closed',()=>{
 for(const change of [{symbol:'BTC/USDT'},{side:'BUY'},{margin:0},{margin:26},{leverage:11},{leverage:1.5},{stop:101},{take:99},{reference:Infinity}])assert.throws(()=>reviewManualOrder({...base,...change}));
});
test('short geometry is reversed',()=>{
 assert.doesNotThrow(()=>reviewManualOrder({...base,side:'SHORT',stop:120,take:90}));
 assert.throws(()=>reviewManualOrder({...base,side:'SHORT'}));
});
