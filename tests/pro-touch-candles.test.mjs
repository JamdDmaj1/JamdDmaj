import test from 'node:test';
import assert from 'node:assert/strict';
import {touchCandlesFromRows} from '../lib/pro-signals.js';

test('Bitget rows use timestamp at index 0, not quote volume at index 6',()=>{
 const now=1_700_000_000_000;
 const rows=[
  [now-120000, '1', '1.1', '0.9', '1', '10', '999999'],
  [now-30000, '1', '1.2', '0.95', '1.1', '20', '2500']
 ];
 const candles=touchCandlesFromRows(rows, now-30000, 60000, 1);
 assert.equal(candles.length,1);
 assert.equal(candles[0].high,1.2);
 assert.equal(candles[0].low,0.95);
 assert.equal(candles[0].close,1.1);
});

test('contract multipliers are applied to price levels',()=>{
 const now=1_700_000_000_000;
 const rows=[[now-30000,'1','10','8','9','1','100']];
 const [candle]=touchCandlesFromRows(rows, now-60000, 60000, 10);
 assert.equal(candle.high,1);
 assert.equal(candle.low,0.8);
 assert.equal(candle.close,0.9);
});
