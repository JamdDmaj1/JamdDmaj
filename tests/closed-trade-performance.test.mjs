import test from 'node:test';
import assert from 'node:assert/strict';
import {closedTradePerformance,performanceFromTotals,validClosedTradePerformance,formatTradeUnits,formatTradePercent} from '../lib/closed-trade-performance.js';
import {tradeShareModel,drawTradeShareCard} from '../lib/trade-share-card.js';
const snapshot=()=>({close:{state:'COMPLETED',wallet:'wallet',position:'position',settlement:JSON.stringify({version:2,sizeUsdUnits:'30000000'})},entries:[{reservation:'entry',signal:'manual:entry',state:'CLOSED',wallet:'wallet',position_address:'position',margin:10000000,platform_fee_units:20000,entry_exit_plan:JSON.stringify({sizeUsdUnits:'30000000',exits:[]})}]});
test('realized USDC result subtracts contributed capital and opening fee, never calls proceeds profit',()=>{
 const p=closedTradePerformance(snapshot(),'9980434');assert.equal(p.basisUsdcUnits,'10000000');assert.equal(p.resultUsdcUnits,'-39566');assert.equal(p.returnBps,'-40');assert.equal(p.excludesSolNetworkCosts,true);
 assert.equal(performanceFromTotals('10000000','20000','11020000').returnBps,'1000');assert.equal(performanceFromTotals('10000000','20000','10020000').returnBps,'0');
 assert.equal(validClosedTradePerformance(p,'9980434','COMPLETED'),true);assert.equal(validClosedTradePerformance({...p,resultUsdcUnits:'9980434'},'9980434','COMPLETED'),false);
 assert.equal(validClosedTradePerformance(p,'9980434','CLOSED_PENDING_ACCOUNTING'),false);assert.equal(validClosedTradePerformance({...p,returnBps:'40'},'9980434','COMPLETED'),false);
});
test('incomplete generation, partial/unmatched size, duplicate or unsafe basis yields unavailable, not zero',()=>{
 for(const mutate of [s=>s.close.state='PREPARED',s=>s.entries=[],s=>s.entries.push({...s.entries[0]}),s=>s.entries[0].margin=Number.MAX_SAFE_INTEGER+1,s=>s.entries[0].signal='external',s=>s.entries[0].state='OPEN',s=>s.entries[0].position_address='other',s=>s.entries[0].entry_exit_plan=JSON.stringify({sizeUsdUnits:'29000000'}),s=>s.entries[0].platform_fee_units=-1]){const s=snapshot();mutate(s);assert.equal(closedTradePerformance(s,'9980434'),null);}
 assert.equal(closedTradePerformance(snapshot(),null),null);assert.equal(performanceFromTotals('18446744073709551615','1','0'),null);
 const s=snapshot();s.entries[0].entry_exit_plan=JSON.stringify({sizeUsdUnits:'15000000'});s.entries[0].margin=5000000;s.entries.push({...s.entries[0],reservation:'second',signal:'manual:second'});assert.equal(closedTradePerformance(s,'10040000').resultUsdcUnits,'0');
});
test('formatting keeps exact units, signed percentages and rounding without floating point',()=>{
 assert.equal(formatTradePercent('-40'),'-0,40%');assert.equal(formatTradeUnits('-39566',{signedValue:true}),'-0,04');assert.equal(formatTradeUnits('1',{digits:6,signedValue:true}),'+0,000001');
 assert.equal(formatTradeUnits('18446744073709551615',{digits:6,language:'en'}),'18446744073709.551615');assert.equal(formatTradePercent('1234','en'),'+12.34%');
});
const item=()=>({asset:'BTC',side:'SHORT',closedAt:1700000000000,state:'COMPLETED',walletAddress:'PRIVATE_WALLET',positionAddress:'PRIVATE_POSITION',firstLegSignature:'PRIVATE_SIGNATURE',receivedUsdcUnits:'11020000',performance:performanceFromTotals('10000000','20000','11020000')});
test('share image model is an explicit privacy allowlist; amount and margin are hidden by default',()=>{
 const m=tradeShareModel(item());assert.deepEqual(m.numeric,[{kind:'percentage',text:'+10,00%'}]);assert.equal(m.margin,null);assert.equal(m.date,null);assert.equal(m.tone,'positive');
 const serialized=JSON.stringify(m);for(const privateValue of ['PRIVATE_WALLET','PRIVATE_POSITION','PRIVATE_SIGNATURE','11020000','10,00 USDC','1,00 USDC'])assert.equal(serialized.includes(privateValue),false);
 const custom=tradeShareModel(item(),{percentage:false,amount:true,margin:true,date:true,shape:'square',theme:'light'});assert.deepEqual(custom.numeric,[{kind:'amount',text:'+1,00 USDC'}]);assert.equal(custom.width,1080);assert.equal(custom.height,1080);assert.ok(custom.margin.includes('10,00 USDC'));
 const hidden=tradeShareModel(item(),{percentage:false,amount:false});assert.equal(hidden.numeric.length,0);assert.equal(hidden.tone,'neutral');
 const absent=tradeShareModel({...item(),performance:null},{amount:true,percentage:true,margin:true});assert.equal(absent.numeric.length,0);assert.equal(absent.margin,null);
});
test('canvas renderer draws only chosen share fields, no raw wallet/balance/receipt data',()=>{
 const texts=[],ctx={createLinearGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},arc(){},fill(){},moveTo(){},arcTo(){},closePath(){},stroke(){},measureText:s=>({width:s.length*10}),fillText:s=>texts.push(s)},canvas={getContext:()=>ctx};
 drawTradeShareCard(canvas,item(),{percentage:true,amount:false});assert.equal(canvas.width,1200);assert.equal(canvas.height,675);assert.ok(texts.includes('+10,00%'));assert.equal(texts.some(s=>s.includes('PRIVATE_')||s.includes('1,00 USDC')),false);
});
