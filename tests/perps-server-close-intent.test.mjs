import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities,decodeServerPerpsCustody} from '../lib/perps-server-custody.js';
import {planServerPerpsFullClose,requireFreshServerPerpsFullClosePlan,checkServerPerpsFullCloseCore} from '../lib/perps-server-close-intent.js';
import {checkServerPerpsFullCloseBindings,inspectServerPerpsFullClosePreparation} from '../lib/perps-server-close-bindings.js';
import {simulateServerPerpsFullCloseEffects,readServerPerpsFullCloseSimulation} from '../lib/perps-server-close-simulation.js';
import {checkServerPerpsFullCloseFunding,readServerPerpsFullCloseFunding} from '../lib/perps-server-close-funding.js';
import {buildUnsignedServerPerpsFullClose,prepareSimulatedServerPerpsFullClose} from '../lib/perps-server-close-preparation.js';
import {checkServerPerpsFullCloseInstructionPolicy,readServerPerpsFullClosePolicy} from '../lib/perps-server-close-policy.js';
import {readServerPerpsCloseOracles,readServerPerpsCloseOracleContext,CLOSE_DOVES_PROGRAM,CLOSE_PYTH_LAZER} from '../lib/perps-close-oracle-context.js';
import {checkServerPerpsFullCloseVaults,readServerPerpsFullCloseVaults} from '../lib/perps-server-close-vaults.js';
import {checkServerPerpsFullCloseReserves,readServerPerpsFullCloseReserves} from '../lib/perps-server-close-reserves.js';
import {checkServerPerpsFullCloseOracleEffects,readServerPerpsFullCloseOracleEffects} from '../lib/perps-server-close-oracle-effects.js';
import {describeSimulatedPerpsCloseSettlement,canonicalPerpsCloseSettlement} from '../lib/perps-close-settlement.js';
const wallet=bs58.encode(Buffer.alloc(32,1)),now=1802865600;
test('chosen two-step settlement returns only collateral, preserves existing balances and leaves conversion pending across all six paths',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const f=await oracleEffectsFixture(side,asset,'COLLATERAL_THEN_USDC');
  assert.equal(f.plan.body.receiveToken,side==='LONG'?asset:'USDC');
  assert.equal(f.plan.requiresSeparateUsdcConversion,side==='LONG');
  assert.equal(f.inspection.bindings.tokenLedger,null);
  const reserves=await f.reserves();
  const result=checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:now});
  const {vaults}=readServerPerpsFullCloseReserves(reserves),{funding}=readServerPerpsFullCloseVaults(vaults);
  assert.equal(funding.receivedUsdcUnits,side==='LONG'?'0':'8000000');
  assert.equal(funding.receivedCollateralUnits,side==='LONG'?'8000000':'0');
  assert.equal(result.readyForSigning,false);
 }
});
test('collateral-only close rejects an internal swap or ledger and invalid settlement choices',async()=>{
 const f=await boundFixture();
 const plan=planServerPerpsFullClose(f.account,{...f.options,settlement:'COLLATERAL_THEN_USDC'});
 await assert.rejects(checkServerPerpsFullCloseBindings(f.inspection,plan,f.market,f.collateral,now,f.usdc));
 for(const settlement of [null,'AUTO','collateral','USDC',{}])assert.throws(()=>planServerPerpsFullClose(f.account,{...f.options,settlement}));
});
test('collateral payout cannot consume previous tokens, invent SOL credits or debit unrelated USDC',async()=>{
 for(const mode of ['nativeCredit','nativeShortfall','oldWrappedBalance','tokenShortfall','usdcPayout','usdcDebit','vaultRent']){
  const asset=mode==='tokenShortfall'?'ETH':'SOL',f=await fundingFixture('LONG',asset,'COLLATERAL_THEN_USDC');
  const address=f.inspection.bindings.collateralAccount;
  if(mode==='nativeCredit')f.after.get(wallet).lamports++;
  if(mode==='nativeShortfall')f.after.get(wallet).lamports--;
  if(mode==='oldWrappedBalance')f.before.set(address,f.tokenFor(wallet,PERPS_CUSTODIES.SOL.mint,1n));
  if(mode==='tokenShortfall')f.after.set(address,f.tokenFor(wallet,PERPS_CUSTODIES.ETH.mint,7999999n));
  if(mode==='usdcPayout')f.after.set(f.recipient,f.token(1000001n));
  if(mode==='usdcDebit')f.after.set(f.usdc.tokenAccount,f.tokenFor(f.ids.transferAuthority,PERPS_CUSTODIES.USDC.mint,999999999n));
  if(mode==='vaultRent')f.after.get(f.collateral.tokenAccount).lamports--;
  await assert.rejects(async()=>{
   const policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection);
   const sim=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
   const funding=await checkServerPerpsFullCloseFunding(sim,{request:f.fundingRequest});
   await checkServerPerpsFullCloseVaults(funding,policy);
  },mode);
 }
});
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
 assert.equal(idl.closePostSwapInstructionLayout.swapWithTokenLedger.discriminatorHex,'8b8deec529d3ac13');
 assert.equal(idl.closePostSwapInstructionLayout.swapWithTokenLedger.bytes,16);
 assert.equal(idl.closePostSwapInstructionLayout.swapWithTokenLedger.accounts.length,17);
 assert.equal(idl.closeOracleContextLayout.idlSha256,'1ae8e5e335beec1646d5484671d8f07902fb5ac55581c3028701893b998025f5');
 assert.equal(idl.closeOracleContextLayout.aggregate.lazerFeedOffset,202);
 assert.equal(idl.closeOracleContextLayout.aggregate.priceOffset,168);assert.equal(idl.closeOracleContextLayout.aggregate.maxFeedAgeOffset,189);
 assert.equal(idl.closeOracleContextLayout.priceFeed.priceOffset,73);assert.equal(idl.closeOracleContextLayout.priceFeed.timestampOffset,82);
 assert.equal(idl.closeOracleContextLayout.program,CLOSE_DOVES_PROGRAM);
 assert.equal(idl.closeOracleContextLayout.pythLazer.treasury,CLOSE_PYTH_LAZER.treasury);
 assert.equal(idl.closeReserveAccountingLayout.position.lockedAmount.offset,201);
 assert.equal(idl.closeReserveAccountingLayout.position.cumulativeInterestSnapshot.type,'u128');
 assert.equal(idl.closeReserveAccountingLayout.custodyAssets.offset,214);
});
async function fixture(side='LONG',asset='SOL'){
 const ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset,side}),data=Buffer.alloc(210);
 Buffer.from('aabc8fe47a40f7d0','hex').copy(data);
 for(const [offset,key]of [[8,wallet],[40,PERPS_POOL],[72,PERPS_CUSTODIES[asset].address],[104,PERPS_CUSTODIES[side==='LONG'?asset:'USDC'].address]])Buffer.from(bs58.decode(key)).copy(data,offset);
 data.writeBigUInt64LE(1000n,136);data.writeBigUInt64LE(1001n,144);data[152]=side==='LONG'?1:2;
 data.writeBigUInt64LE(100000000n,153);data.writeBigUInt64LE(30000000n,161);data.writeBigUInt64LE(10000000n,169);data[209]=ids.positionBump;
 data.writeBigUInt64LE(1000n,185);data.writeBigUInt64LE(side==='LONG'?3n*10n**BigInt(PERPS_CUSTODIES[asset].decimals-1):30000000n,201);
 let elapsed=0;
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  assert.equal(method,'getMultipleAccounts');
  return {context:{slot:100},value:params[0].map(address=>address===ids.position?{owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[data.toString('base64'),'base64']}:null)};
 };
 const account=await readServerPerpsAccount({walletAddress:wallet},{request,now:()=>now*1000,monotonicNow:()=>elapsed});
 const options={walletAddress:wallet,positionAddress:ids.position,referencePrice:'100',maxSlippageBps:50,minimumSlot:100};
 return {account,options,ids,nativePositionAccount:{owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[data.toString('base64'),'base64']},expire(){elapsed=10001;}};
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
  assert.deepEqual(plan.body,{positionPubkey:f.options.positionAddress,receiveToken:'USDC',entirePosition:true,maxSlippageBps:'49'});
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

