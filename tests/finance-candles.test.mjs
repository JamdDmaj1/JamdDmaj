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
test('wheel, drag, pinch and keyboard operate directly on the chart',()=>{
 const node=()=>({children:[],attrs:{},handlers:{},style:{},append(...c){this.children.push(...c);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.handlers[k]=f;},getBoundingClientRect(){return {left:0,top:0,width:720,height:360};},setPointerCapture(){}});
 const parent=node(),doc={createElement:node,createElementNS:node};
 const rows=Array.from({length:120},(_,i)=>({time:1000+i*1000,open:10+i,high:12+i,low:9+i,close:11+i,volume:1}));
 setupCandleChart(parent,rows,'es',doc);const svg=parent.children.find(n=>n.attrs['aria-label']==='Velas OHLC y volumen');const bars=()=>svg.children.filter(n=>n.attrs.role==='img').length;
 assert.equal(bars(),60);let prevented=false;svg.handlers.wheel({clientX:320,clientY:100,deltaY:-100,preventDefault(){prevented=true;}});assert.ok(prevented);assert.ok(bars()<60);
 const first=()=>svg.children.find(n=>n.attrs.role==='img').attrs['aria-label'];const before=first();
 svg.handlers.pointerdown({pointerId:1,clientX:100,clientY:100,button:0});svg.handlers.pointermove({pointerId:1,clientX:300,clientY:100});svg.handlers.pointerup({pointerId:1});assert.notEqual(first(),before);
 const old=bars();svg.handlers.pointerdown({pointerId:1,clientX:100,clientY:100});svg.handlers.pointerdown({pointerId:2,clientX:300,clientY:100});svg.handlers.pointermove({pointerId:2,clientX:500,clientY:100});assert.ok(bars()<old);svg.handlers.pointerup({pointerId:1});svg.handlers.pointerup({pointerId:2});
 svg.handlers.keydown({key:'Home',preventDefault(){}});assert.equal(bars(),60);assert.equal(svg.style.touchAction,'none');
});
