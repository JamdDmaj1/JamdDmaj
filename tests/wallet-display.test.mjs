import test from 'node:test';
import assert from 'node:assert/strict';
import {walletDisplayBalance,bindWalletDisplay} from '../lib/wallet-display.js';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
function snapshot(){return {ok:true,network:'solana:mainnet',partial:false,updatedAt:new Date().toISOString(),estimatedValueUsd:50,tokens:[{mint,amount:.0011},{mint:'fake-USDC',symbol:'USDC',amount:10000}]};}
test('display counts canonical USDC only, not other assets or symbols',()=>{
 assert.deepEqual(walletDisplayBalance(snapshot()),{usdc:.0011,estimatedUsd:50});
 assert.equal(walletDisplayBalance({...snapshot(),tokens:[]}).usdc,0);
 for(const extra of [{partial:true},{network:'solana:devnet'},{updatedAt:'invalid'},{updatedAt:new Date(Date.now()-121000).toISOString()},{tokens:[{mint,amount:-1}]}])assert.equal(walletDisplayBalance({...snapshot(),...extra}),null);
});
test('missing USD prices do not hide a complete verified USDC inventory',()=>{
 assert.equal(walletDisplayBalance({...snapshot(),partial:true,balancesComplete:true}).usdc,.0011);
 assert.equal(walletDisplayBalance({...snapshot(),partial:true,balancesComplete:false}),null);
});
test('wallet display enables percent sizing only for fresh balances and clears on disconnect',()=>{
 let listener;const doc={addEventListener:(name,fn)=>{listener=fn;},defaultView:{addEventListener(){}}};
 const out={},slider={},amount={dispatchEvent(){}};bindWalletDisplay(doc,'en',out,slider,amount);
 assert.equal(slider.disabled,true);listener({detail:snapshot()});assert.equal(slider.disabled,false);
 slider.value='50';slider.oninput();assert.equal(amount.value,'0.000550');
 listener({detail:null});assert.equal(slider.disabled,true);assert.match(out.textContent,/refresh in Assets/);
});
test('payment-token changes cannot size SOL using USDC or overwrite an edited amount',()=>{
 let listener,eligible=true;const doc={addEventListener:(_name,fn)=>{listener=fn;},defaultView:{addEventListener(){}}};
 const output={},slider={},amount={value:'12',dispatchEvent(){}};
 bindWalletDisplay(doc,'en',output,slider,amount,()=>eligible);
 listener({detail:snapshot()});assert.equal(amount.value,'12');
 eligible=false;slider.value='100';slider.oninput();assert.equal(amount.value,'12');
 listener({detail:snapshot()});assert.equal(slider.disabled,true);assert.equal(amount.value,'12');
});