test('tighter builder quote absorbs small independent price drift without widening the absolute close limit',async()=>{
 for(const side of ['LONG','SHORT']){
  const f=await fixture(side);
  for(const bps of [1,2,50,100]){
   const plan=planServerPerpsFullClose(f.account,{...f.options,maxSlippageBps:bps});
   assert.equal(plan.maxSlippageBps,bps);
   assert.equal(plan.body.maxSlippageBps,String(Math.max(1,bps-1)));
   const limit=BigInt(plan.priceLimitUsdUnits);
   assert.doesNotThrow(()=>checkServerPerpsFullCloseCore(core(1,{price:limit}),plan,now));
   assert.throws(()=>checkServerPerpsFullCloseCore(core(1,{price:limit+(side==='LONG'?-1n:1n)}),plan,now),/PERPS_CLOSE_CORE_PRICE/);
  }
 }
 // Actual public unsigned diagnostic on 2026-10-20: asking for
 // 50 bps against a slightly newer price produced 105817864, below the
 // independently authorized sell floor 105818155. Do not accept that wire.
 const f=await fixture(),plan=planServerPerpsFullClose(f.account,{...f.options,referencePrice:'106.349904'});
 assert.equal(plan.priceLimitUsdUnits,'105818155');
 assert.throws(()=>checkServerPerpsFullCloseCore(core(1,{price:105817864n}),plan,now),/PERPS_CLOSE_CORE_PRICE/);
 // 49 bps against the same inferred builder price (106349612 microUSD)
 // remains inside the original 50 bp authorization, not a new wider limit.
 const tighterPrice=106349612n*9951n/10000n;
 assert.doesNotThrow(()=>checkServerPerpsFullCloseCore(core(1,{price:tighterPrice}),plan,now));
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
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
async function boundFixture(side='LONG',asset='SOL',version=1,settlement='DIRECT_USDC'){
 const f=await fixture(side,asset),plan=planServerPerpsFullClose(f.account,{...f.options,settlement}),separate=plan.requiresSeparateUsdcConversion;
 const agKeys=Object.fromEntries(await Promise.all(['BTC','ETH','SOL','USDC'].map(async asset=>[asset,await getProgramDerivedAddress({programAddress:CLOSE_DOVES_PROGRAM,seeds:['ag_feed',bs58.decode(PERPS_CUSTODIES[asset].mint)]})])));
 function custody(asset){
  const id=PERPS_CUSTODIES[asset],n=['BTC','ETH','SOL','USDC'].indexOf(asset),data=Buffer.alloc(416);
  Buffer.from('01b830515d833f91','hex').copy(data);Buffer.from(bs58.decode(PERPS_POOL)).copy(data,8);Buffer.from(bs58.decode(id.mint)).copy(data,40);
  Buffer.alloc(32,20+n).copy(data,72);data[104]=id.decimals;data[105]=Number(id.stable);Buffer.alloc(32,30+n).copy(data,106);data[138]=2;
  data.writeBigUInt64LE(500000n,175);data[199]=1;data[202]=1;data[203]=1;Buffer.from(bs58.decode(agKeys[asset][0])).copy(data,384);
  const account={owner:PERPS_PROGRAM,executable:false,data:[data.toString('base64'),'base64']};
  return {account,decoded:decodeServerPerpsCustody(asset,id.address,account)};
 }
 const m=custody(asset),u=custody('USDC'),c=side==='LONG'?m:u,market=m.decoded,collateral=c.decoded,usdc=u.decoded;
 const associated=async(owner,mint=PERPS_CUSTODIES.USDC.mint)=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
 const recipient=await associated(wallet),collateralAccount=await associated(wallet,collateral.mint),keeper=bs58.encode(Buffer.alloc(32,2)),api=bs58.encode(Buffer.alloc(32,3)),ledger=bs58.encode(Buffer.alloc(32,66));
 const [requestAddress]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(f.ids.position),Buffer.from('0700000000000000','hex'),new Uint8Array([2])]});
 const requestAta=await associated(requestAddress,collateral.mint);
 const common=[keeper,api,wallet,collateralAccount,f.ids.transferAuthority,f.ids.perpetuals,PERPS_POOL,f.ids.position,market.address,market.dovesAgOracle];
 const roles=version===1?[...common,market.dovesAgOracle,collateral.address,collateral.dovesAgOracle,collateral.dovesAgOracle,collateral.tokenAccount,collateral.mint,PERPS_PROGRAM,TOKEN,ATA,SYSTEM,f.ids.eventAuthority,PERPS_PROGRAM]
  :[...common,collateral.address,collateral.dovesAgOracle,collateral.tokenAccount,collateral.mint,PERPS_PROGRAM,requestAddress,requestAta,TOKEN,ATA,SYSTEM,f.ids.eventAuthority,PERPS_PROGRAM];
 const swapRoles=[wallet,collateralAccount,recipient,f.ids.transferAuthority,f.ids.perpetuals,PERPS_POOL,collateral.address,collateral.dovesAgOracle,collateral.tokenAccount,usdc.address,usdc.dovesAgOracle,usdc.tokenAccount,ledger,TOKEN,'Sysvar1nstructions1111111111111111111111111',f.ids.eventAuthority,PERPS_PROGRAM];
 const writeRoles=version===1?[3,6,7,8,11,14]:[3,6,7,8,10,12,15,16];
 const writes=[...new Set([...writeRoles.map(i=>roles[i]),...(side==='LONG'&&!separate?[recipient,usdc.address,usdc.tokenAccount,ledger]:[])])];
 const reads=[...new Set([...roles,...(side==='LONG'&&!separate?swapRoles:[]),COMPUTE].filter(key=>![wallet,keeper,api,...writes].includes(key)))];
 const keys=[wallet,keeper,api,...writes,...reads];
 const unit=Buffer.alloc(5);unit[0]=2;unit.writeUInt32LE(1000000,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(1n,1);
 const ix={program:keys.indexOf(PERPS_PROGRAM),accounts:roles.map(key=>keys.indexOf(key)),dataBase64:core(version,{price:BigInt(plan.priceLimitUsdUnits)})};
 const instruction=(roles,data)=>({program:keys.indexOf(PERPS_PROGRAM),accounts:roles.map(key=>keys.indexOf(key)),dataBase64:data.toString('base64')});
 const ledgerIx=instruction([ledger,collateralAccount,TOKEN],Buffer.from('e455b9704e4f4d02','hex'));
 const swapIx=instruction(swapRoles,Buffer.from('8b8deec529d3ac130000000000000000','hex'));
 const envelope={stage:'STRUCTURE_ONLY',staticKeys:[...keys],accountCount:keys.length,readonlySigned:2,readonlyUnsigned:reads.length,lookups:[],instructions:[
  {program:keys.indexOf(COMPUTE),accounts:[],dataBase64:unit.toString('base64')},
  {program:keys.indexOf(COMPUTE),accounts:[],dataBase64:price.toString('base64')},...(side==='LONG'&&!separate?[ledgerIx,ix,swapIx]:[ix]),
  ...(separate&&asset==='SOL'?[{program:keys.indexOf(TOKEN),accounts:[keys.indexOf(collateralAccount),0,0],dataBase64:'CQ=='}]:[])]};
 return {...f,plan,market,collateral,usdc,agKeys,custodyAccounts:[m.account,u.account],inspection:{envelope,resolvedKeys:keys},ix,ledgerIx,swapIx,recipient,requestAddress,requestAta};
}
const checkBindings=f=>checkServerPerpsFullCloseBindings(f.inspection,f.plan,f.market,f.collateral,now,f.usdc);
test('both close variants bind all six markets/directions to owned recipient and independently decoded custody roles',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT'])for(const version of [1,2]){
  const f=await boundFixture(side,asset,version),checked=await checkBindings(f);
  assert.equal(checked.positionAddress,f.ids.position);assert.equal(checked.recipient,f.recipient);
  assert.equal(checked.requestAddress,version===2?f.requestAddress:null);assert.equal(checked.requestAta,version===2?f.requestAta:null);
  assert.equal(checked.readyForSigning,false);assert.equal(checked.requiresFullInstructionPolicy,true);assert.equal(checked.requiresSameWireSimulation,true);
 }
});
test('every close role substitution, added opening, copied custody and expired plan is rejected',async()=>{
 for(const version of [1,2]){
  for(let role=0;role<22;role++){
   const f=await boundFixture('SHORT','BTC',version);f.ix.accounts[role]=role===2?1:0;
   await assert.rejects(checkBindings(f));
  }
  const f=await boundFixture('LONG','ETH',version);
  await assert.rejects(checkServerPerpsFullCloseBindings(f.inspection,f.plan,{...f.market},f.collateral,now,f.usdc));
  f.inspection.envelope.instructions.push({...f.ix});
  await assert.rejects(checkBindings(f));
  f.inspection.envelope.instructions.pop();f.expire();
  await assert.rejects(checkBindings(f));
 }
});
test('close inspection rejects a provider-selected foreign position before contacting any RPC',async()=>{
 const f=await fixture(),plan=planServerPerpsFullClose(f.account,f.options);let calls=0;
 await assert.rejects(inspectServerPerpsFullClosePreparation({positionPubkey:wallet},plan,{nowSeconds:now,request:async()=>{calls++;throw Error('UNEXPECTED');}}));
 assert.equal(calls,0);
});
test('close bindings require writable recipient, vault, position and request accounts but never writable programs',async()=>{
 for(const version of [1,2]){
  const f=await boundFixture('SHORT','SOL',version),envelope=f.inspection.envelope;
  const correct=envelope.readonlyUnsigned;
  envelope.readonlyUnsigned=envelope.staticKeys.length-3;
  await assert.rejects(checkBindings(f));
  envelope.readonlyUnsigned=0;
  await assert.rejects(checkBindings(f));
  envelope.readonlyUnsigned=correct;
  assert.equal((await checkBindings(f)).readyForSigning,false);
 }
});
function preparationFixture(f,{useLookup=false,writableKeys=[]}={}){
 // Unfunded, synthetic provider cosignature, never a live wallet signature.
 const api=generateKeyPairSync('ed25519'),keys=[...f.inspection.resolvedKeys];keys[2]=bs58.encode(api.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const blockhash=bs58.encode(Buffer.alloc(32,9)),envelope=f.inspection.envelope;
 let ordered=keys,staticKeys=keys,readonlyUnsigned=envelope.readonlyUnsigned,lookup=[];
 if(useLookup){
  const invoked=new Set(envelope.instructions.map(ix=>keys[ix.program]));
  const isWrite=key=>keys.indexOf(key)>=3&&(keys.indexOf(key)<keys.length-envelope.readonlyUnsigned||writableKeys.includes(key));
  const writes=keys.filter(isWrite),readonly=keys.slice(3).filter(key=>!isWrite(key));
  const staticReadonly=readonly.filter(key=>invoked.has(key)),loaded=readonly.filter(key=>!invoked.has(key));
  staticKeys=[...keys.slice(0,3),...writes,...staticReadonly];ordered=[...staticKeys,...loaded];readonlyUnsigned=staticReadonly.length;
  const address=bs58.encode(Buffer.alloc(32,80)),data=Buffer.alloc(56+loaded.length*32);data.writeUInt32LE(1);data.writeBigUInt64LE(18446744073709551615n,4);
  loaded.forEach((key,i)=>Buffer.from(bs58.decode(key)).copy(data,56+i*32));
  f.lookupFixture={address,account:{owner:'AddressLookupTab1e1111111111111111111111111',executable:false,data:[data.toString('base64'),'base64']}};
  lookup=[Buffer.from([1]),Buffer.from(bs58.decode(address)),Buffer.from([0,loaded.length,...loaded.map((_,i)=>i)])];
 }
 const instructions=envelope.instructions.map(ix=>{
  const data=Buffer.from(ix.dataBase64,'base64');assert(data.length<128);assert(ix.accounts.length<128);
  return Buffer.concat([Buffer.from([ordered.indexOf(keys[ix.program]),ix.accounts.length,...ix.accounts.map(i=>ordered.indexOf(keys[i])),data.length]),data]);
 });
 const message=Buffer.concat([Buffer.from(useLookup?[128,3,envelope.readonlySigned,readonlyUnsigned,staticKeys.length]:[3,envelope.readonlySigned,readonlyUnsigned,staticKeys.length]),...staticKeys.map(key=>Buffer.from(bs58.decode(key))),Buffer.from(bs58.decode(blockhash)),Buffer.from([instructions.length]),...instructions,...lookup]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,api.privateKey),message]);
 assert(wire.length<=1232);
 return {serializedTxBase64:wire.toString('base64'),positionPubkey:f.plan.positionAddress,txMetadata:{blockhash,lastValidBlockHeight:'1000'}};
}
test('unsigned close preparation resolves the exact envelope then fetches independent custody identities without broadcasting',async()=>{
 for(const version of [1,2])for(const side of ['LONG','SHORT']){
  const f=await boundFixture(side,'SOL',version),preparation=preparationFixture(f),calls=[];
  const request=async(method,params)=>{
   calls.push(method);
   if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   if(method==='getSlot')return 101;
   assert.equal(method,'getMultipleAccounts');assert.equal(params[1].minContextSlot,101);
   assert.deepEqual(params[0],[PERPS_CUSTODIES.SOL.address,PERPS_CUSTODIES.USDC.address]);
   return {context:{slot:102},value:f.custodyAccounts};
  };
  const result=await inspectServerPerpsFullClosePreparation(preparation,f.plan,{request,nowSeconds:now});
  assert.equal(result.stage,'FULL_CLOSE_INSPECTED_NOT_AUTHORIZED');assert.equal(result.observedSlot,102);
  assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
  assert.equal(result.bindings.recipient,f.recipient);assert.equal(result.requiresFullInstructionPolicy,true);
  assert.deepEqual(calls,['getGenesisHash','getSlot','getGenesisHash','getGenesisHash','getMultipleAccounts','getGenesisHash']);
 }
});
test('close preparation rejects wrong-network, missing/stale/foreign custody banks and revoked decrease permission',async()=>{
 for(const mode of ['network','missing','stale','owner','disabled','expired']){
  const f=await boundFixture('SHORT','SOL',2),preparation=preparationFixture(f);
  const request=async(method)=>{
   if(method==='getGenesisHash')return mode==='network'?'devnet':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   if(method==='getSlot')return 101;
   assert.equal(method,'getMultipleAccounts');
   const value=structuredClone(f.custodyAccounts);
   if(mode==='missing')value.pop();
   if(mode==='owner')value[0].owner=wallet;
   if(mode==='disabled'){const bytes=Buffer.from(value[1].data[0],'base64');bytes[203]=0;value[1].data[0]=bytes.toString('base64');}
   if(mode==='expired')f.expire();
   return {context:{slot:mode==='stale'?100:102},value};
  };
  await assert.rejects(inspectServerPerpsFullClosePreparation(preparation,f.plan,{request,nowSeconds:now}));
 }
});
test('an in-flight account-list mutation cannot replace the captured close instruction',async()=>{
 const f=await boundFixture('LONG','SOL',2);
 const pending=checkBindings(f);
 f.ix.accounts[3]=0;f.ix.dataBase64=core(2,{entire:0});
 const checked=await pending;
 assert.equal(checked.recipient,f.recipient);assert.equal(checked.core.entirePosition,true);
 await assert.rejects(checkBindings(f));
});
async function simulationFixture(side='SHORT',minimumOut=0n,asset='SOL',settlement='DIRECT_USDC'){
 const f=await boundFixture(side,asset,2,settlement);
 if(side==='LONG'&&!f.plan.requiresSeparateUsdcConversion){const data=Buffer.from(f.swapIx.dataBase64,'base64');data.writeBigUInt64LE(minimumOut,8);f.swapIx.dataBase64=data.toString('base64');}
 const preparation=preparationFixture(f);
 const inspection=await inspectServerPerpsFullClosePreparation(preparation,f.plan,{nowSeconds:now,request:async(method)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return 101;
  assert.equal(method,'getMultipleAccounts');return {context:{slot:102},value:f.custodyAccounts};
 }});
 function token(amount){
  const b=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(b);Buffer.from(bs58.decode(wallet)).copy(b,32);b[108]=1;b.writeBigUInt64LE(amount,64);
  return {owner:TOKEN,executable:false,lamports:2039280,data:[b.toString('base64'),'base64']};
 }
 const before=new Map([[wallet,{owner:SYSTEM,executable:false,lamports:180000000,data:['','base64']}],[f.recipient,token(1000000n)],[f.ids.position,f.nativePositionAccount]]);
 const after=new Map([[wallet,{owner:SYSTEM,executable:false,lamports:179995000,data:['','base64']}],[f.recipient,token(9000000n)],[f.ids.position,null]]);
 const response={context:{slot:105},value:{err:null,unitsConsumed:400000,accounts:null}},calls=[];
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return 103;
  if(method==='getBlockHeight')return 500;
  if(method==='getMultipleAccounts')return {context:{slot:105},value:params[0].map(address=>before.get(address)??null)};
  if(method==='getFeeForMessage')return {context:{slot:105},value:5000};
  assert.equal(method,'simulateTransaction');assert.equal(params[0],preparation.serializedTxBase64);
  assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);assert(params[1].minContextSlot>=105);
  return {...response,value:{...response.value,accounts:response.value.accounts??params[1].accounts.addresses.map(address=>after.get(address)??null)}};
 };
 return {...f,preparation,inspection,before,after,response,calls,request,token};
}
test('exact-wire close simulation proves position removal and actual owner USDC increase without signing authority',async()=>{
 const f=await simulationFixture(),result=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
 assert.equal(result.receivedUsdcUnits,'8000000');assert.equal(result.feeLamports,'5000');assert.equal(result.observedSlot,105);
 assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);assert.equal(result.requiresFundingRentAndOtherAccountChecks,true);
 const proof=readServerPerpsFullCloseSimulation(result);assert.equal(proof.wire,f.preparation.serializedTxBase64);
 assert.equal(proof.after[f.ids.position],null);assert(Object.isFrozen(proof.before));
 assert.equal(proof.beforeSlot,proof.simulationSlot);assert.equal(result.snapshotBankAttempts,1);
 assert.deepEqual(f.calls.map(call=>call.method),['getGenesisHash','getSlot','getBlockHeight','getFeeForMessage','getMultipleAccounts','simulateTransaction','getBlockHeight','getGenesisHash']);
 assert.throws(()=>readServerPerpsFullCloseSimulation({...result}));
 await assert.rejects(simulateServerPerpsFullCloseEffects({...f.inspection},{request:f.request}));
 f.expire();assert.throws(()=>readServerPerpsFullCloseSimulation(result));
});
test('close simulation rejects stale/replaced/failed wires, partial closure, changed position and recipient loss or authority',async()=>{
 for(const mode of ['stale','replace','err','units','partial','remainingCollateral','changedBefore','foreignRecipient','recipientLoss','missingAccounts','expired']){
  const f=await simulationFixture();
  if(mode==='stale')f.response.context.slot=104;
  if(mode==='replace')f.response.value.replacementBlockhash={blockhash:f.preparation.txMetadata.blockhash};
  if(mode==='err')f.response.value.err={InstructionError:[2,'Custom']};
  if(mode==='units')f.response.value.unitsConsumed=1000001;
  if(mode==='partial')f.after.set(f.ids.position,structuredClone(f.nativePositionAccount));
  if(mode==='remainingCollateral'){
   const account=structuredClone(f.nativePositionAccount),data=Buffer.from(account.data[0],'base64');data.writeBigUInt64LE(0n,161);account.data[0]=data.toString('base64');f.after.set(f.ids.position,account);
  }
  if(mode==='changedBefore'){
   const account=structuredClone(f.nativePositionAccount),data=Buffer.from(account.data[0],'base64');data.writeBigUInt64LE(30000001n,161);account.data[0]=data.toString('base64');f.before.set(f.ids.position,account);
  }
  if(mode==='foreignRecipient'){
   const account=f.token(9000000n),data=Buffer.from(account.data[0],'base64');data[32]^=1;account.data[0]=data.toString('base64');f.after.set(f.recipient,account);
  }
  if(mode==='recipientLoss')f.after.set(f.recipient,f.token(999999n));
  if(mode==='missingAccounts')f.response.value.accounts=[];
  if(mode==='expired')f.expire();
  await assert.rejects(simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request}),mode);
 }
});
test('native zeroed-position closure and zero proceeds are represented without inventing returned margin',async()=>{
 const f=await simulationFixture(),account=structuredClone(f.nativePositionAccount),data=Buffer.from(account.data[0],'base64');
 data.writeBigUInt64LE(0n,161);data.writeBigUInt64LE(0n,169);data.writeBigUInt64LE(0n,201);data.writeBigUInt64LE(1002n,144);account.data[0]=data.toString('base64');
 f.after.set(f.ids.position,account);f.after.set(f.recipient,f.token(1000000n));
 const result=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});assert.equal(result.receivedUsdcUnits,'0');assert.equal(result.readyForSigning,false);
});
test('close simulation fails on an expired blockhash, wrong network, unknown fee or stale bank before a sign/send path exists',async()=>{
 for(const mode of ['height','network','fee','feeSlot','bank','clock']){
  const f=await simulationFixture();let tick=0;
  const request=async(method,params)=>{
   if(mode==='height'&&method==='getBlockHeight')return 1001;
   if(mode==='network'&&method==='getGenesisHash')return 'devnet';
   if(mode==='fee'&&method==='getFeeForMessage')return {context:{slot:105},value:null};
   if(mode==='feeSlot'&&method==='getFeeForMessage')return {context:{slot:102},value:5000};
   if(mode==='bank'&&method==='getMultipleAccounts')return {context:{slot:102},value:params[0].map(address=>f.before.get(address)??null)};
   return f.request(method,params);
  };
  await assert.rejects(simulateServerPerpsFullCloseEffects(f.inspection,{request,monotonicNow:()=>mode==='clock'?tick++===0?0:10001:0}),mode);
 }
});
test('LONG closure uses a ledger-bound collateral-to-USDC post-swap instead of pretending the close pays USDC directly',async()=>{
 for(const version of [1,2]){
  const f=await boundFixture('LONG','SOL',version),checked=await checkBindings(f);
  assert.notEqual(checked.collateralAccount,checked.recipient);assert(checked.tokenLedger);
  assert.equal(checked.swapMinimumOutUsdcUnits,'0');assert.equal(checked.requiresMinimumReturnCheck,true);
  assert.equal(checked.readyForSigning,false);
  const data=Buffer.from(f.swapIx.dataBase64,'base64');data.writeBigUInt64LE(7000000n,8);f.swapIx.dataBase64=data.toString('base64');
  assert.equal((await checkBindings(f)).swapMinimumOutUsdcUnits,'7000000');
 }
});
test('every post-swap role, missing or reordered ledger, duplicate swap and destination replacement fail closed',async()=>{
 for(let role=0;role<17;role++){
  const f=await boundFixture('LONG','SOL',1);f.swapIx.accounts[role]=role===0?1:0;
  await assert.rejects(checkBindings(f));
 }
 for(const mode of ['noLedger','noSwap','swapBeforeClose','ledgerAfterClose','twoLedgers','twoSwaps','ledgerSource','ledgerProgram','ledgerBytes','swapBytes','copiedUsdc']){
  const f=await boundFixture('LONG','ETH',2),instructions=f.inspection.envelope.instructions;
  if(mode==='noLedger')instructions.splice(2,1);
  if(mode==='noSwap')instructions.pop();
  if(mode==='swapBeforeClose')[instructions[3],instructions[4]]=[instructions[4],instructions[3]];
  if(mode==='ledgerAfterClose')[instructions[2],instructions[3]]=[instructions[3],instructions[2]];
  if(mode==='twoLedgers')instructions.splice(3,0,{...f.ledgerIx});
  if(mode==='twoSwaps')instructions.push({...f.swapIx});
  if(mode==='ledgerSource')f.ledgerIx.accounts[1]=0;
  if(mode==='ledgerProgram')f.ledgerIx.accounts[2]=0;
  if(mode==='ledgerBytes')f.ledgerIx.dataBase64=Buffer.concat([Buffer.from(f.ledgerIx.dataBase64,'base64'),Buffer.from([0])]).toString('base64');
  if(mode==='swapBytes')f.swapIx.dataBase64=Buffer.from('8b8deec529d3ac13','hex').toString('base64');
  if(mode==='copiedUsdc')f.usdc={...f.usdc};
  await assert.rejects(checkBindings(f),mode);
 }
});
test('LONG simulation follows the captured complete close/post-swap wire and measures final USDC, not intermediate collateral',async()=>{
 const f=await simulationFixture('LONG'),result=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
 assert.equal(result.receivedUsdcUnits,'8000000');assert.equal(result.readyForSigning,false);
 assert.notEqual(f.inspection.bindings.collateralAccount,f.inspection.bindings.recipient);
 const lower=await simulationFixture('LONG',8000001n);
 await assert.rejects(simulateServerPerpsFullCloseEffects(lower.inspection,{request:lower.request}));
});
async function fundingFixture(side='SHORT',asset='SOL',settlement='DIRECT_USDC'){
 const f=await simulationFixture(side,0n,asset,settlement);
 function tokenFor(owner,mint,amount=0n){
  const data=Buffer.alloc(165);Buffer.from(bs58.decode(mint)).copy(data);Buffer.from(bs58.decode(owner)).copy(data,32);
  data[108]=1;data.writeBigUInt64LE(amount,64);
  if(mint===PERPS_CUSTODIES.SOL.mint){data.writeUInt32LE(1,109);data.writeBigUInt64LE(2039280n,113);}
  return {owner:TOKEN,executable:false,lamports:Number(2039280n+(mint===PERPS_CUSTODIES.SOL.mint?amount:0n)),data:[data.toString('base64'),'base64']};
 }
 if(side==='LONG'){
  const address=f.inspection.bindings.collateralAccount,token=tokenFor(wallet,PERPS_CUSTODIES[asset].mint);
  f.before.set(address,token);f.after.set(address,structuredClone(token));
  const data=Buffer.alloc(48);createHash('sha256').update('account:TokenLedger').digest().copy(data,0,0,8);Buffer.from(bs58.decode(address)).copy(data,8);
  const ledger={owner:PERPS_PROGRAM,executable:false,lamports:1000000,data:[data.toString('base64'),'base64']};
  f.before.set(f.inspection.bindings.tokenLedger,ledger);f.after.set(f.inspection.bindings.tokenLedger,structuredClone(ledger));
 }
 f.after.set(wallet,{owner:SYSTEM,executable:false,lamports:181995000,data:['','base64']});
 const pool={owner:PERPS_PROGRAM,executable:false,lamports:6000000,data:[Buffer.concat([createHash('sha256').update('account:Pool').digest().subarray(0,8),Buffer.alloc(256)]).toString('base64'),'base64']};
 f.before.set(PERPS_POOL,pool);f.after.set(PERPS_POOL,structuredClone(pool));
 for(const [i,c]of [f.market,f.usdc].entries()){
  const account={...structuredClone(f.custodyAccounts[i]),lamports:3000000},data=Buffer.from(account.data[0],'base64');
  data.writeBigUInt64LE(1000000000n,222);data.writeBigUInt64LE(800000000n,230);
  data.writeBigUInt64LE(c.asset===asset?500000000n:0n,246);data.writeBigUInt64LE(c.asset===asset?100000000n:0n,254);
  data.writeBigUInt64LE(1000n,262);data.writeBigInt64LE(1000n,278);account.data[0]=data.toString('base64');
  const next=structuredClone(account),after=Buffer.from(data);
  if(c.address===f.collateral.address)after.writeBigUInt64LE(800000000n-BigInt(f.account.positions[0].lockedTokenUnits),230);
  if(side==='SHORT'&&c.asset===asset)after.writeBigUInt64LE(470000000n,246);
  after.writeBigUInt64LE(1001n,262);after.writeBigInt64LE(1001n,278);next.data[0]=after.toString('base64');
  f.before.set(c.address,account);f.after.set(c.address,next);
 }
 const usdcVault=tokenFor(f.ids.transferAuthority,PERPS_CUSTODIES.USDC.mint,1000000000n);
 f.before.set(f.usdc.tokenAccount,usdcVault);f.after.set(f.usdc.tokenAccount,tokenFor(f.ids.transferAuthority,PERPS_CUSTODIES.USDC.mint,992000000n));
 if(side==='LONG'){
  const vault=tokenFor(f.ids.transferAuthority,PERPS_CUSTODIES[asset].mint,1000000000n);
  if(asset==='SOL')vault.lamports+=5; // Legitimate unsynchronized native excess.
  f.before.set(f.collateral.tokenAccount,vault);f.after.set(f.collateral.tokenAccount,structuredClone(vault));
 }
 if(f.plan.requiresSeparateUsdcConversion){
  const payout=8000000n,address=f.inspection.bindings.collateralAccount;
  f.after.set(f.recipient,structuredClone(f.before.get(f.recipient)));
  f.after.set(f.usdc.tokenAccount,structuredClone(f.before.get(f.usdc.tokenAccount)));
  const vault=tokenFor(f.ids.transferAuthority,PERPS_CUSTODIES[asset].mint,1000000000n-payout);
  if(asset==='SOL'){
   vault.lamports+=5;
   f.after.set(address,null);f.after.get(wallet).lamports+=Number(payout)+2039280;
  }else f.after.set(address,tokenFor(wallet,PERPS_CUSTODIES[asset].mint,payout));
  f.after.set(f.collateral.tokenAccount,vault);
 }
 const rentCalls=[],fundingRequest=async(method,params)=>{
  rentCalls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  assert.equal(method,'getMinimumBalanceForRentExemption');assert.equal(params[0],165);return 2039280;
 };
 return {...f,tokenFor,fundingRequest,rentCalls};
}
test('close funding conserves exact wallet SOL, observed position rent and USDC for direct and post-swap paths',async()=>{
 for(const side of ['LONG','SHORT']){
  const f=await fundingFixture(side),simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  const result=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest});
  assert.equal(result.networkFeeLamports,'5000');assert.equal(result.rentRefundedLamports,'2000000');assert.equal(result.rentLockedLamports,'0');
  assert.equal(result.walletSolChangeLamports,'1995000');assert.equal(result.receivedUsdcUnits,'8000000');
  assert.equal(result.readyForSigning,false);assert.equal(result.requiresFullInstructionAndProtocolEffectsPolicy,true);
  assert.equal(readServerPerpsFullCloseFunding(result).simulation,simulation);
  assert.throws(()=>readServerPerpsFullCloseFunding({...result}));f.expire();assert.throws(()=>readServerPerpsFullCloseFunding(result));
 }
});
test('new recipient ATA rent, zeroed retained position, empty collateral closure and retained empty request ATA have exact SOL effects',async()=>{
 for(const mode of ['recipient','retainedPosition','collateralClosed','requestAta']){
  const f=await fundingFixture('LONG'),bindings=f.inspection.bindings;
  if(mode==='recipient'){
   f.before.set(f.recipient,null);f.after.set(wallet,{owner:SYSTEM,executable:false,lamports:179955720,data:['','base64']});
  }
  if(mode==='retainedPosition'){
   const account=structuredClone(f.nativePositionAccount),data=Buffer.from(account.data[0],'base64');data.writeBigUInt64LE(0n,161);data.writeBigUInt64LE(0n,169);data.writeBigUInt64LE(0n,201);account.data[0]=data.toString('base64');
   f.after.set(f.ids.position,account);f.after.set(wallet,{owner:SYSTEM,executable:false,lamports:179995000,data:['','base64']});
  }
  if(mode==='collateralClosed'){
   f.after.set(bindings.collateralAccount,null);f.after.set(wallet,{owner:SYSTEM,executable:false,lamports:184034280,data:['','base64']});
  }
  if(mode==='requestAta'){
   f.after.set(bindings.requestAta,f.tokenFor(bindings.requestAddress,PERPS_CUSTODIES.SOL.mint));f.after.set(wallet,{owner:SYSTEM,executable:false,lamports:179955720,data:['','base64']});
  }
  const simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  const result=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest});assert.equal(result.readyForSigning,false);
  assert.equal(result.rentLockedLamports,['recipient','requestAta'].includes(mode)?'2039280':'0');
  assert.equal(result.rentRefundedLamports,mode==='collateralClosed'?'4039280':mode==='retainedPosition'?'0':'2000000');
 }
});
test('unexplained SOL debit/credit, added rent, token-authority change, preexisting request and ledger alteration fail wallet funding',async()=>{
 for(const mode of ['debit','credit','recipientLamports','recipientAuthority','positionLamports','collateralSpent','collateralAuthority','ledgerAmount','ledgerOwner','requestBefore','requestRetained','requestTokens','otherWalletToken']){
  const f=await fundingFixture('LONG'),bindings=f.inspection.bindings;
  if(mode==='debit')f.after.get(wallet).lamports--;
  if(mode==='credit')f.after.get(wallet).lamports++;
  if(mode==='recipientLamports')f.after.get(f.recipient).lamports++;
  if(mode==='recipientAuthority'){
   const account=f.after.get(f.recipient),data=Buffer.from(account.data[0],'base64');data.writeUInt32LE(1,129);Buffer.from(bs58.decode(wallet)).copy(data,133);account.data[0]=data.toString('base64');
  }
  if(mode==='positionLamports'){
   const account=structuredClone(f.nativePositionAccount),data=Buffer.from(account.data[0],'base64');data.writeBigUInt64LE(0n,161);data.writeBigUInt64LE(0n,169);data.writeBigUInt64LE(0n,201);account.data[0]=data.toString('base64');account.lamports++;f.after.set(f.ids.position,account);
  }
  if(mode==='collateralSpent')f.before.set(bindings.collateralAccount,f.tokenFor(wallet,PERPS_CUSTODIES.SOL.mint,1n));
  if(mode==='collateralAuthority'){
   const account=f.after.get(bindings.collateralAccount),data=Buffer.from(account.data[0],'base64');data.writeUInt32LE(1,129);Buffer.from(bs58.decode(wallet)).copy(data,133);account.data[0]=data.toString('base64');
  }
  if(mode==='ledgerAmount'){
   const account=f.after.get(bindings.tokenLedger),data=Buffer.from(account.data[0],'base64');data.writeBigUInt64LE(1n,40);account.data[0]=data.toString('base64');
  }
  if(mode==='ledgerOwner')f.after.get(bindings.tokenLedger).owner=SYSTEM;
  if(mode==='requestBefore')f.before.set(bindings.requestAddress,{owner:PERPS_PROGRAM,executable:false,lamports:1,data:['','base64']});
  if(mode==='requestRetained')f.after.set(bindings.requestAddress,{owner:PERPS_PROGRAM,executable:false,lamports:1,data:['','base64']});
  if(mode==='requestTokens')f.after.set(bindings.requestAta,f.tokenFor(bindings.requestAddress,PERPS_CUSTODIES.SOL.mint,1n));
  if(mode==='otherWalletToken'){
   f.before.set(f.market.tokenAccount,f.tokenFor(wallet,PERPS_CUSTODIES.USDC.mint,100n));f.after.set(f.market.tokenAccount,f.tokenFor(wallet,PERPS_CUSTODIES.USDC.mint,99n));
  }
  const simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  await assert.rejects(checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest}),mode);
 }
});
test('unsigned close builder uses only the fixed v2 decrease endpoint and ignores provider fee/rent assertions',async()=>{
 const f=await boundFixture('SHORT','SOL',1),preparation=preparationFixture(f);let calls=0;
 const result=await buildUnsignedServerPerpsFullClose(f.plan,{fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://perps-api.jup.ag/v1/positions/decrease');assert.equal(options.method,'POST');
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers['x-perps-api-version'],'v2');
  assert.deepEqual(JSON.parse(options.body),f.plan.body);
  return new Response(JSON.stringify({...preparation,txMetadata:{...preparation.txMetadata,transactionFeeLamports:'0',accountRentLamports:'0'}}),{headers:{'Content-Type':'application/json'}});
 }});
 assert.equal(calls,1);assert.equal(result.serializedTxBase64,preparation.serializedTxBase64);assert(Object.isFrozen(result));
 assert.deepEqual(Object.keys(result.txMetadata).sort(),['blockhash','lastValidBlockHeight']);
 await assert.rejects(buildUnsignedServerPerpsFullClose({...f.plan},{fetchImpl:async()=>{throw Error('SHOULD_NOT_FETCH');}}));
});
test('unsigned builder rejects redirects, provider errors, huge/invalid bodies, changed position/wire/height and expiry without retry',async()=>{
 for(const mode of ['redirect','422','huge','type','json','position','wire','blockhash','height','expired']){
  const f=await boundFixture('SHORT','SOL',1),preparation=preparationFixture(f);let calls=0;
  const fetchImpl=async()=>{
   calls++;
   if(mode==='redirect')return {ok:true,redirected:true};
   if(mode==='422')return new Response('{}',{status:422,headers:{'Content-Type':'application/json'}});
   if(mode==='huge')return new Response(' '.repeat(65537),{headers:{'Content-Type':'application/json'}});
   if(mode==='type')return new Response(JSON.stringify(preparation),{headers:{'Content-Type':'text/html'}});
   if(mode==='json')return new Response('bad json',{headers:{'Content-Type':'application/json'}});
   if(mode==='position')preparation.positionPubkey=wallet;
   if(mode==='wire')preparation.serializedTxBase64='AA==';
   if(mode==='blockhash')preparation.txMetadata.blockhash=bs58.encode(Buffer.alloc(32,10));
   if(mode==='height')preparation.txMetadata.lastValidBlockHeight='1e3';
   if(mode==='expired')f.expire();
   return new Response(JSON.stringify(preparation),{headers:{'Content-Type':'application/json'}});
  };
  await assert.rejects(buildUnsignedServerPerpsFullClose(f.plan,{fetchImpl}),mode);assert.equal(calls,1);
 }
});
test('combined close path reads native ownership, builds once, inspects, simulates and checks wallet conservation without any signing/send transport',async()=>{
 for(const side of ['LONG','SHORT']){
  const f=await oracleEffectsFixture(side);let slotReads=0,builds=0;
  const request=async(method,params)=>{
   if(method==='getSlot')return ++slotReads===1?101:104;
   if(method==='getMultipleAccounts'&&params[0].length===8)return {context:{slot:100},value:params[0].map(address=>f.before.get(address)??null)};
   if(method==='getMultipleAccounts'&&params[0].length===2&&params[0][0]===PERPS_CUSTODIES.SOL.address)return {context:{slot:102},value:f.custodyAccounts};
   if(method==='getMultipleAccounts'&&[f.feeds[0].address,f.feeds[0].lazerFeed].includes(params[0][0]))return {context:{slot:104},value:params[0].map(key=>f.oracleAccounts.get(key)??null)};
   if(method==='getMinimumBalanceForRentExemption')return f.fundingRequest(method,params);
   return f.request(method,params);
  };
  const result=await prepareSimulatedServerPerpsFullClose(f.options,{request,now:()=>now*1000,monotonicNow:()=>0,fetchImpl:async()=>{
   builds++;return new Response(JSON.stringify(f.preparation),{headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(builds,1);assert.equal(result.stage,'FULL_CLOSE_SIMULATED_WALLET_ONLY');assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
  assert.equal(result.funding.rentRefundedLamports,'2000000');assert.equal(result.funding.receivedUsdcUnits,'8000000');
  assert.equal(result.requiresFullInstructionAndProtocolEffectsPolicy,true);assert.equal(result.requiresNativeReviewAndConfirmation,true);
  assert.equal(result.policy.stage,'FULL_CLOSE_INSTRUCTION_POLICY_ONLY');assert.equal(result.policy.readyForSigning,false);
  assert.equal(result.vaults.usdcVaultDebitUnits,'8000000');assert.equal(result.vaults.readyForSigning,false);
  assert.equal(result.reserves.removedShortSizeUsdUnits,side==='SHORT'?'30000000':'0');assert.equal(result.reserves.readyForSigning,false);
  assert.equal(result.oracleEffects.stage,'FULL_CLOSE_ORACLE_PRICE_EFFECTS_ONLY');assert.equal(result.oracleEffects.readyForSigning,false);
 }
});
async function inspectPolicyFixture(f,options={}){
 return inspectServerPerpsFullClosePreparation(preparationFixture(f,options),f.plan,{nowSeconds:now,request:async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return 101;assert.equal(method,'getMultipleAccounts');
  if(f.lookupFixture&&params[0][0]===f.lookupFixture.address)return {context:{slot:101},value:[f.lookupFixture.account]};
  return {context:{slot:102},value:f.custodyAccounts};
 }});
}
function addPolicyKey(f,key,write=false){
 const {envelope,resolvedKeys:keys}=f.inspection;
 if(keys.includes(key))return keys.indexOf(key);
 const at=write?3:keys.length;
 for(const ix of envelope.instructions){if(ix.program>=at)ix.program++;ix.accounts=ix.accounts.map(i=>i>=at?i+1:i);}
 keys.splice(at,0,key);envelope.staticKeys.splice(at,0,key);envelope.accountCount++;
 if(!write)envelope.readonlyUnsigned++;
 return at;
}
function ataInstruction(f,address,tokenOwner,mint){
 addPolicyKey(f,mint);
 const keys=f.inspection.resolvedKeys;
 return {program:keys.indexOf(ATA),accounts:[0,keys.indexOf(address),keys.indexOf(tokenOwner),keys.indexOf(mint),keys.indexOf(SYSTEM),keys.indexOf(TOKEN)],dataBase64:'AQ=='};
}
test('close instruction policy binds allowed idempotent setup and post-swap empty collateral cleanup without conferring authority',async()=>{
 const f=await boundFixture('LONG','SOL',1),keys=f.inspection.resolvedKeys,collateralAccount=keys[f.ix.accounts[3]];
 const collateralCreate=ataInstruction(f,collateralAccount,wallet,PERPS_CUSTODIES.SOL.mint);
 const recipientCreate=ataInstruction(f,f.recipient,wallet,PERPS_CUSTODIES.USDC.mint);
 f.inspection.envelope.instructions.splice(2,0,collateralCreate);
 f.inspection.envelope.instructions.splice(5,0,recipientCreate);
 f.inspection.envelope.instructions.push({program:keys.indexOf(TOKEN),accounts:[keys.indexOf(collateralAccount),0,0],dataBase64:'CQ=='});
 const inspection=await inspectPolicyFixture(f),result=checkServerPerpsFullCloseInstructionPolicy(inspection);
 assert.deepEqual(result.createdAccounts,[collateralAccount,f.recipient]);assert.equal(result.closedCollateralAccount,collateralAccount);
 assert.equal(result.readyForSigning,false);assert.equal(result.requiresProtocolAndOracleEffects,true);
 assert.equal(readServerPerpsFullClosePolicy(result).inspection,inspection);
 assert.throws(()=>readServerPerpsFullClosePolicy({...result}));f.expire();assert.throws(()=>readServerPerpsFullClosePolicy(result));
});
test('close policy rejects token spending, wrong cleanup, unexpected writable authority and malformed/late/duplicate setup',async()=>{
 for(const mode of ['transfer','approve','wrongDestination','earlyClose','unknownWrite','foreignAta','lateAta','duplicateAta','wrongAtaOwner']){
  const f=await boundFixture('LONG','SOL',1),keys=f.inspection.resolvedKeys,ixs=f.inspection.envelope.instructions,collateralAccount=keys[f.ix.accounts[3]];
  if(mode==='transfer'||mode==='approve')ixs.push({program:keys.indexOf(TOKEN),accounts:[keys.indexOf(f.recipient),keys.indexOf(collateralAccount),0],dataBase64:Buffer.from([mode==='transfer'?3:4,1,0,0,0,0,0,0,0]).toString('base64')});
  if(mode==='wrongDestination')ixs.push({program:keys.indexOf(TOKEN),accounts:[keys.indexOf(collateralAccount),1,0],dataBase64:'CQ=='});
  if(mode==='earlyClose')ixs.splice(2,0,{program:keys.indexOf(TOKEN),accounts:[keys.indexOf(collateralAccount),0,0],dataBase64:'CQ=='});
  if(mode==='unknownWrite')addPolicyKey(f,bs58.encode(Buffer.alloc(32,67)),true);
  if(mode==='foreignAta'){
   const address=bs58.encode(Buffer.alloc(32,68));addPolicyKey(f,address,true);
   ixs.splice(2,0,ataInstruction(f,address,wallet,PERPS_CUSTODIES.USDC.mint));
  }
  if(mode==='lateAta')ixs.push(ataInstruction(f,collateralAccount,wallet,PERPS_CUSTODIES.SOL.mint));
  if(mode==='duplicateAta'){
   const ix=ataInstruction(f,collateralAccount,wallet,PERPS_CUSTODIES.SOL.mint);ixs.splice(2,0,ix,structuredClone(ix));
  }
  if(mode==='wrongAtaOwner'){
   const ix=ataInstruction(f,collateralAccount,wallet,PERPS_CUSTODIES.SOL.mint);ix.accounts[2]=1;ixs.splice(2,0,ix);
  }
  const inspection=await inspectPolicyFixture(f);
  assert.throws(()=>checkServerPerpsFullCloseInstructionPolicy(inspection),mode);
 }
});
test('oracle update instructions cannot gain writable access to the pool or owner funds',async()=>{
 const DOVES='DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e';
 const f=await boundFixture('SHORT','SOL',1),program=addPolicyKey(f,DOVES),keys=f.inspection.resolvedKeys;
 f.inspection.envelope.instructions.splice(2,0,{program,accounts:[keys.indexOf(PERPS_POOL)],dataBase64:'AA=='});
 const inspection=await inspectPolicyFixture(f);
 assert.throws(()=>checkServerPerpsFullCloseInstructionPolicy(inspection));
});
async function oraclePolicyFixture(mutate=null){
 const f=await boundFixture('SHORT','SOL',1),byKey=new Map(),feeds=[];
 for(const [i,asset]of ['SOL','USDC'].entries()){
  const [address,bump]=f.agKeys[asset],lazerFeed=bs58.encode(Buffer.alloc(32,90+i)),clFeed=bs58.encode(Buffer.alloc(32,92+i)),redstoneFeed=bs58.encode(Buffer.alloc(32,94+i));
  const data=Buffer.alloc(394);Buffer.from('70f98bd9d7d0f936','hex').copy(data);Buffer.from(bs58.decode(PERPS_CUSTODIES[asset].mint)).copy(data,8);
  Buffer.from(bs58.decode(clFeed)).copy(data,72);data[201]=bump;Buffer.from(bs58.decode(lazerFeed)).copy(data,202);Buffer.from(bs58.decode(redstoneFeed)).copy(data,234);
  byKey.set(address,{owner:CLOSE_DOVES_PROGRAM,executable:false,lamports:3633120,data:[data.toString('base64'),'base64']});
  const price=Buffer.alloc(96);Buffer.from('bd67fc179823f39c','hex').copy(price);
  byKey.set(lazerFeed,{owner:CLOSE_DOVES_PROGRAM,executable:false,lamports:2860560,data:[price.toString('base64'),'base64']});
  feeds.push({address,lazerFeed,clFeed,redstoneFeed});
 }
 byKey.set(CLOSE_PYTH_LAZER.storage,{owner:CLOSE_PYTH_LAZER.program,executable:false,lamports:2000000,data:[Buffer.alloc(8).toString('base64'),'base64']});
 byKey.set(CLOSE_PYTH_LAZER.treasury,{owner:SYSTEM,executable:false,lamports:2000000,data:['','base64']});
 const ED='Ed25519SigVerify111111111111111111111111111',feed=feeds[0];
 for(const key of [CLOSE_DOVES_PROGRAM,ED,CLOSE_PYTH_LAZER.storage,CLOSE_PYTH_LAZER.treasury,CLOSE_PYTH_LAZER.program,'Sysvar1nstructions1111111111111111111111111',feed.lazerFeed,feed.clFeed,feed.redstoneFeed])addPolicyKey(f,key);
 f.inspection.envelope.readonlySigned=1;
 const keys=f.inspection.resolvedKeys,index=key=>keys.indexOf(key),oracleKey=generateKeyPairSync('ed25519'),payload=Buffer.from([0]);
 const edData=Buffer.alloc(113);edData[0]=1;
 for(const [offset,value]of [[2,48],[4,65535],[6,16],[8,65535],[10,112],[12,1],[14,65535]])edData.writeUInt16LE(value,offset);
 oracleKey.publicKey.export({format:'der',type:'spki'}).subarray(-32).copy(edData,16);sign(null,payload,oracleKey.privateKey).copy(edData,48);payload.copy(edData,112);
 const ed={program:index(ED),accounts:[],dataBase64:edData.toString('base64')};
 const data=Buffer.alloc(17);Buffer.from('cb3b5fb0ec154999','hex').copy(data);data.writeUInt32LE(1,8);data.writeUInt16LE(2,13);data[16]=1;
 const many={program:index(CLOSE_DOVES_PROGRAM),accounts:[1,index(CLOSE_PYTH_LAZER.storage),index(CLOSE_PYTH_LAZER.treasury),index(CLOSE_PYTH_LAZER.program),index(SYSTEM),index('Sysvar1nstructions1111111111111111111111111'),index(feed.lazerFeed)],dataBase64:data.toString('base64')};
 const ag={program:index(CLOSE_DOVES_PROGRAM),accounts:[1,index(feed.address),index(feed.lazerFeed),index(feed.clFeed),index(feed.redstoneFeed)],dataBase64:Buffer.from('3d413ce5eb8efa75','hex').toString('base64')};
 f.inspection.envelope.instructions.splice(2,0,ed,many,ag);
 if(mutate)mutate({f,many,ag,ed,byKey,feed});
 const inspection=await inspectPolicyFixture(f,{useLookup:true,writableKeys:[feed.address,feed.lazerFeed,CLOSE_PYTH_LAZER.treasury]});
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  assert.equal(method,'getMultipleAccounts');return {context:{slot:params[0][0]===feeds[0].address?103:104},value:params[0].map(key=>byKey.get(key)??null)};
 };
 return {f,inspection,request,byKey};
}
test('oracle context independently binds derived aggregate feeds, configured Lazer feeds and official Pyth treasury before accepting update capabilities',async()=>{
 const f=await oraclePolicyFixture(),context=await readServerPerpsCloseOracles(f.inspection,{request:f.request});
 assert.equal(context.observedSlot,104);assert.equal(context.feeds.length,2);assert.equal(context.treasury,CLOSE_PYTH_LAZER.treasury);
 assert.equal(context.readyForSigning,false);assert.equal(context.requiresOraclePayloadAndEffects,true);
 const result=checkServerPerpsFullCloseInstructionPolicy(f.inspection,{oracleContext:context});
 assert.equal(result.readyForSigning,false);assert.equal(result.requiresProtocolAndOracleEffects,true);
 assert.equal(readServerPerpsCloseOracleContext(context,f.inspection).inspection,f.inspection);
 assert.throws(()=>readServerPerpsCloseOracleContext({...context},f.inspection));
 assert.throws(()=>checkServerPerpsFullCloseInstructionPolicy(f.inspection));
});
test('configured oracle ownership/mint/bump/feed and exact update roles or signature references cannot be substituted',async()=>{
 for(const mode of ['mint','bump','owner','lazerOwner','treasuryOwner','storageOwner','treasuryRole','bufferRole','clRole','signatureIndex','edIndex']){
  const fixture=await oraclePolicyFixture(({f,many,ag,byKey,feed})=>{
   if(['mint','bump'].includes(mode)){
    const account=byKey.get(feed.address),data=Buffer.from(account.data[0],'base64');data[mode==='mint'?8:201]^=1;account.data[0]=data.toString('base64');
   }
   if(mode==='owner')byKey.get(feed.address).owner=SYSTEM;
   if(mode==='lazerOwner')byKey.get(feed.lazerFeed).owner=SYSTEM;
   if(mode==='treasuryOwner')byKey.get(CLOSE_PYTH_LAZER.treasury).owner=CLOSE_DOVES_PROGRAM;
   if(mode==='storageOwner')byKey.get(CLOSE_PYTH_LAZER.storage).owner=SYSTEM;
   if(mode==='treasuryRole')many.accounts[2]=f.ix.accounts[3];
   if(mode==='bufferRole')many.accounts[6]=f.inspection.resolvedKeys.indexOf(PERPS_POOL);
   if(mode==='clRole')ag.accounts[3]=f.inspection.resolvedKeys.indexOf(PERPS_POOL);
   if(mode==='signatureIndex'||mode==='edIndex'){
    const data=Buffer.from(many.dataBase64,'base64');if(mode==='signatureIndex')data[15]=1;else data.writeUInt16LE(3,13);many.dataBase64=data.toString('base64');
   }
  });
  if(['mint','bump','owner','lazerOwner','treasuryOwner','storageOwner'].includes(mode))await assert.rejects(readServerPerpsCloseOracles(fixture.inspection,{request:fixture.request}),mode);
  else{
   const context=await readServerPerpsCloseOracles(fixture.inspection,{request:fixture.request});
   assert.throws(()=>checkServerPerpsFullCloseInstructionPolicy(fixture.inspection,{oracleContext:context}),mode);
  }
 }
});
test('close vault checks bind all six market/direction paths to the exact wallet payout without signing authority',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const f=await fundingFixture(side,asset),policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection);
  const simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest});
  const result=await checkServerPerpsFullCloseVaults(funding,policy);
  assert.equal(result.usdcVaultDebitUnits,'8000000');assert.equal(result.collateralVaultNetDebitUnits,side==='LONG'?'0':'8000000');
  assert.equal(result.readyForSigning,false);assert.equal(result.requiresPoolAccountingAndOracleEffects,true);
  assert.equal(readServerPerpsFullCloseVaults(result).funding,funding);
  assert.throws(()=>readServerPerpsFullCloseVaults({...result}));f.expire();assert.throws(()=>readServerPerpsFullCloseVaults(result));
 }
});
test('vault conservation rejects wrong mint/authority, altered custody/pool, unaccounted vault debit and native balance loss',async()=>{
 for(const mode of ['poolOwner','poolTag','poolRent','poolSize','custodyConfig','custodyRent','usdcDebit','vaultAuthority','vaultDelegate','vaultMint','vaultRent','collateralDebit','nativeUnderfunded','vaultProgram']){
  const f=await fundingFixture('LONG');
  if(mode==='poolOwner')f.after.get(PERPS_POOL).owner=SYSTEM;
  if(mode==='poolTag'){
   const a=f.after.get(PERPS_POOL),b=Buffer.from(a.data[0],'base64');b[0]^=1;a.data[0]=b.toString('base64');
  }
  if(mode==='poolRent')f.after.get(PERPS_POOL).lamports++;
  if(mode==='poolSize'){
   const a=f.after.get(PERPS_POOL);a.data[0]=Buffer.concat([Buffer.from(a.data[0],'base64'),Buffer.from([0])]).toString('base64');
  }
  if(mode==='custodyConfig'){
   const a=f.after.get(f.market.address),b=Buffer.from(a.data[0],'base64');b[72]^=1;a.data[0]=b.toString('base64');
  }
  if(mode==='custodyRent')f.after.get(f.usdc.address).lamports++;
  if(mode==='usdcDebit')f.after.set(f.usdc.tokenAccount,f.tokenFor(f.ids.transferAuthority,PERPS_CUSTODIES.USDC.mint,991999999n));
  if(['vaultAuthority','vaultDelegate','vaultMint','vaultProgram'].includes(mode)){
   for(const map of [f.before,f.after]){
    const a=map.get(f.usdc.tokenAccount),b=Buffer.from(a.data[0],'base64');
    if(mode==='vaultAuthority')Buffer.alloc(32,70).copy(b,32);
    if(mode==='vaultDelegate'){b.writeUInt32LE(1,72);Buffer.alloc(32,70).copy(b,76);}
    if(mode==='vaultMint')Buffer.from(bs58.decode(PERPS_CUSTODIES.ETH.mint)).copy(b);
    if(mode==='vaultProgram')a.owner='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
    a.data[0]=b.toString('base64');
   }
  }
  if(mode==='vaultRent')f.after.get(f.usdc.tokenAccount).lamports++;
  if(mode==='collateralDebit'){
   const a=f.after.get(f.collateral.tokenAccount),b=Buffer.from(a.data[0],'base64');b.writeBigUInt64LE(999999999n,64);a.data[0]=b.toString('base64');
  }
  if(mode==='nativeUnderfunded')f.after.get(f.collateral.tokenAccount).lamports=1;
  const policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection),simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest});
  await assert.rejects(checkServerPerpsFullCloseVaults(funding,policy),mode);
 }
});
test('legitimate unsynchronized WSOL excess is preserved or exactly refunded, never treated as spendable token amount',async()=>{
 for(const close of [false,true]){
  const f=await fundingFixture('LONG'),address=f.inspection.bindings.collateralAccount;
  f.before.get(address).lamports+=7;
  if(close){f.after.set(address,null);f.after.get(wallet).lamports+=2039287;}
  else f.after.get(address).lamports+=7;
  const simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest});
  assert.equal(funding.rentRefundedLamports,close?'4039287':'2000000');assert.equal(funding.receivedUsdcUnits,'8000000');
  const policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection);
  assert.equal((await checkServerPerpsFullCloseVaults(funding,policy)).readyForSigning,false);
 }
 const f=await fundingFixture('LONG'),address=f.inspection.bindings.requestAta;
 const a=f.tokenFor(f.inspection.bindings.requestAddress,PERPS_CUSTODIES.SOL.mint),b=Buffer.from(a.data[0],'base64');b.writeBigUInt64LE(2039279n,113);a.data[0]=b.toString('base64');
 f.after.set(address,a);f.after.get(wallet).lamports-=2039280;
 const simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
 await assert.rejects(checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest}));
});
test('vault proofs cannot mix a policy from another exact transaction',async()=>{
 const f=await fundingFixture(),other=await fundingFixture(),simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
 const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest}),foreignPolicy=checkServerPerpsFullCloseInstructionPolicy(other.inspection);
 await assert.rejects(checkServerPerpsFullCloseVaults(funding,foreignPolicy));
});
test('full closes release exactly their own locked collateral and remove only their market short exposure across six paths',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const f=await fundingFixture(side,asset),policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection),simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest}),vaults=await checkServerPerpsFullCloseVaults(funding,policy);
  const result=checkServerPerpsFullCloseReserves(vaults);
  assert.equal(result.releasedCollateralTokenUnits,f.account.positions[0].lockedTokenUnits);assert.equal(result.removedShortSizeUsdUnits,side==='SHORT'?'30000000':'0');
  assert.equal(result.readyForSigning,false);assert.equal(result.requiresRemainingPoolEconomicsAndOracleEffects,true);
  assert.equal(readServerPerpsFullCloseReserves(result).vaults,vaults);assert.throws(()=>readServerPerpsFullCloseReserves({...result}));f.expire();assert.throws(()=>readServerPerpsFullCloseReserves(result));
 }
});
test('reserve checks reject one-unit mistakes, effects on other exposures, regressed interest and a position interest snapshot ahead of custody',async()=>{
 for(const side of ['LONG','SHORT'])for(const mode of ['ownLocked','otherLocked','marketShort','otherShort','average','interest','updated','snapshot']){
  const f=await fundingFixture(side),custody=mode==='otherLocked'?(side==='LONG'?f.usdc:f.market):mode==='otherShort'?f.usdc:mode==='snapshot'?f.collateral:mode==='average'&&side==='SHORT'?f.usdc:f.market;
  const target=mode==='snapshot'?f.before:f.after,a=target.get(custody.address),data=Buffer.from(a.data[0],'base64');
  if(mode==='ownLocked'){
   const own=f.after.get(f.collateral.address),bytes=Buffer.from(own.data[0],'base64');bytes.writeBigUInt64LE(bytes.readBigUInt64LE(230)+1n,230);own.data[0]=bytes.toString('base64');
  }else{
   if(mode==='otherLocked')data.writeBigUInt64LE(data.readBigUInt64LE(230)+1n,230);
   if(mode==='marketShort'||mode==='otherShort')data.writeBigUInt64LE(data.readBigUInt64LE(246)+1n,246);
   if(mode==='average')data.writeBigUInt64LE(data.readBigUInt64LE(254)+1n,254);
   if(mode==='interest'||mode==='snapshot')data.writeBigUInt64LE(999n,262);
   if(mode==='updated')data.writeBigInt64LE(999n,278);
   a.data[0]=data.toString('base64');
  }
  const policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection),simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
  const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest}),vaults=await checkServerPerpsFullCloseVaults(funding,policy);
  assert.throws(()=>checkServerPerpsFullCloseReserves(vaults),side+':'+mode);
 }
});
test('a retained closed position cannot keep locked collateral or nonzero realized PNL',async()=>{
 for(const mode of ['locked','realised']){
  const f=await fundingFixture(),a=structuredClone(f.nativePositionAccount),data=Buffer.from(a.data[0],'base64');
  data.writeBigUInt64LE(0n,161);data.writeBigUInt64LE(0n,169);data.writeBigUInt64LE(mode==='locked'?1n:0n,201);data.writeBigInt64LE(mode==='realised'?1n:0n,177);a.data[0]=data.toString('base64');f.after.set(f.ids.position,a);
  await assert.rejects(simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request}));
 }
});
test('close core diagnostics distinguish price, time, size and whole-position rejection without relaxing any guard',async()=>{
 const f=await fixture(),plan=planServerPerpsFullClose(f.account,f.options);
 for(const [patch,code]of [[{price:99499999n},'PRICE'],[{time:BigInt(now)-31n},'TIME'],[{size:30000001n},'SIZE'],[{entire:0},'ENTIRE_POSITION']]){
  assert.throws(()=>checkServerPerpsFullCloseCore(core(1,patch),plan,now),{message:'PERPS_CLOSE_CORE_'+code});
 }
});
test('close snapshots discard different confirmed banks and pair only the same exact bank without rebuilding or sending',async()=>{
 const f=await fundingFixture(),banks=[],requests=[];let pairs=0;
 const request=async(method,params)=>{
  requests.push(method);
  if(method==='getMultipleAccounts'){
   const bank=pairs===0?105:106;banks.push(bank);
   return {context:{slot:bank},value:params[0].map(address=>f.before.get(address)??null)};
  }
  if(method==='simulateTransaction'){
   pairs++;assert.equal(params[0],f.preparation.serializedTxBase64);assert.equal(params[1].replaceRecentBlockhash,false);assert.equal(params[1].sigVerify,false);
   assert.equal(params[1].minContextSlot,pairs===1?105:106);
   return {context:{slot:106},value:{err:null,unitsConsumed:400000,accounts:params[1].accounts.addresses.map(address=>f.after.get(address)??null)}};
  }
  return f.request(method,params);
 };
 const simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request});
 assert.equal(simulation.snapshotBankAttempts,2);assert.equal(simulation.observedSlot,106);
 const proof=readServerPerpsFullCloseSimulation(simulation);assert.equal(proof.beforeSlot,106);assert.equal(proof.simulationSlot,106);
 assert.deepEqual(banks,[105,106]);assert.equal(requests.filter(method=>method==='getFeeForMessage').length,1);
 const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest}),policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection);
 const vaults=await checkServerPerpsFullCloseVaults(funding,policy);assert.equal(checkServerPerpsFullCloseReserves(vaults).readyForSigning,false);
});
test('bank pairing is bounded, never replaces the wire and does not retry a simulation error',async()=>{
 for(const mode of ['movingBank','simulationError']){
  const f=await simulationFixture();let attempts=0;
  const request=async(method,params)=>{
   if(method==='getMultipleAccounts')return {context:{slot:105+attempts},value:params[0].map(address=>f.before.get(address)??null)};
   if(method==='simulateTransaction'){
    attempts++;assert.equal(params[0],f.preparation.serializedTxBase64);
    return {context:{slot:105+attempts},value:{err:mode==='simulationError'?{InstructionError:[2,'Custom']}:null,unitsConsumed:400000,accounts:params[1].accounts.addresses.map(address=>f.after.get(address)??null)}};
   }
   return f.request(method,params);
  };
  if(mode==='movingBank')await assert.rejects(simulateServerPerpsFullCloseEffects(f.inspection,{request}),{message:'PERPS_CLOSE_SNAPSHOT_BANK_CHANGED'});
  else await assert.rejects(simulateServerPerpsFullCloseEffects(f.inspection,{request}));
  assert.equal(attempts,mode==='movingBank'?3:1);
 }
});

