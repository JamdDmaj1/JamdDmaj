import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLiveDepth,setupFinanceDepth} from '../lib/finance-depth.js';
const snapshot=(seq=1)=>({action:'snapshot',arg:{instType:'USDT-FUTURES',channel:'books15',instId:'BTCUSDT'},data:[{seq,ts:Date.now(),asks:[['101','2']],bids:[['100','3']]}]});
test('live depth validates freshness, pair, sequence and prices',()=>{
 assert.equal(parseLiveDepth(snapshot(),'ETHUSDT'),null);
 assert.equal(parseLiveDepth(snapshot(),'BTCUSDT',1),null);
 assert.equal(parseLiveDepth(snapshot(),'BTCUSDT').asks[0].price,101);
 const stale=snapshot();stale.data[0].ts-=16000;assert.throws(()=>parseLiveDepth(stale,'BTCUSDT'));
 const crossed=snapshot();crossed.data[0].bids=[['102','1']];assert.throws(()=>parseLiveDepth(crossed,'BTCUSDT'));
 const invalid=snapshot();invalid.data[0].asks=[['NaN','1']];assert.throws(()=>parseLiveDepth(invalid,'BTCUSDT'));
});
test('public socket subscribes, updates existing rows, retires callbacks and closes offscreen',()=>{
 const node=()=>({children:[],style:{setProperty(){}},setAttribute(){},append(...n){this.children.push(...n);},replaceChildren(){this.children=[];}});
 const doc={createElement:node,hidden:false,addEventListener(){},removeEventListener(){}};
 const sockets=[];class Socket{constructor(url){this.url=url;sockets.push(this);}send(data){this.sent=data;}close(){this.closed=true;}}
 const parent=node(),controller=setupFinanceDepth(parent,'es',doc,()=>{throw Error('No REST polling');},Socket);
 controller.select('BTCUSDT');const first=sockets[0];first.onopen();assert.equal(JSON.parse(first.sent).args[0].channel,'books15');assert.ok(!first.sent.includes('login'));
 first.onmessage({data:JSON.stringify(snapshot())});assert.match(parent.children[1].textContent,/En vivo/);
 const row=parent.children[2].children[1];assert.equal(row.textContent,'101 / 2');
 first.onmessage({data:JSON.stringify(snapshot(2))});assert.equal(parent.children[2].children[1],row);
 const multi=snapshot(3);multi.data[0].asks=[['101','2'],['102','4'],['103','1']];
 first.onmessage({data:JSON.stringify(multi)});
 assert.equal(row.textContent,'103 / 1');
 assert.equal(parent.children[2].children[3].textContent,'101 / 2');
 const retired=first.onmessage;controller.select('ETHUSDT');assert.equal(first.closed,true);retired({data:JSON.stringify(snapshot(3))});assert.equal(row.textContent,'');
 controller.setActive(false);assert.equal(sockets[1].closed,true);controller.dispose();
});
