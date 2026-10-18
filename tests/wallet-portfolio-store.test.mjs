import test from 'node:test';
import assert from 'node:assert/strict';
import {selectWalletAccount,publishWalletPortfolio,currentWalletPortfolio,selectedWalletAccount,walletAccounts,forgetWalletAccount} from '../lib/wallet-portfolio-store.js';
const native={address:'7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy',source:'native',name:'JamdDmaj'};
const external={address:'4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr',source:'external',name:'Phantom'};
const snapshot=account=>({ok:true,address:account.address,network:'solana:mainnet',updatedAt:new Date().toISOString(),tokens:[{symbol:'USDC',amount:5}],sol:{amount:0.18}});
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
