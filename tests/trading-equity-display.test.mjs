import test from 'node:test';
import assert from 'node:assert/strict';
import {tradingEquityDisplay,captureOpenTradeShare} from '../lib/trading-equity-display.js';
import {tradeShareModel} from '../lib/trade-share-card.js';
const now=1800000000000,p={address:'position',asset:'SOL',side:'SHORT',priceUsdUnits:'100000000',sizeUsdUnits:'50000000',collateralUsdUnits:'10000000'},q={priceUsdUnits:'99000000',observedAt:now};
const snapshot=positions=>({observedAt:now,availableUsdcUnits:'3000000',allocatedUsdUnits:positions.reduce((sum,p)=>sum+BigInt(p.collateralUsdUnits),0n).toString(),positions});
test('equity adds wallet cash, observed collateral and unrealized PnL once, never changes sizing funds',()=>{
 const raw=snapshot([p]),before=JSON.stringify(raw),r=tradingEquityDisplay(raw,new Map([['SOL',q]]),{now});assert.equal(r.equityUsdUnits,'13500000');assert.equal(r.unrealizedPnlUsdUnits,'500000');assert.equal(r.walletUsdcUnits,'3000000');assert.equal(r.notAvailableToTrade,true);assert.equal(r.usdcUsdAssumption,'1');assert.equal(r.excludesFeesAndFunding,true);assert.equal(JSON.stringify(raw),before);
 assert.equal(tradingEquityDisplay(snapshot([{...p,side:'LONG'}]),{SOL:q},{now}).equityUsdUnits,'12500000');
 assert.equal(tradingEquityDisplay(snapshot([]),null,{now}).equityUsdUnits,'3000000');
});
test('missing/stale prices never produce a partial total or pretend zero PnL',()=>{
 for(const quote of [undefined,{...q,observedAt:now-15001},{...q,observedAt:now+2001},{...q,priceUsdUnits:'0'}]){const r=tradingEquityDisplay(snapshot([p]),{SOL:quote},{now});assert.equal(r.equityUsdUnits,null);assert.equal(r.unrealizedPnlUsdUnits,null);assert.equal(r.collateralUsdUnits,'10000000');}
 const r=tradingEquityDisplay(snapshot([p,{...p,address:'btc',asset:'BTC'}]),{SOL:q},{now});assert.equal(r.pricedPositions,1);assert.equal(r.equityUsdUnits,null);
 for(const patch of [{observedAt:now-30001},{allocatedUsdUnits:'1'},{availableUsdcUnits:'NaN'},{observedAt:now+2001}])assert.equal(tradingEquityDisplay({...snapshot([p]),...patch},{SOL:q},{now}),null);
 assert.equal(tradingEquityDisplay(snapshot([p,p]),{SOL:q},{now}),null);
});
test('open share is a fixed price-PnL snapshot, clearly unrealized USD, not closed-trade USDC',()=>{
 const captured=captureOpenTradeShare({...p,wallet:'PRIVATE_WALLET'},q,now,{now});assert.ok(captured);assert.equal(JSON.stringify(captured).includes('PRIVATE_WALLET'),false);assert.equal(JSON.stringify(captured).includes('"address":'),false);
 const m=tradeShareModel(captured,{amount:true,margin:true},'es');assert.equal(m.open,true);assert.equal(m.pair,'SOL / USD');assert.equal(m.numeric[0].text,'+5,00%');assert.equal(m.numeric[1].text,'+0,50 USD');assert.match(m.title,/ABIERTA.*NO REALIZADO/);assert.match(m.disclosure,/Captura.*no realizado/);assert.match(m.exclusion,/comisiones.*financiación/);assert.match(m.margin,/observado/);
 const hidden=tradeShareModel(captured,{},'es');assert.deepEqual(hidden.numeric,[{kind:'percentage',text:'+5,00%'}]);assert.equal(hidden.margin,null);assert.equal(hidden.date,null);
 assert.equal(captureOpenTradeShare(p,{...q,observedAt:now-15001},now,{now}),null);assert.equal(captureOpenTradeShare(p,q,now-30001,{now}),null);
 const forged=tradeShareModel({...captured,quote:{...q,observedAt:now+5000}},{amount:true});assert.equal(forged.numeric.length,0);
});
