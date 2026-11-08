import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readPhoenixChainAccount,requireFreshPhoenixChainAccount} from '../lib/phoenix-chain-account.js';
import {phoenixChainAccountFixture,phoenixTraderBytes,phoenixRpcAccount,phoenixTestKey} from './helpers/phoenix-chain-account-fixture.mjs';
const read=f=>readPhoenixChainAccount({walletAddress:f.wallet,subaccountIndices:[1]},{request:f.request,now:f.now,monotonicNow:f.monotonicNow});

test('one bank reports exact native wallet cash, separate margin and signed isolated position',async()=>{
 const f=await phoenixChainAccountFixture(),a=await read(f);
 assert.equal(a.readyForSigning,false);assert.equal(a.usdc.amountUnits,'3000000');assert.equal(a.usdc.spendable,true);assert.equal(a.canonical.exists,false);
 assert.equal(a.subaccounts[1].quoteCollateralUnits,'10000000');assert.equal(a.subaccounts[1].positions[0].baseLots,'-240');
 assert.equal(a.subaccounts[1].positions[0].virtualQuoteLots,'30000000');assert.equal(a.subaccounts[1].authorityIsWallet,true);
 assert.equal(requireFreshPhoenixChainAccount(a,{walletAddress:f.wallet,request:f.request}),a);
 assert.deepEqual(f.calls.map(c=>c.method),['getGenesisHash','getMultipleAccounts','getGenesisHash']);
 assert.equal(f.calls[1].params[0].length,5);assert.equal(f.calls[1].params[1].commitment,'confirmed');
 assert.ok(Object.isFrozen(a.subaccounts[1].positions[0]));
 assert.throws(()=>requireFreshPhoenixChainAccount({...a},{walletAddress:f.wallet}));
 assert.throws(()=>requireFreshPhoenixChainAccount(a,{walletAddress:phoenixTestKey(99)}));
 assert.throws(()=>requireFreshPhoenixChainAccount(a,{walletAddress:f.wallet,request:async()=>{}}));
 f.advance(10001);assert.throws(()=>requireFreshPhoenixChainAccount(a,{walletAddress:f.wallet}),/EXPIRED/);
});
test('missing accounts mean setup is required, never a fabricated funded account',async()=>{
 const f=await phoenixChainAccountFixture();f.map.clear();const a=await read(f);
 assert.equal(a.payerLamports,'0');assert.equal(a.usdc.amountUnits,'0');assert.equal(a.subaccounts[0].exists,false);assert.equal(a.subaccounts[1].exists,false);
});
test('a donated lamport at the canonical ATA is not token balance and does not masquerade as initialized',async()=>{
 const f=await phoenixChainAccountFixture();f.map.set(f.a.canonicalAta,phoenixRpcAccount('11111111111111111111111111111111',Buffer.alloc(0),1));
 const a=await read(f);assert.equal(a.canonical.exists,false);assert.equal(a.canonical.amountUnits,'0');assert.equal(a.canonical.uninitializedLamports,'1');
});
test('foreign program owner, wallet authority, child PDA/index and oversized dynamic map reject',async()=>{
 for(const change of [
  (f,a)=>{a.owner=phoenixTestKey(88);},
  (f,a,b)=>{b.set(bs58.decode(phoenixTestKey(88)),56);},
  (f,a,b)=>{b.set(bs58.decode(phoenixTestKey(88)),24);},
  (f,a,b)=>{b[155]=2;},
  (f,a,b)=>{b.writeBigUInt64LE(257n,232);},
  (f,a,b)=>{b.writeBigUInt64LE(2n,224);},
  (f,a,b)=>{b[0]^=1;}
 ]){
  const f=await phoenixChainAccountFixture(),a=f.map.get(f.a.trader),b=Buffer.from(a.data[0],'base64');change(f,a,b);a.data=[b.toString('base64'),'base64'];
  await assert.rejects(()=>read(f),/PHOENIX_ACCOUNT_/);
 }
});
test('foreign position delegate stays visible but is never treated as wallet authority',async()=>{
 const f=await phoenixChainAccountFixture();f.map.set(f.a.trader,phoenixRpcAccount(f.map.get(f.a.trader).owner,phoenixTraderBytes({address:f.a.trader,positionAuthority:phoenixTestKey(88)})));
 const a=await read(f);assert.equal(a.subaccounts[1].authorityIsWallet,false);assert.equal(a.subaccounts[1].positionAuthority,phoenixTestKey(88));
});
test('wrong-mint token accounts reject; frozen balances and delegates are never spendable wallet cash',async()=>{
 for(const change of [b=>{b[108]=3;},b=>{b.set(bs58.decode(phoenixTestKey(88)),0);},b=>{b.writeUInt32LE(2,72);}]){
  const f=await phoenixChainAccountFixture(),a=f.map.get(f.a.usdcAta),b=Buffer.from(a.data[0],'base64');change(b);a.data=[b.toString('base64'),'base64'];await assert.rejects(()=>read(f));
 }
 const f=await phoenixChainAccountFixture(),a=f.map.get(f.a.usdcAta),b=Buffer.from(a.data[0],'base64');b.writeUInt32LE(1,72);b.set(bs58.decode(phoenixTestKey(88)),76);a.data=[b.toString('base64'),'base64'];
 assert.equal((await read(f)).usdc.spendable,false);
 const g=await phoenixChainAccountFixture(),c=g.map.get(g.a.usdcAta),d=Buffer.from(c.data[0],'base64');d[108]=2;c.data=[d.toString('base64'),'base64'];assert.equal((await read(g)).usdc.spendable,false);
});
test('wrong network, stale bank, malformed response and duplicate account requests reject',async()=>{
 const f=await phoenixChainAccountFixture();f.setGenesis('devnet');await assert.rejects(()=>read(f),/NETWORK/);
 f.setGenesis('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');f.setSlot(999);
 await assert.rejects(()=>readPhoenixChainAccount({walletAddress:f.wallet,minimumSlot:1000},{request:f.request,now:f.now,monotonicNow:f.monotonicNow}),/BANK/);
 await assert.rejects(()=>readPhoenixChainAccount({walletAddress:f.wallet,subaccountIndices:[1,1]},{request:f.request}));
 await assert.rejects(()=>readPhoenixChainAccount({walletAddress:f.wallet},{request:async(method)=>method==='getGenesisHash'?'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':{context:{slot:1000},value:[]}}),/BANK/);
});