async function closeJournalFixture(t,{parents=2,side='SHORT',settlement='DIRECT_USDC'}={}){
 const f=await oracleEffectsFixture(side,'SOL',settlement),reserves=await f.reserves(),oracleEffects=checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:now});
 const directory=mkdtempSync(join(tmpdir(),'jamd-close-journal-')),path=join(directory,'journal.sqlite'),journals=[];
 const open=()=>{const journal=openPerpsExecutionJournal(path,{now:()=>now*1000});journals.push(journal);return journal;};
 t.after(()=>{for(const j of journals)try{j.close();}catch{}rmSync(directory,{recursive:true,force:true});});
 const journal=open(),raw=new DatabaseSync(path);
 for(let i=0;i<parents;i++)raw.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated,signature,wire_hash,position_address,confirmed_slot,entry_exit_plan) VALUES(?,?,?,?,?,'OPEN',?,?,?,?,?,?,?)")
  .run(wallet,'signal-'+i,'entry-'+i,new Date(now*1000).toISOString().slice(0,10),10000000,now*1000,now*1000,
   bs58.encode(Buffer.alloc(64,80+i)),String(i).repeat(64),f.ids.position,100,JSON.stringify({sizeUsdUnits:'15000000',exits:[]}));
 raw.close();return {...f,journal,path,open,reserves,oracleEffects};
}

