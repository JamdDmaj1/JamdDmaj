import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTokenMarket} from '../lib/wallet-token-details.js';
const mint='So11111111111111111111111111111111111111112';
test('market identity uses exact Solana mint, never symbol or quote currency',()=>{
 const pair={chainId:'solana',baseToken:{address:mint},pairAddress:mint,liquidity:{usd:5}};
 assert.equal(selectTokenMarket([{...pair,chainId:'ethereum'},{...pair,baseToken:{address:'other'}},pair],mint),pair);
 assert.equal(selectTokenMarket([{...pair,pairAddress:'../../evil'}],mint),null);
 assert.equal(selectTokenMarket(null,mint),null);
});
