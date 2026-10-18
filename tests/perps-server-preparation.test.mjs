import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {inspectServerPerpsPreparation,prepareInspectedServerAutomation} from '../lib/perps-server-preparation.js';
import {PERPS_CUSTODIES,PERPS_POOL,PERPS_PROGRAM,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {getProgramDerivedAddress} from '@solana/kit';
const now=Date.parse('2026-10-18T12:00:00Z'),seconds=now/1000;
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
async function associated(owner,mint){return (await getProgramDerivedAddress({programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];}
function tokenAccount(owner,amount){const b=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(b);Buffer.from(bs58.decode(owner)).copy(b,32);b.writeBigUInt64LE(BigInt(amount),64);b[108]=1;return {owner:TOKEN,executable:false,lamports:2000000,data:[b.toString('base64'),'base64']};}
function custodyAccount(asset){
 const data=Buffer.alloc(416),id=PERPS_CUSTODIES[asset],index=asset==='SOL'?0:1;
 Buffer.from('01b830515d833f91','hex').copy(data);Buffer.from(bs58.decode(PERPS_POOL)).copy(data,8);Buffer.from(bs58.decode(id.mint)).copy(data,40);
 Buffer.alloc(32,100+index).copy(data,72);data[104]=id.decimals;data[105]=Number(id.stable);Buffer.alloc(32,110+index).copy(data,106);data[138]=2;
 data.writeBigUInt64LE(500000n,175);data[199]=1;data[202]=1;data[203]=1;Buffer.alloc(32,120+index).copy(data,384);
 return {owner:PERPS_PROGRAM,executable:false,data:[data.toString('base64'),'base64']};
}
async function fixture({exits=false,lookup=false,trusted=false}={}){
 lookup ||= exits;
 const apiPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,21)]),format:'der',type:'pkcs8'});
 const keys=Array.from({length:19},(_,i)=>Buffer.alloc(32,i+1));keys[2]=createPublicKey(apiPrivate).export({format:'der',type:'spki'}).subarray(-32);
 keys.push(Buffer.from(bs58.decode('ComputeBudget111111111111111111111111111111')),Buffer.from(bs58.decode('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu')));
 const blockhash=bs58.encode(Buffer.alloc(32,40)),tableAddress=bs58.encode(Buffer.alloc(32,60));
 const loaded=Array.from({length:exits?4:1},(_,i)=>Buffer.alloc(32,80+i));
 let identities;
 if(trusted){
  identities=await deriveServerPerpsIdentities({walletAddress:bs58.encode(keys[0]),asset:'SOL',side:'LONG'});
  const replacements={4:identities.perpetuals,5:PERPS_POOL,6:identities.position,7:PERPS_CUSTODIES.SOL.address,8:bs58.encode(Buffer.alloc(32,120)),9:bs58.encode(Buffer.alloc(32,110)),
   10:PERPS_CUSTODIES.SOL.address,11:bs58.encode(Buffer.alloc(32,120)),12:bs58.encode(Buffer.alloc(32,110)),13:bs58.encode(Buffer.alloc(32,100)),
   16:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',17:'11111111111111111111111111111111',18:identities.eventAuthority};
  for(const [index,address]of Object.entries(replacements))keys[Number(index)]=Buffer.from(bs58.decode(address));
  keys[3]=Buffer.from(bs58.decode(await associated(bs58.encode(keys[0]),PERPS_CUSTODIES.USDC.mint)));
  keys[14]=Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint));
  if(exits)for(const [index,counter]of [[0,1],[2,2]]){
   const [request]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',Buffer.from(bs58.decode(identities.position)),u64(counter),new Uint8Array([2])]});
   loaded[index]=Buffer.from(bs58.decode(request));
   loaded[index+1]=Buffer.from(bs58.decode(await associated(request,PERPS_CUSTODIES.USDC.mint)));
  }
 }
 const table=Buffer.alloc(56+loaded.length*32);table.writeUInt32LE(1,0);table.writeBigUInt64LE(18446744073709551615n,4);table.writeBigUInt64LE(1n,12);loaded.forEach((k,i)=>k.copy(table,56+i*32));
 const account={owner:'AddressLookupTab1e1111111111111111111111111',executable:false,data:[table.toString('base64'),'base64']};
 const instruction=(program,accounts,data)=>Buffer.concat([Buffer.from([program,accounts.length,...accounts,data.length]),data]);
 const computeLimit=Buffer.alloc(5);computeLimit[0]=2;computeLimit.writeUInt32LE(100000,1);
 const computePrice=Buffer.concat([Buffer.from([3]),u64(1000)]);
 const opening=[1,2,0,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20];
 if(lookup&&!exits)opening[3]=21;
 const openData=Buffer.concat([Buffer.from('a47e44b6dfa640b7','hex'),u64(30000000),Buffer.from([1]),u64(10000000),Buffer.from([1]),u64(100500000),u64(seconds)]);
 const instructions=[instruction(19,[],computeLimit),instruction(19,[],computePrice),instruction(20,opening,openData)];
 if(exits)for(const profit of [false,true]){
  const roles=[1,2,0,3,4,5,6,profit?23:21,profit?24:22,7,8,9,10,trusted?14:13,14,16,15,17,18,20];
  const data=Buffer.concat([Buffer.from('7562427f1e3249b9','hex'),u64(0),u64(30000000),u64(profit?110000000:95000000),Buffer.from([profit?1:0,0]),u64(profit?2:1),u64(seconds)]);
  instructions.push(instruction(20,roles,data));
 }
 const staticKeys=trusted?[...new Map(keys.map(k=>[k.toString('hex'),k])).values()]:keys;
 if(trusted){
  const remap=i=>i>=21?i-21+staticKeys.length:staticKeys.findIndex(k=>k.equals(keys[i]));
  for(const instruction of instructions){instruction[0]=remap(instruction[0]);for(let i=0;i<instruction[1];i++)instruction[2+i]=remap(instruction[2+i]);}
 }
 const message=Buffer.concat([Buffer.from(lookup?[128,3,1,2,staticKeys.length]:[3,1,2,staticKeys.length]),...staticKeys,Buffer.from(bs58.decode(blockhash)),Buffer.from([instructions.length]),...instructions,
  ...(lookup?[Buffer.from([1]),Buffer.from(bs58.decode(tableAddress)),Buffer.from([loaded.length,...loaded.map((_,i)=>i),0])]:[])]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,apiPrivate),message]);
 assert.ok(wire.length<=1232);
 const preparation={serializedTxBase64:wire.toString('base64'),positionPubkey:bs58.encode(keys[6]),quote:{side:'long'},txMetadata:{blockhash,lastValidBlockHeight:'100000'}};
 const intent={asset:'SOL',side:'LONG',walletAddress:bs58.encode(keys[0]),marginUsd:'10',leverage:'3',referencePrice:'100',maxSlippageBps:50,stopLoss:exits?'95':null,takeProfit:exits?'110':null};
 const calls=[];
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getSlot')return Math.max(50,params[0]?.minContextSlot||0);
  if(method==='getBlockHeight')return 10;
  if(method==='getMinimumBalanceForRentExemption'){assert.ok([210,230,165].includes(params[0]));return 2000000;}
  if(method==='getFeeForMessage')return {context:{slot:55},value:15100};
  if(method==='getMultipleAccounts'){
   if(params[0][0]===tableAddress){assert.deepEqual(params[0],[tableAddress]);return {context:{slot:51},value:[account]};}
   if(params[0][0]===PERPS_CUSTODIES.SOL.address){
    assert.equal(trusted,true);assert.deepEqual(params[0],[PERPS_CUSTODIES.SOL.address,PERPS_CUSTODIES.USDC.address]);
    return {context:{slot:52},value:[custodyAccount('SOL'),custodyAccount('USDC')]};
   }
   return {context:{slot:54},value:params[0].map(address=>address===intent.walletAddress?{owner:'11111111111111111111111111111111',executable:false,lamports:100000000,data:['','base64']}:address===bs58.encode(keys[3])?tokenAccount(intent.walletAddress,20000000):null)};
  }
  if(method==='simulateTransaction'){
   assert.equal(params[0],preparation.serializedTxBase64);assert.equal(params[1].replaceRecentBlockhash,false);assert.equal(params[1].sigVerify,false);
   const data=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(data);
   for(const [offset,key]of [[8,intent.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,PERPS_CUSTODIES.SOL.address]])Buffer.from(bs58.decode(key)).copy(data,offset);
   data.writeBigUInt64LE(BigInt(seconds),136);data.writeBigUInt64LE(BigInt(seconds),144);data[152]=1;data.writeBigUInt64LE(100000000n,153);data.writeBigUInt64LE(30000000n,161);data.writeBigUInt64LE(9990000n,169);data[209]=identities.positionBump;
   const states=new Map([[identities.position,data]]);
   if(exits)for(const profit of [false,true]){
    const counter=profit?2:1,exit=Buffer.alloc(230);
    Buffer.from('0c26fac72e9a20d8','hex').copy(exit);
    for(const [offset,key]of [[8,intent.walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,identities.position],[136,PERPS_CUSTODIES.USDC.mint]])Buffer.from(bs58.decode(key)).copy(exit,offset);
    exit.writeBigUInt64LE(BigInt(seconds),168);exit.writeBigUInt64LE(BigInt(seconds),176);exit.writeBigUInt64LE(30000000n,184);
    exit[200]=2;exit[201]=1;exit[202]=1;exit[206]=1;exit.writeBigUInt64LE(profit?110000000n:95000000n,207);
    exit[215]=1;exit[216]=Number(profit);exit[217]=1;exit.writeBigUInt64LE(BigInt(counter),220);
    const [address,bump]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(identities.position),u64(counter),new Uint8Array([2])]});
    exit[228]=bump;states.set(address,exit);
   }
   return {context:{slot:56},value:{err:null,unitsConsumed:50000,accounts:params[1].accounts.addresses.map(address=>{
    if(states.has(address))return {owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[states.get(address).toString('base64'),'base64']};
    if(address===intent.walletAddress)return {owner:'11111111111111111111111111111111',executable:false,lamports:100000000-15100-(exits?10000000:2000000),data:['','base64']};
    if(address===bs58.encode(keys[3]))return tokenAccount(intent.walletAddress,10000000);
    if(exits)for(const i of [1,3])if(address===bs58.encode(loaded[i]))return tokenAccount(bs58.encode(loaded[i-1]),0);
    return null;
   })}};
  }
  throw Error('UNEXPECTED_RPC');
 };
 return {preparation,intent,request,calls,account,table,loaded};
}
test('combined server gate inspects exact prepared wire, fee, core intent and RPC-resolved addresses without signing permission',async()=>{
 for(const lookup of [false,true]){
  const f=await fixture({lookup}),result=await inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds});
  assert.equal(result.stage,'INSPECTED_NOT_AUTHORIZED');assert.equal(result.readyForSigning,false);
  assert.equal(result.requiresSameWireSimulation,true);assert.equal(result.requiresVerifiedCustodiesAndPdas,true);
  assert.equal(result.capabilities.priorityFeeLamports,'100');
  if(lookup){assert.equal(result.resolvedKeys[21],bs58.encode(f.loaded[0]));assert.equal(result.observedSlot,51);}
  assert.equal(f.calls.some(c=>/send|execute|sign/i.test(c.method)),false);
 }
});
test('Telegram settings and builder response feed the complete inspection chain but never become signing-ready',async()=>{
 const f=await fixture({exits:true,trusted:true});let builderCalls=0;
 const input={settings:{capital:100,loss:20,positions:2,margin:10,leverage:3,dailyTrades:5},signal:{id:'signal-1',createdAt:new Date(now).toISOString(),pair:'SOLUSDT',side:'LONG',entry:100,sl:95,tp1:110},decision:{ok:true},walletAddress:f.intent.walletAddress,snapshot:{updatedAt:now,walletAddress:f.intent.walletAddress,availableUsd:100,allocatedUsd:0,lossTodayUsd:0,openPositions:0,tradesToday:0},enabled:true,paused:false,maxSlippageBps:50,now};
 const result=await prepareInspectedServerAutomation(input,{nowSeconds:seconds,rpcRequest:f.request,builderRequest:async()=>{builderCalls++;return new Response(JSON.stringify(f.preparation));}});
 assert.equal(builderCalls,1);assert.equal(result.inspection.core.exitCount,2);assert.equal(result.custody.position,f.preparation.positionPubkey);assert.equal(result.custody.exitCount,2);assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
 assert.equal(result.simulation.stage,'SIMULATED_POSITION_AND_EXITS');assert.equal(result.simulation.requiresFundingAndRentChecks,true);assert.equal(result.simulation.exits.length,2);
 assert.equal(result.stage,'SIMULATED_FUNDING_AND_EXITS');assert.equal(result.funding.usdcDebitUnits,'10000000');assert.equal(result.funding.rentLockedLamports,'10000000');assert.equal(result.requiresFullTokenPolicy,true);
 // A successful program simulation is insufficient: these spending/exit-token
 // mutations must reject the actual configured Telegram preparation pipeline.
 for(const change of ['extra-usdc','extra-sol','exit-token-amount','exit-token-owner','missing-exit-token']){
  await assert.rejects(prepareInspectedServerAutomation(input,{nowSeconds:seconds,builderRequest:async()=>new Response(JSON.stringify(f.preparation)),rpcRequest:async(m,p)=>{
   const reply=await f.request(m,p);if(m!=='simulateTransaction')return reply;
   const addresses=p[1].accounts.addresses,values=reply.value.accounts;
   if(change==='extra-sol')values[addresses.indexOf(input.walletAddress)].lamports--;
   else if(change==='extra-usdc'){
    const account=values.find(a=>a?.owner===TOKEN&&Buffer.from(a.data[0],'base64').readBigUInt64LE(64)===10000000n);
    const b=Buffer.from(account.data[0],'base64');b.writeBigUInt64LE(9999999n,64);account.data[0]=b.toString('base64');
   }else{
    const index=addresses.indexOf(bs58.encode(f.loaded[1]));
    if(change==='missing-exit-token')values[index]=null;
    else{const b=Buffer.from(values[index].data[0],'base64');if(change==='exit-token-amount')b.writeBigUInt64LE(1n,64);else b[32]^=1;values[index].data[0]=b.toString('base64');}
   }
   return reply;
  }}));
 }
 assert.equal(f.calls.some(c=>/send|execute|signTransaction/i.test(c.method)),false);
});
test('table identity, bank slot, warmup, activation and distinct addresses fail closed',async()=>{
 for(const mutate of [
  f=>{f.account.owner=f.intent.walletAddress;},f=>{f.account.executable=true;},
  f=>{f.table.writeBigUInt64LE(1n,4);f.account.data[0]=f.table.toString('base64');},
  f=>{f.table.writeBigUInt64LE(51n,12);f.account.data[0]=f.table.toString('base64');},
  f=>{f.table.writeBigUInt64LE(52n,12);f.account.data[0]=f.table.toString('base64');},
  f=>{Buffer.from(bs58.decode(f.intent.walletAddress)).copy(f.table,56);f.account.data[0]=f.table.toString('base64');},
  f=>{f.account.data[0]+='\n';}
 ]){
  const f=await fixture({lookup:true});mutate(f);await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds}));
 }
 const f=await fixture({lookup:true});
 await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:async(m,p)=>m==='getMultipleAccounts'?{context:{slot:49},value:[f.account]}:f.request(m,p),nowSeconds:seconds}));
});
test('changed network, blockhash, expired instruction or mismatched intent cannot pass the combined gate',async()=>{
 const f=await fixture();
 for(const options of [{nowSeconds:seconds+31},{minimumSlot:51,request:(m,p)=>m==='getSlot'?50:f.request(m,p)},{request:async()=> 'wrong-network'}]){
  await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds,...options}));
 }
 await assert.rejects(inspectServerPerpsPreparation({...f.preparation,txMetadata:{...f.preparation.txMetadata,blockhash:f.intent.walletAddress}},f.intent,{request:f.request,nowSeconds:seconds}));
 await assert.rejects(inspectServerPerpsPreparation(f.preparation,{...f.intent,side:'SHORT'},{request:f.request,nowSeconds:seconds}));
});
