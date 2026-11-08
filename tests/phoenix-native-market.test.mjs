import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readPhoenixNativeMarket,requireFreshPhoenixNativeMarket} from '../lib/phoenix-native-market.js';
import {PHOENIX_IDENTITIES as ID,decodePhoenixCatalog,planPhoenixOrder} from '../lib/phoenix-market-plan.js';
import {phoenixNativeMarketFixture} from './helpers/phoenix-native-market-fixture.mjs';
import {phoenixTestKey} from './helpers/phoenix-chain-account-fixture.mjs';
function change(f,address,fn){const a=f.nativeMap.get(address),b=Buffer.from(a.data[0],'base64');fn(b,a);a.data=[b.toString('base64'),'base64'];}

test('native config, mint, vault, book, arena and asset-map evidence matches a sealed plan',async()=>{
 const f=await phoenixNativeMarketFixture(),proof=await readPhoenixNativeMarket(f.plan,f.nativeOptions);
 assert.equal(proof.runningState,'active');assert.equal(proof.takerFeeMicro,350);assert.equal(proof.readyForSigning,false);
 assert.equal(requireFreshPhoenixNativeMarket(proof,{plan:f.plan,request:f.nativeRequest}),proof);
 assert.deepEqual(f.nativeCalls.map(c=>c.method),['getGenesisHash','getMultipleAccounts','getMultipleAccounts','getGenesisHash']);
 assert.equal(f.nativeCalls[1].params[1].dataSlice.length,16384);assert.equal(f.nativeCalls[2].params[1].dataSlice,undefined);
 assert.throws(()=>requireFreshPhoenixNativeMarket({...proof},{plan:f.plan}));
 assert.throws(()=>requireFreshPhoenixNativeMarket(proof,{plan:{...f.plan}}));
 f.advance(10001);assert.throws(()=>requireFreshPhoenixNativeMarket(proof,{plan:f.plan}),/EXPIRED/);
});
test('actual market bytes, not API labels, determine identity, fee and tradability',async()=>{
 for(const mutate of [
  (f,b)=>{b.writeUInt32LE(8,32);},
  (f,b)=>{b.write('FAKE',40,'ascii');},
  (f,b)=>{b.writeBigUInt64LE(2n,56);},
  (f,b)=>{b[9]=1;},
  (f,b)=>{b.writeUInt32LE(351,96);},
  (f,b)=>{b[8]=2;},
  (f,b)=>{b.writeUInt32LE(65,380);},
  (f,b,a)=>{a.owner=phoenixTestKey(88);}
 ]){
  const f=await phoenixNativeMarketFixture();change(f,f.plan.market.market,(b,a)=>mutate(f,b,a));
  await assert.rejects(()=>readPhoenixNativeMarket(f.plan,f.nativeOptions),/PHOENIX_NATIVE_/);
 }
});
test('exchange suspension, restart mismatch and unrelated native config keys reject',async()=>{
 for(const mutate of [
  b=>{b[504]=128;},b=>{b[504]=135;},b=>{b.writeBigUInt64LE(11n,1096);},
  b=>{b.set(bs58.decode(phoenixTestKey(88)),360);},b=>{b[505]=9;}
 ]){
  const f=await phoenixNativeMarketFixture();change(f,f.GLOBAL,mutate);await assert.rejects(()=>readPhoenixNativeMarket(f.plan,f.nativeOptions),/PHOENIX_NATIVE_/);
 }
});
test('vault destination, mint initialization, arena expansion and spline substitution reject',async()=>{
 for(const mutate of [
  f=>change(f,f.exchangeKeys.globalVault,b=>{b.set(bs58.decode(phoenixTestKey(88)),32);}),
  f=>change(f,ID.canonicalUsdc,b=>{b[44]=9;}),
  f=>change(f,ID.usdc,b=>{b[45]=0;}),
  f=>change(f,f.exchangeKeys.globalTraderIndex[0],b=>{b.writeUInt16LE(17,52);b.writeUInt16LE(17,54);}),
  f=>change(f,f.plan.market.spline,b=>{b[0]^=1;}),
  f=>change(f,f.exchangeKeys.perpAssetMap,b=>{b.writeUInt32LE(1025,32);})
 ]){
  const f=await phoenixNativeMarketFixture();mutate(f);await assert.rejects(()=>readPhoenixNativeMarket(f.plan,f.nativeOptions),/PHOENIX_NATIVE_/);
 }
});
test('a lenient API tier cannot override a stricter native on-chain risk tier',async()=>{
 const f=await phoenixNativeMarketFixture(),catalog=decodePhoenixCatalog([{...f.row,leverageTiers:[{maxLeverage:20,maxSizeBaseLots:100000000}]}],{observedAt:f.now()});
 const plan=planPhoenixOrder({...f.intent,leverageTenths:110,catalog,referencePrice:f.quote.referencePrice,observedSlot:1000,now:f.now()});
 await assert.rejects(()=>readPhoenixNativeMarket(plan,f.nativeOptions),/RISK_TIER/);
});
