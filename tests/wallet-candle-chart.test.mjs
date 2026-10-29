import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletCandleChart} from '../lib/wallet-candle-chart.js';
test('historical chart supports zoom, inspection, pan, pinch, reset and keyboard',()=>{
 const make=tag=>({tag,style:{},attrs:{},children:[],events:{},setAttribute(k,v){this.attrs[k]=v;},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},addEventListener(k,v){this.events[k]=v;},getBoundingClientRect(){return{left:0,width:800};},setPointerCapture(){}});
 const doc={createElement:make,createElementNS:(_,tag)=>make(tag)};
 const candles=Array.from({length:100},(_,i)=>({time:1700000000+i*3600,open:100+i,high:102+i,low:99+i,close:101+i}));
 const root=createWalletCandleChart(candles,'en',doc),[tools,readout,svg]=root.children;
 const bars=()=>svg.children.filter(n=>n.tag==='rect').length;
 assert.equal(bars(),60);tools.children[1].onclick();assert.ok(bars()<60);
 const old=readout.textContent;svg.events.pointermove({pointerId:1,pointerType:'mouse',clientX:20});assert.notEqual(readout.textContent,old);
 svg.events.keydown({key:'ArrowLeft',preventDefault(){}});
 svg.events.pointerdown({pointerId:1,clientX:300,clientY:50});svg.events.pointermove({pointerId:1,clientX:500,clientY:51});svg.events.pointerup({pointerId:1});
 svg.events.pointerdown({pointerId:1,clientX:200,clientY:50});svg.events.pointerdown({pointerId:2,clientX:400,clientY:50});const before=bars();svg.events.pointermove({pointerId:2,clientX:600,clientY:50});assert.ok(bars()<before);svg.events.pointercancel({pointerId:1});svg.events.pointerup({pointerId:2});
 tools.children[2].onclick();assert.equal(bars(),60);assert.match(readout.textContent,/USD/);
 svg.events.wheel({deltaY:1,clientX:200,preventDefault(){}});assert.ok(bars()>60);
 svg.events.dblclick();assert.equal(bars(),60);
 assert.equal(svg.style.cssText.includes('touch-action:pan-y'),true);
});
