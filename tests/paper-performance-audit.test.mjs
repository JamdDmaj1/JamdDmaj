import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPaperPerformance} from '../lib/paper-performance-audit.js';
test('aggregates partial exits and excludes still-open trades',()=>{
 const result=auditPaperPerformance([
  {signalId:'a',symbol:'SOL',netPnl:2,estimatedFees:.1},
  {signalId:'a',symbol:'SOL',netPnl:3,estimatedFees:.2},
  {signalId:'b',symbol:'BTC',netPnl:-10,estimatedFees:.3},
  {signalId:'c',symbol:'SOL',netPnl:20}], [{signalId:'c'}]);
 assert.equal(result.sampleSize,2);assert.equal(result.partialTrades,1);
 assert.equal(result.netPnl,-5);assert.equal(result.expectancy,-2.5);
 assert.equal(result.profitFactor,.5);assert.equal(result.averageWin,5);
 assert.equal(result.averageLoss,10);assert.equal(result.bySymbol[0].symbol,'BTC');
 assert.equal(result.sufficientSample,false);
});
test('empty or malformed data never claims profitability',()=>{
 const result=auditPaperPerformance([{signalId:'bad',netPnl:NaN}]);
 assert.equal(result.sampleSize,0);assert.equal(result.profitFactor,null);
 assert.equal(result.expectancy,null);
});