test('prepared full close persists exact wire and all position entries across restart without releasing risk',async t=>{
 const f=await closeJournalFixture(t),risk=f.journal.riskState(wallet),row=f.journal.preparePositionClose('close-one',f.oracleEffects);
 assert.equal(row.state,'PREPARED');assert.equal(row.wallet,wallet);assert.equal(row.position,f.ids.position);
 assert.equal(row.fee_lamports,5000);assert.equal(row.unsigned_wire_hash,createHash('sha256').update(Buffer.from(f.preparation.serializedTxBase64,'base64')).digest('hex'));
 assert.deepEqual(JSON.parse(row.entries).map(e=>e.reservation),['entry-0','entry-1']);
 assert.deepEqual(f.journal.riskState(wallet),risk);assert(f.journal.openPositions(wallet).every(e=>e.state==='OPEN'));
 const other=f.open();assert.deepEqual(other.readPositionClose('close-one'),row);assert.equal(other.pendingPositionCloses(wallet).length,1);
 assert.throws(()=>other.preparePositionClose('duplicate',f.oracleEffects),/RECONCILIATION_REQUIRED/);
 assert.equal(typeof other.beginPositionCloseSigning,'undefined');assert.equal(typeof other.recordPositionCloseBroadcast,'undefined');
 assert.throws(()=>other.reserve({walletAddress:wallet,signalId:'next',reservationId:'next',marginUsd:'10',limits:{capitalUsd:'100',dailyLossUsd:'100',positions:10,dailyTrades:10},
  snapshot:{walletAddress:wallet,network:'solana-mainnet',balancesComplete:true,day:new Date(now*1000).toISOString().slice(0,10),observedAt:now*1000,
   availableUsdcUnits:'100000000',allocatedUsdcUnits:'20000000',lossTodayUsdcUnits:'0',openPositions:2,tradesToday:2}}),/RECONCILIATION_REQUIRED/);
 assert.equal(other.cancelPreparedPositionClose('close-one').state,'CANCELLED');assert.equal(other.pendingPositionCloses(wallet).length,0);
 assert.throws(()=>other.cancelPreparedPositionClose('close-one'),/RECONCILIATION_REQUIRED/);
 assert.deepEqual(other.riskState(wallet),risk);
 f.journal.close();assert.equal(f.open().readPositionClose('close-one').state,'CANCELLED');
});

