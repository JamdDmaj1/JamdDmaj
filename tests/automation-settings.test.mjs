import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAutomationExits,planDailyLossAction,checkDailyTradeLimit} from '../lib/automation-settings.js';
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
