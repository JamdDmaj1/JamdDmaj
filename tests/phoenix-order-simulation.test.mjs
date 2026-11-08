import test from 'node:test';
import assert from 'node:assert/strict';
import {simulatePhoenixOrder,requirePhoenixSimulatedOrder} from '../lib/phoenix-order-simulation.js';
import {phoenixSimulationFixture} from './helpers/phoenix-simulation-fixture.mjs';
import {phoenixTraderBytes,phoenixTestKey} from './helpers/phoenix-chain-account-fixture.mjs';
import {buildPhoenixOrderWire} from '../lib/phoenix-order-wire.js';
function edit(accounts,index,fn){const a=accounts[index],b=Buffer.from(a.data[0],'base64');fn(b,a);a.data=[b.toString('base64'),'base64'];}

test('same unsigned wire must simulate a full protected fill, exact USDC spend and conserved SOL rent',async()=>{
 for(const side of ['LONG','SHORT'])for(const canonicalExists of [false,true]){
  const f=await phoenixSimulationFixture({side,canonicalExists});
  const proof=await simulatePhoenixOrder(f.args,f.simulationOptions);
  assert.equal(proof.readyForSigning,false);assert.equal(proof.networkFeeLamports,'5600');assert.equal(proof.rentLockedLamports,canonicalExists?'0':'2039280');
  assert.ok(BigInt(proof.protocolFeeUnits)>0n);assert.equal(proof.wireHash,f.wire.messageHash);
  assert.equal(requirePhoenixSimulatedOrder(proof,{wire:f.wire,request:f.request}).account,f.account);
  assert.throws(()=>requirePhoenixSimulatedOrder({...proof},{wire:f.wire}));
  assert.throws(()=>requirePhoenixSimulatedOrder(proof,{wire:{...f.wire}}));
  const call=f.calls.find(c=>c.method==='simulateTransaction');assert.equal(call.params[1].accounts.addresses[3],f.a.trader);
  assert.ok(!f.calls.some(c=>c.method==='sendTransaction'));
 }
});
test('close simulation realizes gain or loss without requiring wallet USDC/canonical transfers',async()=>{
 for(const closedCollateral of [10100000n,9000000n]){
  const f=await phoenixSimulationFixture({close:true,closedCollateral});
  const proof=await simulatePhoenixOrder(f.args,f.simulationOptions);
  assert.equal(proof.close,true);assert.equal(proof.postQuoteCollateralUnits,closedCollateral.toString());assert.equal(proof.rentLockedLamports,'0');
  assert.ok(BigInt(proof.protocolFeeUnits)>0n);assert.equal(proof.nativeFillEventsVerified,true);
 }
});
test('fabricated account effects without a matching native fill event cannot pass simulation',async()=>{
 for(const mutate of [()=>[],()=>null,events=>[{...events[0],index:99}]]){
  const f=await phoenixSimulationFixture();f.overrideEvents(mutate);await assert.rejects(()=>simulatePhoenixOrder(f.args,f.simulationOptions),/PHOENIX_EVENTS_/);
 }
});
test('native evidence for one exchange account set cannot authorize a different account set',async()=>{
 const f=await phoenixSimulationFixture(),old=f.exchangeKeys.globalTraderIndex[0],replacement=phoenixTestKey(99);
 const remap=ix=>({...ix,accounts:ix.accounts.map(a=>({...a,address:a.address===old?replacement:a.address}))});
 const client={ixs:{
  async buildPlaceMarketOrder(params){return remap(await f.client.ixs.buildPlaceMarketOrder(params));},
  async buildDepositIxs(params){const d=await f.client.ixs.buildDepositIxs(params);d.named.depositFunds.accounts=remap(d.named.depositFunds).accounts;return d;}
 }};
 const wire=await buildPhoenixOrderWire(f.review,{...f.wireOptions,client,exchangeKeys:{...f.exchangeKeys,globalTraderIndex:[replacement]}});
 await assert.rejects(()=>simulatePhoenixOrder({...f.args,wire},f.simulationOptions),/NATIVE_KEY_BINDING/);
});
test('underfill, wrong direction, price outside protection and excessive taker fee reject',async()=>{
 const mutations=[
  (f,p)=>edit(p,3,b=>{b.writeBigInt64LE(0n,248);b.writeBigInt64LE(0n,256);}),
  (f,p)=>edit(p,3,b=>{b.writeBigInt64LE(BigInt(f.review.plan.baseLots)-1n,248);}),
  (f,p)=>edit(p,3,b=>{b.writeBigInt64LE(-BigInt(f.review.plan.baseLots),248);}),
  (f,p)=>edit(p,3,b=>{b.writeBigInt64LE(-999999999n,256);}),
  (f,p)=>edit(p,3,b=>{b.writeBigInt64LE(9000000n,88);})
 ];
 for(const mutate of mutations){const f=await phoenixSimulationFixture();f.overridePost(p=>mutate(f,p));await assert.rejects(()=>simulatePhoenixOrder(f.args,f.simulationOptions),/PHOENIX_SIMULATION_/);}
});
test('unexpected token debit, hidden SOL debit, rent mismatch or changed account authority reject',async()=>{
 const mutations=[
  p=>edit(p,1,b=>{b.writeBigUInt64LE(9999999n,64);}),
  p=>edit(p,2,b=>{b.writeBigUInt64LE(1n,64);}),
  p=>{p[0].lamports-=10000;},
  p=>{p[2].lamports+=10000;},
  p=>edit(p,3,b=>{b.set(new Uint8Array(32).fill(9),120);}),
  p=>{p[3].owner=phoenixTestKey(88);}
 ];
 for(const mutate of mutations){const f=await phoenixSimulationFixture();f.overridePost(mutate);await assert.rejects(()=>simulatePhoenixOrder(f.args,f.simulationOptions));}
});
test('incomplete close and hidden close-time wallet transfers reject',async()=>{
 for(const mutate of [
  (f,p)=>{p[3].data=[phoenixTraderBytes({address:f.a.trader,baseLots:-1n}).toString('base64'),'base64'];},
  (f,p)=>edit(p,1,b=>{b.writeBigUInt64LE(2999999n,64);}),
  (f,p)=>{p[0].lamports-=1;}
 ]){
  const f=await phoenixSimulationFixture({close:true});f.overridePost(p=>mutate(f,p));await assert.rejects(()=>simulatePhoenixOrder(f.args,f.simulationOptions));
 }
});
test('failed RPC simulation, stale bank, excessive fee and forged proof fail closed',async()=>{
 const f=await phoenixSimulationFixture();f.setError({InstructionError:[1,'Custom']});await assert.rejects(()=>simulatePhoenixOrder(f.args,f.simulationOptions),/FAILED/);
 const g=await phoenixSimulationFixture();g.setFee(19001);await assert.rejects(()=>simulatePhoenixOrder(g.args,g.simulationOptions),/FEE/);
 const h=await phoenixSimulationFixture();h.setSlot(999);await assert.rejects(()=>simulatePhoenixOrder(h.args,h.simulationOptions),/FEE/);
 const i=await phoenixSimulationFixture();await assert.rejects(()=>simulatePhoenixOrder({...i.args,account:{...i.account}},i.simulationOptions));
 const j=await phoenixSimulationFixture(),proof=await simulatePhoenixOrder(j.args,j.simulationOptions);j.advance(5000);assert.throws(()=>requirePhoenixSimulatedOrder(proof,{wire:j.wire}));
});