test('collateral-only close records its required second leg durably, keeps parent risk and can cancel only unsigned preparation',async t=>{
 const f=await closeJournalFixture(t,{side:'LONG',settlement:'COLLATERAL_THEN_USDC'}),risk=f.journal.riskState(wallet);
 const row=f.journal.preparePositionClose('two-step',f.oracleEffects),settlement=JSON.parse(row.settlement);
 assert.equal(row.state,'PREPARED');assert.equal(settlement.conversionRequired,true);
 assert.equal(settlement.estimatedCollateralUnits,'8000000');assert.equal(settlement.estimatedUsdcUnits,'0');
 assert.equal(settlement.receiveAsset,'SOL');assert.equal(settlement.receiveAccount,wallet);
 assert.equal(settlement.mode,'COLLATERAL_THEN_USDC');
 assert.equal(f.open().readPositionClose('two-step').settlement,row.settlement);
 assert.equal(f.journal.pendingPositionCloses(wallet).length,1);
 assert.deepEqual(f.journal.riskState(wallet),risk);
 assert.equal(f.journal.cancelPreparedPositionClose('two-step').state,'CANCELLED');
 assert.deepEqual(f.journal.riskState(wallet),risk);
 assert.equal(typeof f.journal.recordCloseSettlement,'undefined');
});

