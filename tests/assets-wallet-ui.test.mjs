import test from 'node:test';
import assert from 'node:assert/strict';
import {setupAssetsWallets} from '../assets-wallet-ui.js';

test('Solana holdings are rendered from the selected account and cleared on disconnect',async()=>{
 const key=Symbol.for('jamddmaj.wallet-standard.registry'),oldRegistry=globalThis[key],oldFetch=globalThis.fetch;
 const address='11111111111111111111111111111111';
 const wallet={name:'Phantom',chains:['solana:mainnet'],features:{'standard:connect':{async connect(){return {accounts:[{address,chains:['solana:mainnet']}]}}},'standard:events':{on(){return ()=>{}}}}};
 Object.defineProperty(globalThis,key,{configurable:true,value:{get:()=>[wallet],on:()=>()=>{}}});
 globalThis.fetch=async()=>({ok:true,json:async()=>({ok:true,address,network:'solana:mainnet',updatedAt:new Date().toISOString(),sol:{amount:.25},tokens:[{mint:address,symbol:'TEST',amount:12.345}],partial:true})});
 let dispose;
 try{
   const f=fixture();dispose=setupAssetsWallets('es',f.doc,f.win);const button=text=>f.all.find(n=>n.tag==='button'&&n.textContent===text);
   await button('Conectar billetera').onclick();await button('Consultar saldo nativo').onclick();
   assert.ok(f.all.some(n=>n.textContent==='0.25 SOL'));
   const holdings=f.all.find(n=>n.className==='wallet-holdings');assert.equal(holdings.children[0].children[0].textContent,'TEST');
   assert.ok(holdings.children.at(-1).textContent.includes('parcial'));
   button('Desconectar de esta vista').onclick();assert.equal(holdings.children.length,0);
 }finally{dispose?.();globalThis.fetch=oldFetch;Object.defineProperty(globalThis,key,{configurable:true,value:oldRegistry});}
});
function fixture(){
 const all=[];
 function node(tag){const n={tag,style:{},attrs:{},children:[],value:'',append(...items){this.children.push(...items)},prepend(item){this.children.unshift(item)},replaceChildren(...items){this.children=items},setAttribute(k,v){this.attrs[k]=v},remove(){this.removed=true}};all.push(n);return n}
 const host=node('section'),doc={createElement:node,getElementById:()=>host};
 const win=new EventTarget();return {all,host,doc,win};
}
for(const lang of ['es','en'])test(`Assets has no automatic connections or invented balance (${lang})`,()=>{
 const f=fixture();let calls=0;f.win.ethereum={request(){calls++},on(){},removeListener(){}};
 const dispose=setupAssetsWallets(lang,f.doc,f.win);assert.equal(calls,0);
 assert.ok(f.all.some(n=>n.id==='external-wallet-assets'));assert.ok(f.all.some(n=>n.tag==='option'&&n.textContent.includes('Ethereum / BNB')));
 assert.ok(!f.all.some(n=>n.textContent==='0 BNB'));dispose();assert.equal(calls,0);
});
test('Assets refreshes after approved connection; disconnect clears the balance',async()=>{
 const f=fixture(),address='0x'+'3'.repeat(40),calls=[];
 f.win.ethereum={on(){},removeListener(){},async request({method}){calls.push(method);return method==='eth_chainId'?'0x38':method==='eth_getBalance'?'0x0':[address]}};
 const dispose=setupAssetsWallets('es',f.doc,f.win),find=text=>f.all.find(n=>n.tag==='button'&&n.textContent===text);
 await find('Conectar billetera').onclick();assert.ok(f.all.some(n=>n.textContent?.includes(address)));assert.equal(calls.includes('eth_getBalance'),true);
 await find('Consultar saldo nativo').onclick();assert.ok(f.all.some(n=>n.textContent==='0 BNB'));
 find('Desconectar de esta vista').onclick();assert.ok(!f.all.some(n=>n.textContent==='0 BNB'));dispose();
});
