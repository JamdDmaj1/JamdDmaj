import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities,decodeServerPerpsCustody} from '../lib/perps-server-custody.js';
import {planServerPerpsFullClose,requireFreshServerPerpsFullClosePlan,checkServerPerpsFullCloseCore} from '../lib/perps-server-close-intent.js';
import {checkServerPerpsFullCloseBindings,inspectServerPerpsFullClosePreparation} from '../lib/perps-server-close-bindings.js';
import {simulateServerPerpsFullCloseEffects,readServerPerpsFullCloseSimulation} from '../lib/perps-server-close-simulation.js';
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
 assert.equal(idl.closePostSwapInstructionLayout.swapWithTokenLedger.discriminatorHex,'8b8deec529d3ac13');
 assert.equal(idl.closePostSwapInstructionLayout.swapWithTokenLedger.bytes,16);
 assert.equal(idl.closePostSwapInstructionLayout.swapWithTokenLedger.accounts.length,17);
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
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
async function boundFixture(side='LONG',asset='SOL',version=1){
 const f=await fixture(side,asset),plan=planServerPerpsFullClose(f.account,f.options);
 function custody(asset){
  const id=PERPS_CUSTODIES[asset],n=['BTC','ETH','SOL','USDC'].indexOf(asset),data=Buffer.alloc(416);
  Buffer.from('01b830515d833f91','hex').copy(data);Buffer.from(bs58.decode(PERPS_POOL)).copy(data,8);Buffer.from(bs58.decode(id.mint)).copy(data,40);
  Buffer.alloc(32,20+n).copy(data,72);data[104]=id.decimals;data[105]=Number(id.stable);Buffer.alloc(32,30+n).copy(data,106);data[138]=2;
  data.writeBigUInt64LE(500000n,175);data[199]=1;data[202]=1;data[203]=1;Buffer.alloc(32,40+n).copy(data,384);
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
 const writes=[...new Set([...writeRoles.map(i=>roles[i]),...(side==='LONG'?[recipient,usdc.address,usdc.tokenAccount,ledger]:[])])];
 const reads=[...new Set([...roles,...(side==='LONG'?swapRoles:[]),COMPUTE].filter(key=>![wallet,keeper,api,...writes].includes(key)))];
 const keys=[wallet,keeper,api,...writes,...reads];
 const unit=Buffer.alloc(5);unit[0]=2;unit.writeUInt32LE(1000000,1);
 const price=Buffer.alloc(9);price[0]=3;price.writeBigUInt64LE(1n,1);
 const ix={program:keys.indexOf(PERPS_PROGRAM),accounts:roles.map(key=>keys.indexOf(key)),dataBase64:core(version,{price:BigInt(plan.priceLimitUsdUnits)})};
 const instruction=(roles,data)=>({program:keys.indexOf(PERPS_PROGRAM),accounts:roles.map(key=>keys.indexOf(key)),dataBase64:data.toString('base64')});
 const ledgerIx=instruction([ledger,collateralAccount,TOKEN],Buffer.from('e455b9704e4f4d02','hex'));
 const swapIx=instruction(swapRoles,Buffer.from('8b8deec529d3ac130000000000000000','hex'));
 const envelope={stage:'STRUCTURE_ONLY',staticKeys:[...keys],accountCount:keys.length,readonlySigned:2,readonlyUnsigned:reads.length,lookups:[],instructions:[
  {program:keys.indexOf(COMPUTE),accounts:[],dataBase64:unit.toString('base64')},
  {program:keys.indexOf(COMPUTE),accounts:[],dataBase64:price.toString('base64')},...(side==='LONG'?[ledgerIx,ix,swapIx]:[ix])]};
 return {...f,plan,market,collateral,usdc,custodyAccounts:[m.account,u.account],inspection:{envelope,resolvedKeys:keys},ix,ledgerIx,swapIx,recipient,requestAddress,requestAta};
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
function preparationFixture(f){
 // Unfunded, synthetic provider cosignature, never a live wallet signature.
 const api=generateKeyPairSync('ed25519'),keys=[...f.inspection.resolvedKeys];keys[2]=bs58.encode(api.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const blockhash=bs58.encode(Buffer.alloc(32,9)),envelope=f.inspection.envelope;
 const instructions=envelope.instructions.map(ix=>{
  const data=Buffer.from(ix.dataBase64,'base64');assert(data.length<128);assert(ix.accounts.length<128);
  return Buffer.concat([Buffer.from([ix.program,ix.accounts.length,...ix.accounts,data.length]),data]);
 });
 const message=Buffer.concat([Buffer.from([3,envelope.readonlySigned,envelope.readonlyUnsigned,keys.length]),...keys.map(key=>Buffer.from(bs58.decode(key))),Buffer.from(bs58.decode(blockhash)),Buffer.from([instructions.length]),...instructions]);
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
async function simulationFixture(side='SHORT',minimumOut=0n){
 const f=await boundFixture(side,'SOL',2);
 if(side==='LONG'){const data=Buffer.from(f.swapIx.dataBase64,'base64');data.writeBigUInt64LE(minimumOut,8);f.swapIx.dataBase64=data.toString('base64');}
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
 const response={context:{slot:106},value:{err:null,unitsConsumed:400000,accounts:null}},calls=[];
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return 103;
  if(method==='getBlockHeight')return 500;
  if(method==='getMultipleAccounts')return {context:{slot:104},value:params[0].map(address=>before.get(address)??null)};
  if(method==='getFeeForMessage')return {context:{slot:105},value:5000};
  assert.equal(method,'simulateTransaction');assert.equal(params[0],preparation.serializedTxBase64);
  assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);assert.equal(params[1].minContextSlot,105);
  return {...response,value:{...response.value,accounts:response.value.accounts??params[1].accounts.addresses.map(address=>after.get(address)??null)}};
 };
 return {...f,preparation,inspection,before,after,response,calls,request,token};
}
test('exact-wire close simulation proves position removal and actual owner USDC increase without signing authority',async()=>{
 const f=await simulationFixture(),result=await simulateServerPerpsFullCloseEffects(f.inspection,{request:f.request});
 assert.equal(result.receivedUsdcUnits,'8000000');assert.equal(result.feeLamports,'5000');assert.equal(result.observedSlot,106);
 assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);assert.equal(result.requiresFundingRentAndOtherAccountChecks,true);
 const proof=readServerPerpsFullCloseSimulation(result);assert.equal(proof.wire,f.preparation.serializedTxBase64);
 assert.equal(proof.after[f.ids.position],null);assert(Object.isFrozen(proof.before));
 assert.deepEqual(f.calls.map(call=>call.method),['getGenesisHash','getSlot','getBlockHeight','getMultipleAccounts','getFeeForMessage','simulateTransaction','getBlockHeight','getGenesisHash']);
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
 data.writeBigUInt64LE(0n,161);data.writeBigUInt64LE(0n,169);data.writeBigUInt64LE(1002n,144);account.data[0]=data.toString('base64');
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
   if(mode==='feeSlot'&&method==='getFeeForMessage')return {context:{slot:103},value:5000};
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