test('settlement description is canonical, distinguishes all six payouts and cannot be forged into finalized proceeds',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const f=await oracleEffectsFixture(side,asset,'COLLATERAL_THEN_USDC'),reserves=await f.reserves();
  const effects=checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:now});
  const description=describeSimulatedPerpsCloseSettlement(effects),v=JSON.parse(description.encoded);
  assert.equal(description.readyForSigning,false);assert.equal(description.requiresFinalizedCloseReceipt,true);
  assert.equal(v.conversionRequired,side==='LONG');assert.equal(v.receiveAsset,side==='LONG'?asset:'USDC');
  assert.equal(v.delivery,side==='LONG'&&asset==='SOL'?'NATIVE_SOL':'TOKEN');
  assert.equal(canonicalPerpsCloseSettlement(v,f.plan),description.encoded);
  assert.throws(()=>describeSimulatedPerpsCloseSettlement({...effects}));
  for(const patch of [{mode:'AUTO'},{conversionRequired:!v.conversionRequired},{estimatedCollateralUnits:'01'},
   {receiveMint:wallet},{walletAddress:f.ids.position},{positionAddress:wallet},{closePriceLimitUsdUnits:'0'},
   {phase:'SETTLED'},{delivery:'AUTO'},side==='LONG'?{estimatedUsdcUnits:'1'}:{estimatedCollateralUnits:'1'}])assert.throws(()=>canonicalPerpsCloseSettlement({...v,...patch},f.plan));
 }
});

