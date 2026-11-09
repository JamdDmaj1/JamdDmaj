import test from 'node:test';
import assert from 'node:assert/strict';
import {computeTradeSignal} from '../lib/finance-markets.js';

const series=(start,step,count=80)=>Array.from({length:count},(_,i)=>{const close=start+step*i;return {time:1700000000000+i*3600000,open:close,high:close*1.001,low:close*0.999,close,volume:100};});

test('rising candles produce a BUY signal with reasons',()=>{
 const signal=computeTradeSignal(series(100,1));
 assert.equal(signal.action,'BUY');
 assert.equal(signal.caution,true);
 assert.ok(signal.reasons.length>=2);
 assert.ok(signal.ema20>signal.ema50);
});

test('falling candles produce a SELL signal',()=>{
 const signal=computeTradeSignal(series(300,-2));
 assert.equal(signal.action,'SELL');
 assert.equal(signal.caution,true);
 assert.ok(signal.ema20<signal.ema50);
});

test('short history waits instead of guessing',()=>{
 const signal=computeTradeSignal(series(100,1,10));
 assert.equal(signal.action,'WAIT');
 assert.equal(signal.rsi,null);
});
