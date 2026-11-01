import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {conversionFixture} from './helpers/perps-conversion-fixture.mjs';
import {buildUnsignedPerpsEntryConversionWire} from '../lib/perps-entry-conversion-wire.js';
import {simulatePerpsEntryConversion,readSimulatedPerpsEntryConversion} from '../lib/perps-entry-conversion-simulation.js';
async function fixture(asset='BTC',newDestination=false){
 const f=await conversionFixture({asset,nativeSolInput:false,closeWrappedAccount:false,strictWire:false}),input=10000000n,output=9970000n,owner=f.walletAddress;
 const wire=await buildUnsignedPerpsEntryConversionWire({walletAddress:owner,asset,blockhash:f.wire.blockhash,lastValidBlockHeight:f.wire.lastValidBlockHeight,usdcUnits:String(input),minimumCollateralUnits:asset==='SOL'?'99500000':'9950000'},f.u,f.c);
 const actualOutput=asset==='SOL'?99700000n:output;
 for(const map of [f.before,f.after])for(const c of [f.u,f.c]){const a=map.get(c.address),old=Buffer.from(a.data[0],'base64'),b=Buffer.alloc(1200);old.copy(b);a.data[0]=b.toString('base64');}
 f.before.set(wire.source,f.token(owner,f.u.mint,20000000n));f.after.set(wire.source,f.token(owner,f.u.mint,20000000n-input));
 f.before.set(wire.destination,newDestination?null:f.token(owner,f.c.mint,17n));f.after.set(wire.destination,f.token(owner,f.c.mint,(newDestination?0n:17n)+actualOutput));
 const oldPayer=f.before.get(owner);f.after.set(owner,{...oldPayer,lamports:oldPayer.lamports-5400-(newDestination?2039280:0)});
 const readAmount=a=>Buffer.from(a.data[0],'base64').readBigUInt64LE(64);
 for(const [c,delta]of [[f.u,input],[f.c,-actualOutput]]){
  const old=f.before.get(c.tokenAccount),amount=readAmount(old),authority=bs58.encode(Buffer.from(old.data[0],'base64').subarray(32,64));
  f.after.set(c.tokenAccount,f.token(authority,c.mint,amount+delta,c.asset==='SOL'?5n:0n));
  for(const map of [f.before,f.after]){const a=map.get(c.address),b=Buffer.from(a.data[0],'base64');b.writeBigUInt64LE(readAmount(map.get(c.tokenAccount)),222);a.data[0]=b.toString('base64');}
 }
 return {...f,wire,input,output:actualOutput};
}
test('entry conversion conserves exact USDC and collateral for all markets and new/existing ATAs',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const fresh of [false,true]){
  const f=await fixture(asset,fresh),r=await simulatePerpsEntryConversion(f.wire,f.options);
  assert.equal(r.receivedCollateralUnits,String(f.output));assert.equal(r.usdcUnits,'10000000');assert.equal(r.networkFeeLamports,'5400');assert.equal(r.rentLockedLamports,fresh?'2039280':'0');
  assert.equal(r.readyForSigning,false);assert.equal(r.requiresFinalizedReceiptBeforeOpening,true);assert.equal(readSimulatedPerpsEntryConversion(r).wire,f.wire);assert.throws(()=>readSimulatedPerpsEntryConversion({...r}));f.expire();assert.throws(()=>readSimulatedPerpsEntryConversion(r));
 }
});
test('entry conversion rejects altered funding, configuration, principal, wire and native simulation failures',async()=>{
 for(const mode of ['payer','source','destination','custodyConfig','custodyPrincipal','suffix','vault','oracle','native','replacement','bank','height']){
  const f=await fixture();
  const mutate=(key,offset)=>{const a=f.after.get(key),b=Buffer.from(a.data[0],'base64');b[offset]^=1;a.data[0]=b.toString('base64');};
  if(mode==='payer')f.after.get(f.walletAddress).lamports++;
  if(mode==='source')mutate(f.wire.source,64);if(mode==='destination')mutate(f.wire.destination,64);
  if(mode==='custodyConfig')mutate(f.u.address,199);if(mode==='custodyPrincipal')mutate(f.u.address,1004);if(mode==='suffix')mutate(f.u.address,1199);
  if(mode==='vault')mutate(f.c.tokenAccount,64);if(mode==='oracle')mutate(f.c.dovesAgOracle,168);
  if(mode==='native')f.response.err='BlockhashNotFound';if(mode==='replacement')f.response.replacementBlockhash={blockhash:f.wire.blockhash};
  const request=f.options.request;f.options.request=async(m,p)=>{const r=await request(m,p);if(mode==='bank'&&m==='simulateTransaction')r.context.slot++;if(mode==='height'&&m==='getBlockHeight')return 1001;return r;};
  await assert.rejects(simulatePerpsEntryConversion(f.wire,f.options),mode);
 }
});
