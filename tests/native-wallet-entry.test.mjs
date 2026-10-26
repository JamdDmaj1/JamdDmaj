import test from 'node:test';
import assert from 'node:assert/strict';
import {setupNativeWalletEntry,setupMainWalletEntry} from '../native-wallet-entry.js';
import {currentWalletPortfolio,selectWalletAccount,selectedWalletAccount} from '../lib/wallet-portfolio-store.js';
function fixture(native){const nodes=[];const host={prepend(n){this.child=n}};const doc={getElementById:()=>host,createElement(tag){const n={tag,append(){},setAttribute(){},remove(){this.removed=true}};nodes.push(n);return n}};const win={Capacitor:{isNativePlatform:()=>native,getPlatform:()=>native?'android':'web',isPluginAvailable:()=>native}};return{doc,win,nodes};}
for(const language of ['es','en'])test(`native wallet entry is explicit and sends no arguments (${language})`,async()=>{const f=fixture(true);let calls=[];const dispose=setupNativeWalletEntry(language,f.doc,f.win,()=>({open:async(...args)=>calls.push(args)}));assert.equal(calls.length,0);await f.nodes.find(n=>n.tag==='button').onclick();assert.deepEqual(calls,[[]]);dispose();});
test('web has no fake wallet or launcher',async()=>{const f=fixture(false);let calls=0;setupNativeWalletEntry('es',f.doc,f.win,()=>{calls++;});const button=f.nodes.find(n=>n.tag==='button');assert.equal(button.hidden,true);await button.onclick();assert.equal(calls,0);});
test('failed launch releases control and reports failure',async()=>{const f=fixture(true);setupNativeWalletEntry('es',f.doc,f.win,()=>({open:async()=>{throw Error('unavailable')}}));const button=f.nodes.find(n=>n.tag==='button');await button.onclick();assert.equal(button.disabled,false);assert.ok(f.nodes.some(n=>n.textContent?.includes('No se pudo abrir')));});
for(const language of ['es','en'])test(`main wallet only opens native screen on explicit click (${language})`,async()=>{const f=fixture(true);let calls=[];const dispose=setupMainWalletEntry(language,f.doc,f.win,()=>({open:async(...args)=>calls.push(args)}));assert.equal(calls.length,0);await f.nodes.find(n=>n.tag==='button').onclick();assert.deepEqual(calls,[[]]);dispose();});
test('main wallet is unavailable on web without inventing funds',async()=>{const f=fixture(false);let calls=0;setupMainWalletEntry('es',f.doc,f.win,()=>{calls++});const button=f.nodes.find(n=>n.tag==='button');assert.equal(button.hidden,true);await button.onclick();assert.equal(calls,0);});
test('native public account populates the shared balance without opening or unlocking a vault',async t=>{
 const f=fixture(true),address='7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy';let opened=0,reads=0;
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://www.jamddmaj.com/api/solana-portfolio?address='+address);return {ok:true,json:async()=>({ok:true,address,network:'solana:mainnet',updatedAt:new Date().toISOString(),partial:false,tokens:[{symbol:'USDC',amount:5}]})};});
 const dispose=setupMainWalletEntry('es',f.doc,f.win,()=>({open:async()=>opened++,getPublicAccount:async()=>{reads++;return {available:true,address,name:'JamdDmaj'};}}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(reads,1);assert.equal(opened,0);assert.equal(currentWalletPortfolio(f.doc).tokens[0].amount,5);dispose();
});

test('choosing native trading wallet explicitly replaces external display using native public identity only',async t=>{
 const f=fixture(true),address='7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy';let reads=0;
 selectWalletAccount(f.doc,{address,source:'external',name:'Phantom'});
 t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,address,network:'solana:mainnet',updatedAt:new Date().toISOString(),partial:false,tokens:[]}));
 const dispose=setupMainWalletEntry('en',f.doc,f.win,()=>({getPublicAccount:async()=>{reads++;return {available:true,address};}}));
 assert.equal(reads,0);assert.equal(selectedWalletAccount(f.doc).source,'external');
 await f.nodes.find(n=>n.textContent==='Use my wallet in Trade and Futures').onclick();
 assert.equal(reads,1);assert.equal(selectedWalletAccount(f.doc).source,'native');
 assert.equal(currentWalletPortfolio(f.doc).address,address);dispose();
});

test('native background refresh cannot replace a selected public watch account',async()=>{
 const f=fixture(true),address='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';let reads=0;
 selectWalletAccount(f.doc,{address,source:'watch',name:'Solo consulta'});
 const dispose=setupMainWalletEntry('es',f.doc,f.win,()=>({getPublicAccount:async()=>{reads++;return {available:true,address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy'};}}));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,0);assert.equal(selectedWalletAccount(f.doc).address,address);dispose();
});
