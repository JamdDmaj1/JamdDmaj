import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAutomationDraft,validateAutomationSettings,setupAutomationPanel,telegramSignalCards} from '../lib/automation-panel.js';
test('Telegram cards exclude unpublished, closed, future, expired and malformed signals',()=>{
 const now=Date.parse('2026-10-13T12:00:00Z');
 const signal={id:'a',pair:'BTCUSDT',side:'LONG',status:'OPEN',entry:60000,sl:59000,tp1:62000,telegramMessageId:123,telegramSentAt:'2026-10-13T11:00:00Z'};
 const cards=telegramSignalCards([signal,{...signal,telegramMessageId:null},{...signal,status:'CLOSED'},{...signal,telegramSentAt:'2026-10-14T11:00:00Z'},{...signal,telegramSentAt:'2026-10-11T11:00:00Z'},{...signal,entry:NaN},{...signal,pair:'<script>'}],now);
 assert.equal(cards.length,1);assert.equal(cards[0].stop,59000);assert.equal(cards[0].take,62000);assert.equal(cards[0].telegramMessageId,undefined);
 assert.deepEqual(telegramSignalCards(null,now),[]);
});
test('automation draft validates limits and drops activation fields',()=>{
 assert.deepEqual(validateAutomationDraft({capital:100,loss:10,positions:2,enabled:true}),{capital:100,loss:10,positions:2});
 for(const v of [{capital:0,loss:1,positions:1},{capital:1,loss:2,positions:1},{capital:100,loss:1,positions:1.5},{capital:Infinity,loss:1,positions:1}])assert.throws(()=>validateAutomationDraft(v));
});
test('automation never activates from saved data and only persists limits',()=>{
 const all=[],writes=[];const node=()=>{const n={children:[],append(...v){this.children.push(...v);},setAttribute(){}};all.push(n);return n;};
 setupAutomationPanel(node(),'en',{createElement:node},{getItem:()=>JSON.stringify({capital:100,loss:10,positions:2,enabled:true}),setItem:(k,v)=>writes.push(JSON.parse(v))});
 assert.equal(writes.length,0);assert.equal(all.filter(n=>n.disabled).length,3);
 all.find(n=>n.id==='automation-margin').value=10;
 all.find(n=>n.textContent==='Save draft').onclick();assert.deepEqual(writes,[{capital:100,loss:10,positions:2,margin:10,leverage:3,dailyTrades:5,stopLossPercent:null,takeProfitPercent:null,lossAction:'disable',reductionPercent:50}]);
});
test('settings reject invalid sizing and reduction without persisting activation',()=>{
 const value={capital:100,loss:10,positions:2,margin:10,leverage:3,dailyTrades:5};
 assert.equal(validateAutomationSettings({...value,enabled:true}).enabled,undefined);
 for(const extra of [{margin:101},{leverage:0},{dailyTrades:1.5},{stopLossPercent:100},{reductionPercent:0}])assert.throws(()=>validateAutomationSettings({...value,...extra}));
});
