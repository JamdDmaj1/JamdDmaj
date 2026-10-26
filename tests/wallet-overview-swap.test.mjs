import test from 'node:test';
import assert from 'node:assert/strict';
import {setupWalletOverview} from '../lib/wallet-overview.js';
import {selectWalletAccount,selectedWalletAccount} from '../lib/wallet-portfolio-store.js';
const native='7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',bot='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';
function fixture(){
 const doc=new EventTarget(),nodes=[];let tradeClicks=0,swapEvents=0;
 doc.defaultView={Event,CustomEvent};doc.getElementById=id=>id==='terminal-assets'?{prepend(){}}:id==='tab-trade'?{click(){tradeClicks++;}}:null;
 doc.createElement=tag=>{const n={tag,textContent:'',append(){},replaceChildren(){},setAttribute(){},remove(){}};nodes.push(n);return n;};
 doc.addEventListener('jamd-wallet-open-swap',()=>swapEvents++);
 const dispose=setupWalletOverview('es',doc,{Event});
 return {doc,nodes,dispose,counts:()=>({tradeClicks,swapEvents}),swap:()=>nodes.find(n=>n.tag==='button'&&n.textContent==='Swap').onclick()};
}
test('native swap opens the wallet action directly without navigating to Trade',t=>{
 const f=fixture();t.after(f.dispose);selectWalletAccount(f.doc,{address:native,source:'native',name:'JamdDmaj'});f.swap();
 assert.deepEqual(f.counts(),{tradeClicks:0,swapEvents:1});assert.equal(selectedWalletAccount(f.doc).address,native);
});
test('the publicly linked bot address never launches a different native wallet or navigates to Trade',t=>{
 const f=fixture();t.after(f.dispose);selectWalletAccount(f.doc,{address:bot,source:'watch',name:'Solo consulta'});f.swap();
 assert.deepEqual(f.counts(),{tradeClicks:0,swapEvents:0});assert.equal(selectedWalletAccount(f.doc).address,bot);
 assert(f.nodes.some(n=>n.textContent.includes('revisión y firma en el servidor')));
});
test('missing and external accounts cannot silently open a native swap',t=>{
 const f=fixture();t.after(f.dispose);f.swap();selectWalletAccount(f.doc,{address:native,source:'external',name:'Phantom'});f.swap();
 assert.deepEqual(f.counts(),{tradeClicks:0,swapEvents:0});
});
