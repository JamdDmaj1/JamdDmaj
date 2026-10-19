import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAutomationExits,planDailyLossAction,checkDailyTradeLimit} from '../lib/automation-settings.js';
import {exactUsdUnits} from '../lib/jupiter-perps-order.js';
const settings={capital:100,loss:10,positions:2,margin:20,leverage:4,dailyTrades:3};
test('empty exits preserve Telegram levels; percentages follow long and short',()=>{
 const long={side:'LONG',entry:100,sl:95,tp1:110};
 assert.deepEqual(applyAutomationExits(long,settings),long);
 assert.deepEqual(applyAutomationExits(long,{...settings,stopLossPercent:2,takeProfitPercent:5}),{...long,sl:98,tp1:105});
 const short={side:'SHORT',entry:100,sl:105,tp1:90};
 assert.deepEqual(applyAutomationExits(short,{...settings,stopLossPercent:2,takeProfitPercent:5}),{...short,sl:102,tp1:95});
 assert.throws(()=>applyAutomationExits({...long,sl:null},settings));
});
test('daily count fails closed and loss actions never resume trading',()=>{
 assert.equal(checkDailyTradeLimit(settings,3).allowed,false);
 assert.equal(checkDailyTradeLimit(settings,NaN).allowed,false);
 assert.equal(checkDailyTradeLimit(settings,2).allowed,true);
 for(const lossAction of ['disable','reduce-margin','reduce-leverage']){
  const result=planDailyLossAction({...settings,lossAction,reductionPercent:50});
  assert.equal(result.enabled,false);assert.equal(result.paused,true);assert.equal(result.requiresExplicitReactivation,true);
  assert.equal(result.nextSettings.loss,10);
  if(lossAction==='reduce-margin')assert.equal(result.nextSettings.margin,10);
  if(lossAction==='reduce-leverage')assert.equal(result.nextSettings.leverage,2);
 }
});
test('percentage exits preserve exact micro-dollar precision and round toward entry for both directions',()=>{
 for(const side of ['LONG','SHORT'])for(const entry of [83257.7,104.776242,0.123456,100.000001]){
  const result=applyAutomationExits({side,entry,sl:1,tp1:2},{...settings,stopLossPercent:1.23,takeProfitPercent:2.34});
  const e=BigInt(exactUsdUnits(entry)),sl=BigInt(exactUsdUnits(result.sl)),tp=BigInt(exactUsdUnits(result.tp1)),d=100000000n;
  assert.ok(side==='LONG'?sl<e&&tp>e:sl>e&&tp<e);
  const distanceSl=sl>e?sl-e:e-sl,distanceTp=tp>e?tp-e:e-tp;
  assert.ok(distanceSl*d<=e*1230000n);assert.ok(distanceTp*d<=e*2340000n);
  assert.ok(e*1230000n-distanceSl*d<d);assert.ok(e*2340000n-distanceTp*d<d);
 }
});
test('unrepresentable percentages, collapsed triggers and nonpositive short targets are rejected',()=>{
 const signal={side:'LONG',entry:0.000001,sl:0.000001,tp1:0.000002};
 assert.throws(()=>applyAutomationExits(signal,{...settings,stopLossPercent:.01}));
 assert.throws(()=>applyAutomationExits({...signal,entry:100},{...settings,stopLossPercent:.0000001}));
 assert.throws(()=>applyAutomationExits({side:'SHORT',entry:100,sl:105,tp1:90},{...settings,takeProfitPercent:100}));
});
