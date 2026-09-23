import test from 'node:test';
import assert from 'node:assert/strict';
import {setupAssetsWallets} from '../assets-wallet-ui.js';
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
test('Assets connects and reads zero only after explicit clicks; disconnect clears it',async()=>{
 const f=fixture(),address='0x'+'3'.repeat(40),calls=[];
 f.win.ethereum={on(){},removeListener(){},async request({method}){calls.push(method);return method==='eth_chainId'?'0x38':method==='eth_getBalance'?'0x0':[address]}};
 const dispose=setupAssetsWallets('es',f.doc,f.win),find=text=>f.all.find(n=>n.tag==='button'&&n.textContent===text);
 await find('Conectar billetera').onclick();assert.ok(f.all.some(n=>n.textContent?.includes(address)));assert.equal(calls.includes('eth_getBalance'),false);
 await find('Consultar saldo nativo').onclick();assert.ok(f.all.some(n=>n.textContent==='0 BNB'));
 find('Desconectar de esta vista').onclick();assert.ok(!f.all.some(n=>n.textContent==='0 BNB'));dispose();
});
