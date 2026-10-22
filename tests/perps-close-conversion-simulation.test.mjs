import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {readConstructedPerpsCloseConversionWire} from '../lib/perps-close-conversion-wire.js';
import {simulatePerpsCloseConversion,readSimulatedPerpsCloseConversion} from '../lib/perps-close-conversion-simulation.js';
import {PERPS_PROGRAM,PERPS_POOL} from '../lib/perps-server-custody.js';
import {conversionFixture as fixture} from './helpers/perps-conversion-fixture.mjs';
const wallet=bs58.encode(Buffer.alloc(32,1)),blockhash=bs58.encode(Buffer.alloc(32,9)),now=Date.parse('2026-10-20T20:00:00Z');
test('same-wire conversion proves all supported token/native inputs, exact protected return, fee and vault/wallet conservation',async()=>{
 for(const asset of ['SOL','ETH','BTC'])for(const nativeSolInput of asset==='SOL'?[false,true]:[false]){
  const f=await fixture({asset,nativeSolInput}),r=await simulatePerpsCloseConversion(f.wire,f.options);
  assert.equal(r.receivedUsdcUnits,String(f.received));assert.equal(r.amountUnits,String(f.amount));assert.equal(r.networkFeeLamports,'5400');assert.equal(r.observedSlot,105);
  assert.equal(r.readyForSigning,false);assert.equal(r.requiresFinalizedProceedsAndJournalBinding,true);assert.equal(r.requiresExplicitAuthorization,true);
  assert.equal(readSimulatedPerpsCloseConversion(r).wire,f.wire);assert.throws(()=>readSimulatedPerpsCloseConversion({...r}));
  assert(Object.isFrozen(readSimulatedPerpsCloseConversion(r)));assert(Object.isFrozen(readSimulatedPerpsCloseConversion(r).before));
  assert.throws(()=>readConstructedPerpsCloseConversionWire({...f.wire}));f.expire();assert.throws(()=>readSimulatedPerpsCloseConversion(r));
 }
});
test('new ATAs, existing WSOL and unsynchronized native excess remain exactly accounted for',async()=>{
 for(const options of [{newSource:true,newDestination:true},{newSource:true,newDestination:true,closeWrappedAccount:false},
  {closeWrappedAccount:false,oldWrapped:17n,unsynced:7n},{nativeSolInput:false,closeWrappedAccount:false,unsynced:7n}]){
  const f=await fixture(options),r=await simulatePerpsCloseConversion(f.wire,f.options);assert.equal(r.receivedUsdcUnits,String(f.received));
 }
});
test('native rejection, low minimum, unexpected rent/token movement and changed oracle/config cannot authorize funds',async()=>{
 for(const mode of ['minimumError','nativeError','replaced','tooMuchCompute','ownerCredit','inputDebit','outputCredit','vaultAuthority','sourceOldBalance','oracleOwner','oracleStale','oracleChanged','oracleLowMinimum','custodyConfig','custodyLocked','custodyTail','custodyOwned','custodyFees','poolRent','poolFee','fee','network','expired']){
  const f=await fixture();
  if(mode==='minimumError')f.response.err={InstructionError:[6,{Custom:6020}]};
  if(mode==='nativeError')f.response.err='BlockhashNotFound';if(mode==='replaced')f.response.replacementBlockhash={blockhash};if(mode==='tooMuchCompute')f.response.unitsConsumed=400001;
  if(mode==='ownerCredit')f.after.get(wallet).lamports++;
  if(mode==='inputDebit'){const a=f.after.get(f.c.tokenAccount),b=Buffer.from(a.data[0],'base64');b.writeBigUInt64LE(10100000001n,64);a.data[0]=b.toString('base64');a.lamports++;}
  if(mode==='outputCredit')f.after.set(f.wire.destination,f.token(wallet,f.u.mint,f.received+2001n));
  if(mode==='vaultAuthority')f.after.set(f.u.tokenAccount,f.token(wallet,f.u.mint,10000000000n-f.received));
  if(mode==='sourceOldBalance')f.before.set(f.wire.source,f.token(wallet,f.c.mint,1n));
  if(mode.startsWith('oracle')){
   for(const map of mode==='oracleChanged'?[f.after]:[f.before,f.after]){
    const a=map.get(f.c.dovesAgOracle),b=Buffer.from(a.data[0],'base64');if(mode==='oracleOwner')a.owner=PERPS_PROGRAM;
    if(mode==='oracleStale')b.writeBigInt64LE(BigInt(now/1000)-11n,177);
    if(mode==='oracleChanged')b[168]^=1;if(mode==='oracleLowMinimum')b.writeBigUInt64LE(101000000n,168);a.data[0]=b.toString('base64');
   }
  }
  if(mode.startsWith('custody')){const a=f.after.get(f.c.address),b=Buffer.from(a.data[0],'base64');b[{custodyConfig:199,custodyLocked:230,custodyTail:300,custodyOwned:222,custodyFees:214}[mode]]^=1;a.data[0]=b.toString('base64');}
  if(mode==='poolRent')f.after.get(PERPS_POOL).lamports++;
  if(mode==='poolFee'){const a=f.after.get(PERPS_POOL),b=Buffer.from(a.data[0],'base64'),n=b.readUInt32LE(8),p=16+n+32*b.readUInt32LE(12+n);b[p+56]^=1;a.data[0]=b.toString('base64');}
  if(['fee','network','expired'].includes(mode)){const request=f.options.request;f.options.request=async(m,p)=>{
   if(mode==='fee'&&m==='getFeeForMessage')return {context:{slot:101},value:null};if(mode==='network'&&m==='getGenesisHash')return 'devnet';if(mode==='expired'&&m==='getBlockHeight')return 1001;return request(m,p);
  };}
  await assert.rejects(simulatePerpsCloseConversion(f.wire,f.options),mode);
 }
});
test('legitimate conversion fee reservations conserve each custody book and both token vaults',async()=>{
 const f=await fixture();
 for(const c of [f.c,f.u]){const a=f.after.get(c.address),b=Buffer.from(a.data[0],'base64');
  b.writeBigUInt64LE(100n,214);b.writeBigUInt64LE(b.readBigUInt64LE(222)-100n,222);a.data[0]=b.toString('base64');}
 assert.equal((await simulatePerpsCloseConversion(f.wire,f.options)).receivedUsdcUnits,String(f.received));
});

test('snapshot pairing is bounded, keeps the exact wire and never retries an actual simulation error',async()=>{
 for(const mode of ['once','moving','failed']){
  const f=await fixture(),request=f.options.request;let simulations=0;
  f.options.request=async(m,p)=>{const r=await request(m,p);if(m==='simulateTransaction'){
   simulations++;if(mode==='once'&&simulations===1)r.context.slot++;if(mode==='moving')r.context.slot=p[1].minContextSlot+2;if(mode==='failed')r.value.err='BlockhashNotFound';
  }return r;};
  if(mode==='once'){const r=await simulatePerpsCloseConversion(f.wire,f.options);assert.equal(r.snapshotBankAttempts,2);}
  else await assert.rejects(simulatePerpsCloseConversion(f.wire,f.options));assert.equal(simulations,mode==='once'?2:mode==='moving'?3:1);
 }
});