test('undocumented oracle extension mutations still fail closed in the chosen collateral route',async()=>{
 const f=await oracleEffectsFixture('LONG','SOL','COLLATERAL_THEN_USDC'),feed=f.context.feeds[0];
 const account=f.after.get(feed.lazerFeed),data=Buffer.from(account.data[0],'base64');
 data[96]=1;account.data[0]=data.toString('base64');
 const reserves=await f.reserves();
 assert.throws(()=>checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:now}),/UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS_CONFIGURATION/);
});

test('close preparation requires original fresh reserve proof and confirmed journal parents',async t=>{
 const f=await closeJournalFixture(t);
 for(const proof of [null,f.reserves,{...f.oracleEffects},{readyForSigning:true}])assert.throws(()=>f.journal.preparePositionClose('forged',proof));
 assert.equal(f.journal.pendingPositionCloses(wallet).length,0);
 f.expire();assert.throws(()=>f.journal.preparePositionClose('expired',f.oracleEffects));
 const empty=await closeJournalFixture(t,{parents:0});assert.throws(()=>empty.journal.preparePositionClose('unowned',empty.oracleEffects),/VERIFIED_RECONCILIATION_REQUIRED/);
 for(const fault of ['state','wallet','position','slot','legacy']){
  const a=await closeJournalFixture(t,{parents:1}),raw=new DatabaseSync(a.path);
  const sql={state:"UPDATE perps_reservations SET state='CLOSED'",wallet:`UPDATE perps_reservations SET wallet='${bs58.encode(Buffer.alloc(32,3))}'`,
   position:`UPDATE perps_reservations SET position_address='${bs58.encode(Buffer.alloc(32,4))}'`,slot:'UPDATE perps_reservations SET confirmed_slot=106',legacy:'UPDATE perps_reservations SET entry_exit_plan=NULL'};
  raw.exec(sql[fault]);raw.close();assert.throws(()=>a.journal.preparePositionClose('bad-parent',a.oracleEffects),/VERIFIED_RECONCILIATION_REQUIRED/);
 }
});

