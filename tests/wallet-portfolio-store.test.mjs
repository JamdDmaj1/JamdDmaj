import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreWalletAccount,selectWalletAccount,publishWalletPortfolio,currentWalletPortfolio,selectedWalletAccount,walletAccounts,forgetWalletAccount} from '../lib/wallet-portfolio-store.js';
const native={address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',source:'native',name:'JamdDmaj'};
const external={address:'4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr',source:'external',name:'Phantom'};
const snapshot=account=>({ok:true,address:account.address,network:'solana:mainnet',updatedAt:new Date().toISOString(),tokens:[{symbol:'USDC',amount:5}],sol:{amount:0.18}});
test('reload restores preferred verified identity, never funds or signing; async defaults cannot replace it',()=>{
 const data=new Map(),localStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},doc=()=>({defaultView:{localStorage}}),watch={...native,source:'watch'};
 const first=doc();selectWalletAccount(first,watch);
 assert.deepEqual(JSON.parse([...data.values()][0]),{source:'watch',address:watch.address});
 const next=doc();restoreWalletAccount(next,external);assert.equal(selectedWalletAccount(next),null);
 restoreWalletAccount(next,watch);assert.equal(selectedWalletAccount(next).source,'watch');assert.equal(currentWalletPortfolio(next),null);
 restoreWalletAccount(next,external);assert.equal(selectedWalletAccount(next).source,'watch');
 selectWalletAccount(next,external);restoreWalletAccount(next,watch);assert.equal(selectedWalletAccount(next).source,'external');
 selectWalletAccount(next,watch);forgetWalletAccount(next,watch,{preservePreference:true});restoreWalletAccount(next,watch);assert.equal(selectedWalletAccount(next).source,'watch');selectWalletAccount(next,external);
 forgetWalletAccount(next,external,{preservePreference:true});const again=doc();restoreWalletAccount(again,external);assert.equal(selectedWalletAccount(again).source,'external');
 forgetWalletAccount(again,external);assert.equal(data.size,0);
});
test('unavailable browser storage does not prevent explicit wallet use',()=>{
 const doc={defaultView:{get localStorage(){throw Error('blocked');}}};restoreWalletAccount(doc,external);assert.equal(selectedWalletAccount(doc).address,external.address);selectWalletAccount(doc,native);assert.equal(selectedWalletAccount(doc).source,'native');
});
test('public balance is replayable by views mounted later and immutable',()=>{
 const doc={};selectWalletAccount(doc,native);const data=snapshot(native);
 assert.equal(publishWalletPortfolio(doc,data,native),true);
 data.tokens[0].amount=99;
 assert.equal(currentWalletPortfolio(doc).tokens[0].amount,5);
 assert.ok(Object.isFrozen(currentWalletPortfolio(doc).tokens[0]));
});
test('switching wallets clears old balance and rejects late responses',()=>{
 const doc={};selectWalletAccount(doc,native);publishWalletPortfolio(doc,snapshot(native),native);
 selectWalletAccount(doc,external);assert.equal(currentWalletPortfolio(doc),null);
 assert.equal(publishWalletPortfolio(doc,snapshot(native),native),false);
 assert.equal(publishWalletPortfolio(doc,snapshot(external),external),true);
 forgetWalletAccount(doc,external);assert.equal(selectedWalletAccount(doc),null);
 assert.deepEqual(walletAccounts(doc),[native]);
});
test('invalid or stale portfolio never becomes a spendable-looking balance',()=>{
 const doc={};selectWalletAccount(doc,native);
 for(const patch of [{updatedAt:'invalid'},{updatedAt:new Date(Date.now()-121000).toISOString()},{network:'solana:devnet'},{tokens:{}},{ok:false}]){
  assert.equal(publishWalletPortfolio(doc,{...snapshot(native),...patch},native),false);
  assert.equal(currentWalletPortfolio(doc),null);
 }
});
