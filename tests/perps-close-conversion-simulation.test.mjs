import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {buildUnsignedPerpsCloseConversionWire,readConstructedPerpsCloseConversionWire} from '../lib/perps-close-conversion-wire.js';
import {simulatePerpsCloseConversion,readSimulatedPerpsCloseConversion} from '../lib/perps-close-conversion-simulation.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,decodeServerPerpsCustody,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111',DOVES='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',wallet=bs58.encode(Buffer.alloc(32,1)),blockhash=bs58.encode(Buffer.alloc(32,9)),now=Date.parse('2026-10-20T20:00:00Z'),rent=2039280n;
async function fixture({asset='SOL',nativeSolInput=asset==='SOL',closeWrappedAccount=nativeSolInput,newSource=false,newDestination=false,oldWrapped=0n,unsynced=0n}={}){
 const oracleAccounts=new Map();
 async function custody(asset){
  const c=PERPS_CUSTODIES[asset],n=['BTC','ETH','SOL','USDC'].indexOf(asset),[ag,bump]=await getProgramDerivedAddress({programAddress:DOVES,seeds:['ag_feed',bs58.decode(c.mint)]}),b=Buffer.alloc(416);
  Buffer.from('01b830515d833f91','hex').copy(b);for(const [o,k]of [[8,PERPS_POOL],[40,c.mint],[384,ag]])Buffer.from(bs58.decode(k)).copy(b,o);
  Buffer.alloc(32,30+n).copy(b,72);Buffer.alloc(32,40+n).copy(b,106);b[104]=c.decimals;b[105]=Number(c.stable);b[138]=2;b[199]=1;b.writeBigUInt64LE(500000n,175);b.writeBigUInt64LE(10000000000n,222);b.writeBigUInt64LE(1000n,230);
  const account={owner:PERPS_PROGRAM,executable:false,lamports:3000000,data:[b.toString('base64'),'base64']};
  const d=Buffer.alloc(394);Buffer.from('70f98bd9d7d0f936','hex').copy(d);Buffer.from(bs58.decode(c.mint)).copy(d,8);d[201]=bump;d.writeBigUInt64LE(asset==='USDC'?1000000n:100000000n,168);d.writeInt8(-6,176);d.writeBigInt64LE(BigInt(now/1000)-1n,177);d.writeUInt32LE(10,185);
  oracleAccounts.set(ag,{owner:DOVES,executable:false,lamports:3633120,data:[d.toString('base64'),'base64']});return {account,value:decodeServerPerpsCustody(asset,c.address,account)};
 }
 const c=await custody(asset),u=await custody('USDC'),amount=100000000n,quoted=amount*100000000n/10n**BigInt(c.value.decimals),received=quoted*995n/1000n;
 const wire=await buildUnsignedPerpsCloseConversionWire({walletAddress:wallet,asset,amountUnits:String(amount),minimumUsdcUnits:String(quoted*991n/1000n),nativeSolInput,closeWrappedAccount,blockhash,lastValidBlockHeight:'1000'},c.value,u.value);
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side:'LONG'}),before=new Map(),after=new Map();
 const system=lamports=>({owner:SYSTEM,executable:false,lamports:Number(lamports),data:['','base64']});
 function token(owner,mint,amount,extra=0n){
  const b=Buffer.alloc(165);Buffer.from(bs58.decode(mint)).copy(b);Buffer.from(bs58.decode(owner)).copy(b,32);b[108]=1;b.writeBigUInt64LE(amount,64);
  if(mint===PERPS_CUSTODIES.SOL.mint){b.writeUInt32LE(1,109);b.writeBigUInt64LE(rent,113);}
  return {owner:TOKEN,executable:false,lamports:Number(rent+(mint===PERPS_CUSTODIES.SOL.mint?amount+extra:0n)),data:[b.toString('base64'),'base64']};
 }
 const oldAmount=nativeSolInput?oldWrapped:amount+17n;
 before.set(wire.source,newSource?null:token(wallet,c.value.mint,oldAmount,asset==='SOL'?unsynced:0n));
 after.set(wire.source,closeWrappedAccount?null:token(wallet,c.value.mint,nativeSolInput?oldAmount+unsynced:17n,asset==='SOL'&&!nativeSolInput?unsynced:0n));
 before.set(wire.destination,newDestination?null:token(wallet,u.value.mint,2000n));after.set(wire.destination,token(wallet,u.value.mint,(newDestination?0n:2000n)+received));
 let locked=(newDestination?rent:0n)+(newSource&&!closeWrappedAccount?rent:0n),refunded=closeWrappedAccount&&!newSource?BigInt(before.get(wire.source).lamports):0n;
 before.set(wallet,system(20000000000n));after.set(wallet,system(20000000000n-(nativeSolInput?amount:0n)-5400n-locked+refunded));
 const pool={owner:PERPS_PROGRAM,executable:false,lamports:6000000,data:[Buffer.concat([createHash('sha256').update('account:Pool').digest().subarray(0,8),Buffer.alloc(256)]).toString('base64'),'base64']};
 before.set(PERPS_POOL,pool);after.set(PERPS_POOL,structuredClone(pool));
 for(const x of [c,u]){before.set(x.value.address,x.account);after.set(x.value.address,structuredClone(x.account));}
 before.set(c.value.tokenAccount,token(ids.transferAuthority,c.value.mint,10000000000n,asset==='SOL'?5n:0n));after.set(c.value.tokenAccount,token(ids.transferAuthority,c.value.mint,10000000000n+amount,asset==='SOL'?5n:0n));
 before.set(u.value.tokenAccount,token(ids.transferAuthority,u.value.mint,10000000000n));after.set(u.value.tokenAccount,token(ids.transferAuthority,u.value.mint,10000000000n-received));
 for(const [k,v]of oracleAccounts){before.set(k,v);after.set(k,structuredClone(v));}
 let elapsed=0;const calls=[],response={err:null,unitsConsumed:140000},request=async(method,params)=>{
  calls.push({method,params});if(method==='getGenesisHash')return GENESIS;if(method==='getSlot')return 100;if(method==='getBlockHeight')return 500;
  if(method==='getFeeForMessage'){assert.equal(params[0],wire.messageBase64);return {context:{slot:101},value:5400};}
  if(method==='getMinimumBalanceForRentExemption')return Number(rent);
  if(method==='getMultipleAccounts')return {context:{slot:Math.max(105,params[1].minContextSlot)},value:params[0].map(k=>before.get(k)??null)};
  assert.equal(method,'simulateTransaction');assert.equal(params[0],wire.serializedTxBase64);assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);
  return {context:{slot:Math.max(105,params[1].minContextSlot)},value:{...response,accounts:params[1].accounts.addresses.map(k=>after.get(k)??null)}};
 };
 return {wire,before,after,request,calls,response,c:c.value,u:u.value,received,amount,token,options:{request,maxSlippageBps:100,now:()=>now,monotonicNow:()=>elapsed},expire(){elapsed=10001;}};
}
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
 for(const mode of ['minimumError','nativeError','replaced','tooMuchCompute','ownerCredit','inputDebit','outputCredit','vaultAuthority','sourceOldBalance','oracleOwner','oracleStale','oracleChanged','oracleLowMinimum','custodyConfig','custodyLocked','poolRent','fee','network','expired']){
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
  if(mode.startsWith('custody')){const a=f.after.get(f.c.address),b=Buffer.from(a.data[0],'base64');b[mode==='custodyConfig'?199:230]^=1;a.data[0]=b.toString('base64');}
  if(mode==='poolRent')f.after.get(PERPS_POOL).lamports++;
  if(['fee','network','expired'].includes(mode)){const request=f.options.request;f.options.request=async(m,p)=>{
   if(mode==='fee'&&m==='getFeeForMessage')return {context:{slot:101},value:null};if(mode==='network'&&m==='getGenesisHash')return 'devnet';if(mode==='expired'&&m==='getBlockHeight')return 1001;return request(m,p);
  };}
  await assert.rejects(simulatePerpsCloseConversion(f.wire,f.options),mode);
 }
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
