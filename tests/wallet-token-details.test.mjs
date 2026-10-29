import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTokenMarket,createWalletTokenDetails} from '../lib/wallet-token-details.js';
const mint='So11111111111111111111111111111111111111112';
test('market identity uses exact Solana mint, never symbol or quote currency',()=>{
 const pair={chainId:'solana',baseToken:{address:mint},pairAddress:mint,liquidity:{usd:5}};
 assert.equal(selectTokenMarket([{...pair,chainId:'ethereum'},{...pair,baseToken:{address:'other'}},pair],mint),pair);
 assert.equal(selectTokenMarket([{...pair,pairAddress:'../../evil'}],mint),null);
 assert.equal(selectTokenMarket(null,mint),null);
});
test('opening exposes and focuses the panel immediately, including native API and failures',async()=>{
 const nodes=[],doc={createElement:tag=>{
  const n={tag,hidden:false,style:{},attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}};nodes.push(n);return n;
 }};
 let requested='';const win={location:{hostname:'localhost'},fetch:async url=>{requested=url;throw Error('network');}};
 const panel=createWalletTokenDetails('en',doc,win),trigger={isConnected:true,focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}};
 await panel.open({mint,symbol:'SOL'},trigger);
 assert.equal(panel.element.hidden,false);assert.equal(panel.element.focused,true);assert.equal(panel.element.scrolled,true);
 assert.equal(requested,'https://www.jamddmaj.com/api/wallet-token-research?mint='+mint);
 assert.equal(panel.element.attrs['aria-busy'],'false');assert.ok(nodes.some(n=>n.textContent==='Market lookup failed. Your balance has not changed.'));
 nodes.find(n=>n.tag==='button').onclick();assert.equal(panel.element.hidden,true);assert.equal(trigger.focused,true);assert.equal(trigger.scrolled,true);
});
