import test from 'node:test';
import assert from 'node:assert/strict';
import {perpsNavigationDraft} from '../lib/perps-navigation.js';
import {setupMainWalletEntry} from '../native-wallet-entry.js';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {setupFuturesTicket} from '../lib/swap-quote-ui.js';

const draft={asset:'SOL',side:'LONG',margin:'10.123456',leverage:'2.5',referencePrice:'105',stopLoss:'95',takeProfit:'110'};
test('perps navigation carries only exact human form values, never execution authority',()=>{
 assert.deepEqual(perpsNavigationDraft(draft),draft);assert.equal(Object.isFrozen(perpsNavigationDraft(draft)),true);
 assert.deepEqual(perpsNavigationDraft({...draft,stopLoss:'',takeProfit:null}),{asset:'SOL',side:'LONG',margin:'10.123456',leverage:'2.5',referencePrice:'105'});
 for(const change of [{asset:'ZEC'},{side:'BUY'},{margin:'9.999999'},{margin:'1e2'},{margin:10},{margin:'10.0000001'},{leverage:'50.1'},{referencePrice:'0'},{stopLoss:'106'},{takeProfit:'104'},{serializedTxBase64:'wire'},{signature:'approval'},{walletAddress:'another-wallet'}])assert.throws(()=>perpsNavigationDraft({...draft,...change}));
 assert.equal(perpsNavigationDraft({...draft,side:'SHORT',stopLoss:'110',takeProfit:'95'}).side,'SHORT');
});
test('native navigation requires explicit event and selected native wallet and disposes its listener',async()=>{
 const listeners=new Map(),calls=[];const host={prepend(){}};
 const doc={getElementById:()=>host,createElement:()=>({append(){},setAttribute(){},remove(){}}),
  addEventListener:(type,listener)=>listeners.set(type,listener),removeEventListener:(type)=>listeners.delete(type)};
 const win={Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',isPluginAvailable:()=>true}};
 const dispose=setupMainWalletEntry('es',doc,win,()=>({openPerps:async value=>calls.push(value)}));
 assert.equal(calls.length,0);const open=listeners.get('jamd-wallet-open-perps');
 await open({detail:draft});assert.equal(calls.length,0);
 selectWalletAccount(doc,{address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',source:'native',name:'Fixture'});
 await open({detail:draft});assert.deepEqual(calls,[draft]);
 await open({detail:{...draft,serializedTxBase64:'wire'}});assert.equal(calls.length,1);
 selectWalletAccount(doc,{address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',source:'external',name:'Phantom'});
 await open({detail:draft});assert.equal(calls.length,1);
 dispose();assert.equal(listeners.has('jamd-wallet-open-perps'),false);
});
test('Long and Short buttons open only a native review draft and clear prices when changing markets',()=>{
 const nodes=[],events=[];
 const doc={createElement(tag){const node={tag,children:[],value:'',append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},setAttribute(){},addEventListener(){}};nodes.push(node);return node;},
  addEventListener(){},dispatchEvent:event=>events.push(event),defaultView:{CustomEvent,Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',isPluginAvailable:()=>true}}};
 const ticket=setupFuturesTicket(doc.createElement('main'),'en',doc);
 selectWalletAccount(doc,{address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',source:'native',name:'Fixture'});
 const price=nodes.find(node=>node.id==='jupiter-reference-price');price.value='105';
 nodes.find(node=>node.textContent==='Open Long').onclick();
 let drafts=events.filter(event=>event.type==='jamd-wallet-open-perps');assert.equal(drafts.length,1);
 assert.deepEqual(drafts[0].detail,{asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'105'});
 ticket.selectAsset({symbol:'SOL'});assert.equal(price.value,'');price.value='105';
 nodes.find(node=>node.textContent==='Open Short').onclick();drafts=events.filter(event=>event.type==='jamd-wallet-open-perps');
 assert.equal(drafts.length,2);assert.equal(drafts[1].detail.asset,'SOL');assert.equal(drafts[1].detail.side,'SHORT');
 ticket.selectAsset({symbol:'ZEC'});assert.equal(nodes.find(node=>node.textContent==='Open Long').disabled,true);
});
