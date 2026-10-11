import test from 'node:test';
import assert from 'node:assert/strict';
import {validCandles,setupCandleChart} from '../lib/finance-candles.js';
test('OHLC rejects impossible or nonfinite candles, sorts and deduplicates',()=>{
 const c={time:1,open:10,high:12,low:9,close:11,volume:3};
 assert.deepEqual(validCandles([c,{...c,time:2,high:8},{...c,time:3,open:NaN},c]),[c]);
});
test('candle controls render real bars and allow zoom and reset without requests',()=>{
 const all=[];const node=()=>{const n={children:[],attrs:{},append(...c){this.children.push(...c);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;}};all.push(n);return n;};
 const doc={createElement:node,createElementNS:node};const parent=node();
 const rows=Array.from({length:80},(_,i)=>({time:1000+i*1000,open:10,high:12,low:9,close:11,volume:i}));
 assert.equal(setupCandleChart(parent,rows,'es',doc),true);
 assert.ok(all.some(n=>n.attrs['aria-label']==='Velas OHLC y volumen'));
 all.find(n=>n.textContent==='+').onclick();all.find(n=>n.textContent==='Restablecer').onclick();
 assert.equal(setupCandleChart(parent,[],'es',doc),false);
});
