import test from 'node:test';
import assert from 'node:assert/strict';
import {filterMarkets,chartPoints,setupFinanceMarkets} from '../lib/finance-markets.js';

test('markets uses the full catalog, searches and pages without inventing trade pairs',()=>{
  assert.ok(filterMarkets('').total>50);
  assert.equal(filterMarkets('').items.length,20);
  assert.notEqual(filterMarkets('',20).items[0].id,filterMarkets('').items[0].id);
  assert.ok(filterMarkets('solana').items.some(a=>a.symbol==='SOL'));
  assert.equal(filterMarkets('no-such-token-xyz').total,0);
});
test('chart ignores invalid points and handles flat prices',()=>{
  assert.equal(chartPoints([{time:1,close:NaN}]),'');
  assert.equal(chartPoints([{time:2,close:4},{time:1,close:4}]),'0.00,180.00 600.00,180.00');
});
test('market loads automatically and trade passes asset without sending a transaction',async()=>{
  const all=[];const createElement=tag=>{const n={tag,children:[],value:'',attrs:{},append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this[k]=v}};all.push(n);return n;};
  let selected,requested;
  const view=setupFinanceMarkets(createElement('main'),'es',{createElement},a=>selected=a,async url=>{requested=url;return Response.json({bitcoin:{usd:10}})});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.match(requested,/\/api\/token-prices\?ids=/);
  const trade=all.find(n=>n.tag==='button'&&n.textContent==='Trade');trade.onclick();
  assert.equal(selected.symbol,'BTC');
  assert.ok(all.some(n=>n.textContent==='No disponible'));
  view.dispose();
});
