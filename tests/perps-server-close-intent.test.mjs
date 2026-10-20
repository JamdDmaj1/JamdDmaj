import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import bs58 from 'bs58';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {planServerPerpsFullClose,requireFreshServerPerpsFullClosePlan,checkServerPerpsFullCloseCore} from '../lib/perps-server-close-intent.js';
const wallet=bs58.encode(Buffer.alloc(32,1)),now=1802865600;
test('both close data layouts match the recorded confirmed program-owned Anchor IDL',()=>{
 const idl=JSON.parse(readFileSync(new URL('../security/native-tests/jupiter-perps-idl-layout.json',import.meta.url),'utf8'));
 assert.equal(idl.fullCloseInstructionLayout.slot,459186694);
 assert.equal(idl.idlSha256,'1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653');
 for(const version of [1,2]){
  const layout=idl.fullCloseInstructionLayout['instantDecreasePosition'+(version===1?'':'2')];
  const bytes=Buffer.from(core(version),'base64');
  assert.equal(bytes.length,layout.someEntirePositionBytes);assert.equal(bytes.subarray(0,8).toString('hex'),layout.discriminatorHex);
  assert.equal(layout.accounts.length,22);assert.equal(layout.accounts[7],'position');
 }
});
async function fixture(side='LONG',asset='SOL'){
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side}),data=Buffer.alloc(210);
 Buffer.from('aabc8fe47a40f7d0','hex').copy(data);
 for(const [offset,key]of [[8,wallet],[40,PERPS_POOL],[72,PERPS_CUSTODIES[asset].address],[104,PERPS_CUSTODIES[side==='LONG'?asset:'USDC'].address]])Buffer.from(bs58.decode(key)).copy(data,offset);
 data.writeBigUInt64LE(1000n,136);data.writeBigUInt64LE(1001n,144);data[152]=side==='LONG'?1:2;
 data.writeBigUInt64LE(100000000n,153);data.writeBigUInt64LE(30000000n,161);data.writeBigUInt64LE(10000000n,169);data[209]=ids.positionBump;
 let elapsed=0;
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  assert.equal(method,'getMultipleAccounts');
  return {context:{slot:100},value:params[0].map(address=>address===ids.position?{owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[data.toString('base64'),'base64']}:null)};
 };
 const account=await readServerPerpsAccount({walletAddress:wallet},{request,now:()=>now*1000,monotonicNow:()=>elapsed});
 const options={walletAddress:wallet,positionAddress:ids.position,referencePrice:'100',maxSlippageBps:50,minimumSlot:100};
 return {account,options,expire(){elapsed=10001;}};
}
function core(version=1,patch={}){
 const v={collateral:0n,size:0n,price:99500000n,time:BigInt(now),option:1,entire:1,counter:7n,...patch};
 const b=Buffer.alloc(version===1?42:50);
 createHash('sha256').update('global:instant_decrease_position'+(version===1?'':'2')).digest().copy(b,0,0,8);
 b.writeBigUInt64LE(v.collateral,8);b.writeBigUInt64LE(v.size,16);b.writeBigUInt64LE(v.price,24);
 b[32]=v.option;b[33]=v.entire;b.writeBigInt64LE(v.time,34);if(version===2)b.writeBigUInt64LE(v.counter,42);
 return b.toString('base64');
}
test('full close plans exactly one chain-owned position for USDC without increasing exposure or authorizing',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const f=await fixture(side,asset),plan=planServerPerpsFullClose(f.account,f.options);
  assert.deepEqual(plan.body,{positionPubkey:f.options.positionAddress,receiveToken:'USDC',entirePosition:true,maxSlippageBps:'50'});
  assert.equal(plan.readyForSigning,false);assert.equal(plan.side,side);assert.equal(plan.asset,asset);
  assert.equal(plan.priceLimitUsdUnits,side==='LONG'?'99500000':'100500000');
  assert(Object.isFrozen(plan));assert(Object.isFrozen(plan.body));
  for(const version of [1,2]){
   const checked=checkServerPerpsFullCloseCore(core(version,{price:BigInt(plan.priceLimitUsdUnits)}),plan,now);
   assert.equal(checked.entirePosition,true);assert.equal(checked.readyForSigning,false);
   assert.equal(checked.requiresFullInstructionPolicy,true);assert.equal(checked.requiresSameWireSimulation,true);
  }
 }
});
test('forged, copied, expired, absent, foreign and stale-slot plans fail before any builder',async()=>{
 const f=await fixture(),plan=planServerPerpsFullClose(f.account,f.options);
 for(const account of [{...f.account},null])assert.throws(()=>planServerPerpsFullClose(account,f.options));
 for(const patch of [{walletAddress:bs58.encode(Buffer.alloc(32,2))},{positionAddress:'missing'},{minimumSlot:101},{minimumSlot:NaN},{maxSlippageBps:0},{maxSlippageBps:101},{referencePrice:'1e2'}])assert.throws(()=>planServerPerpsFullClose(f.account,{...f.options,...patch}));
 assert.throws(()=>requireFreshServerPerpsFullClosePlan({...plan}));
 assert.throws(()=>checkServerPerpsFullCloseCore(core(),{...plan},now));
 f.expire();assert.throws(()=>requireFreshServerPerpsFullClosePlan(plan));
 assert.throws(()=>planServerPerpsFullClose(f.account,f.options));
});
test('core rejects partial closes, oversized deltas, altered tags, noncanonical/trailing bytes and signed-time abuse',async()=>{
 const f=await fixture(),plan=planServerPerpsFullClose(f.account,f.options);
 for(const version of [1,2]){
  for(const patch of [{option:0},{option:2},{entire:0},{entire:2},{price:0n},{price:99499999n},{collateral:10000001n},{size:30000001n},{time:BigInt(now)-31n},{time:BigInt(now)+3n},{time:-1n}])assert.throws(()=>checkServerPerpsFullCloseCore(core(version,patch),plan,now));
  assert.equal(checkServerPerpsFullCloseCore(core(version,{collateral:10000000n,size:30000000n}),plan,now).readyForSigning,false);
  const b=Buffer.from(core(version),'base64');b[0]^=1;
  for(const bad of [b.toString('base64'),core(version)+'\n',Buffer.concat([Buffer.from(core(version),'base64'),Buffer.from([0])]).toString('base64'),'AA=='])assert.throws(()=>checkServerPerpsFullCloseCore(bad,plan,now));
 }
 for(const time of [NaN,now+0.5,29])assert.throws(()=>checkServerPerpsFullCloseCore(core(),plan,time));
});
test('SHORT buy limit and LONG sell limit use inward integer rounding',async()=>{
 for(const side of ['LONG','SHORT']){
  const f=await fixture(side),plan=planServerPerpsFullClose(f.account,{...f.options,referencePrice:'100.000001'});
  const expected=side==='LONG'?99500001n:100500001n;
  assert.equal(BigInt(plan.priceLimitUsdUnits),expected);
  assert.doesNotThrow(()=>checkServerPerpsFullCloseCore(core(2,{price:expected}),plan,now));
  assert.throws(()=>checkServerPerpsFullCloseCore(core(2,{price:expected+(side==='LONG'?-1n:1n)}),plan,now));
 }
});