test('an outstanding entry or cancellation blocks close preparation atomically',async t=>{
 for(const state of ['RESERVED','SIGNING','UNCERTAIN','cancellation']){
  const f=await closeJournalFixture(t,{parents:1}),raw=new DatabaseSync(f.path);
  if(state==='cancellation'){
   const address=bs58.encode(Buffer.alloc(32,90));raw.prepare('INSERT INTO perps_exit_request_bindings(address,reservation) VALUES(?,?)').run(address,'entry-0');
   raw.prepare("INSERT INTO perps_exit_cancellations(id,address,reservation,wallet,state,created,updated,fee_lamports,unsigned_wire_hash) VALUES(?,?,?,?,'PREPARED',?,?,?,?)")
    .run('cancel',address,'entry-0',wallet,now*1000,now*1000,5000,'b'.repeat(64));
  }else raw.prepare('INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated) VALUES(?,?,?,?,?,?,?,?)')
   .run(wallet,'pending','pending',new Date(now*1000).toISOString().slice(0,10),10000000,state,now*1000,now*1000);
  raw.close();assert.throws(()=>f.journal.preparePositionClose('blocked',f.oracleEffects),/RECONCILIATION_REQUIRED/);
  assert.equal(f.journal.pendingPositionCloses(wallet).length,0);assert.equal(f.journal.read('entry-0').state,'OPEN');
 }
});

async function oracleEffectsFixture(side='SHORT',asset='SOL',settlement='DIRECT_USDC'){
 const f=await fundingFixture(side,asset,settlement),oracleAccounts=new Map(),feeds=[];
 for(const [i,a]of [asset,'USDC'].entries()){
  const [address,bump]=f.agKeys[a],lazerFeed=bs58.encode(Buffer.alloc(32,110+i));
  const data=Buffer.alloc(394);Buffer.from('70f98bd9d7d0f936','hex').copy(data);
  Buffer.from(bs58.decode(PERPS_CUSTODIES[a].mint)).copy(data,8);
  data[201]=bump;Buffer.from(bs58.decode(lazerFeed)).copy(data,202);
  const value=a==='USDC'?100000000n:10000000000n;
  data.writeBigUInt64LE(value,168);data.writeInt8(-8,176);data.writeBigInt64LE(BigInt(now)-1n,177);data.writeUInt32LE(10,185);data.writeUInt32LE(60,189);
  const ag={owner:CLOSE_DOVES_PROGRAM,executable:false,lamports:3633120,data:[data.toString('base64'),'base64']};
  const p=Buffer.alloc(283);Buffer.from('bd67fc179823f39c','hex').copy(p);p.writeBigUInt64LE(value,73);p.writeInt8(-8,81);p.writeBigInt64LE(BigInt(now)-1n,82);
  const feed={owner:CLOSE_DOVES_PROGRAM,executable:false,lamports:2860560,data:[p.toString('base64'),'base64']};
  oracleAccounts.set(address,ag);oracleAccounts.set(lazerFeed,feed);feeds.push({address,lazerFeed});
  for(const [key,account]of [[address,ag],[lazerFeed,feed]]){f.before.set(key,account);f.after.set(key,structuredClone(account));}
 }
 oracleAccounts.set(CLOSE_PYTH_LAZER.storage,{owner:CLOSE_PYTH_LAZER.program,executable:false,lamports:2000000,data:[Buffer.alloc(8).toString('base64'),'base64']});
 oracleAccounts.set(CLOSE_PYTH_LAZER.treasury,{owner:SYSTEM,executable:false,lamports:2000000,data:['','base64']});
 const context=await readServerPerpsCloseOracles(f.inspection,{request:async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  assert.equal(method,'getMultipleAccounts');return {context:{slot:104},value:params[0].map(key=>oracleAccounts.get(key)??null)};
 }});
 const policy=checkServerPerpsFullCloseInstructionPolicy(f.inspection,{oracleContext:context});
 async function reserves(){
  const request=(method,params)=>method==='getSlot'?104:f.request(method,params);
  const simulation=await simulateServerPerpsFullCloseEffects(f.inspection,{request,oracleContext:context,minimumSlot:104});
  const funding=await checkServerPerpsFullCloseFunding(simulation,{request:f.fundingRequest});
  return checkServerPerpsFullCloseReserves(await checkServerPerpsFullCloseVaults(funding,policy));
 }
 return {...f,context,feeds,reserves,oracleAccounts};
}

test('close oracle effects use exact-bank prices and immutable native configuration across all six paths',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const f=await oracleEffectsFixture(side,asset),reserves=await f.reserves(),result=checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:now});
  assert.equal(result.stage,'FULL_CLOSE_ORACLE_PRICE_EFFECTS_ONLY');assert.equal(result.observedSlot,105);
  assert.equal(result.prices[0].priceLowerUsdUnits,'100000000');assert.equal(result.prices[1].priceLowerUsdUnits,'1000000');
  assert.equal(result.readyForSigning,false);assert.equal(result.requiresOraclePayloadProvenance,true);
  assert.equal(readServerPerpsFullCloseOracleEffects(result).reserves,reserves);
  assert.throws(()=>readServerPerpsFullCloseOracleEffects({...result}));f.expire();assert.throws(()=>readServerPerpsFullCloseOracleEffects(result));
 }
});

test('oracle effects reject stale, future, regressed and invalid prices, config changes and lamport loss',async()=>{
 for(const mode of ['stale','future','regressed','zero','exponent','config','lamports','missing','feedStale','feedConfig','feedRegressed','feedZero']){
  const f=await oracleEffectsFixture(),key=mode.startsWith('feed')?f.feeds[0].lazerFeed:f.feeds[0].address;
  const account=f.after.get(key),data=Buffer.from(account.data[0],'base64');
  if(mode==='stale')data.writeBigInt64LE(BigInt(now)-11n,177);
  if(mode==='future')data.writeBigInt64LE(BigInt(now)+3n,177);
  if(mode==='regressed')data.writeBigInt64LE(BigInt(now)-2n,177);
  if(mode==='zero')data.writeBigUInt64LE(0n,168);
  if(mode==='exponent')data.writeInt8(-19,176);
  if(mode==='config')data[8]^=1;
  if(mode==='lamports')account.lamports--;
  if(mode==='feedStale')data.writeBigInt64LE(BigInt(now)-61n,82);
  if(mode==='feedConfig')data[10]^=1;
  if(mode==='feedRegressed')data.writeBigInt64LE(BigInt(now)-2n,82);
  if(mode==='feedZero')data.writeBigUInt64LE(0n,73);
  account.data[0]=data.toString('base64');if(mode==='missing')f.after.set(key,null);
  const reserves=await f.reserves();assert.throws(()=>checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:now}),/UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS/,mode);
 }
});

test('actual simulated market price must satisfy the compiled LONG floor or SHORT ceiling with inward microUSD rounding',async()=>{
 for(const side of ['LONG','SHORT']){
  const f=await oracleEffectsFixture(side),account=f.after.get(f.feeds[0].address),data=Buffer.from(account.data[0],'base64');
  // One ten-thousandth of a microUSD outside the compiled integer bound must
  // not be rounded into an apparent successful execution price.
  data.writeInt8(-10,176);data.writeBigUInt64LE(side==='LONG'?994999999999n:1005000000001n,168);account.data[0]=data.toString('base64');
  const reserves=await f.reserves();assert.throws(()=>checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:now}),/UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS/);
 }
});

test('oracle effects cannot be skipped, copied from a different inspection or paired with an older simulation bank',async()=>{
 const f=await oracleEffectsFixture(),other=await oracleEffectsFixture();
 for(const oracleContext of [{...f.context},other.context])await assert.rejects(simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request,oracleContext,minimumSlot:104}));
 await assert.rejects(simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request,oracleContext:f.context,minimumSlot:103}));
 const old=await fundingFixture(),simulation=await simulateServerPerpsFullCloseEffects(old.inspection,{request:old.request});
 const funding=await checkServerPerpsFullCloseFunding(simulation,{request:old.fundingRequest});
 const vaults=await checkServerPerpsFullCloseVaults(funding,checkServerPerpsFullCloseInstructionPolicy(old.inspection));
 assert.throws(()=>checkServerPerpsFullCloseOracleEffects(checkServerPerpsFullCloseReserves(vaults),{nowSeconds:now}));
 const valid=await f.reserves();
 for(const nowSeconds of [undefined,NaN,now+0.5,29])assert.throws(()=>checkServerPerpsFullCloseOracleEffects(valid,{nowSeconds}),/UNVERIFIED_PERPS_CLOSE_ORACLE_EFFECTS/);
});
