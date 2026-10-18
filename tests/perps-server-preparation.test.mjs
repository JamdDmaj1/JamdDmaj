import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {inspectServerPerpsPreparation,prepareInspectedServerAutomation} from '../lib/perps-server-preparation.js';
const now=Date.parse('2026-10-18T12:00:00Z'),seconds=now/1000;
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
function fixture({exits=false,lookup=false}={}){
 lookup ||= exits;
 const apiPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,21)]),format:'der',type:'pkcs8'});
 const keys=Array.from({length:19},(_,i)=>Buffer.alloc(32,i+1));keys[2]=createPublicKey(apiPrivate).export({format:'der',type:'spki'}).subarray(-32);
 keys.push(Buffer.from(bs58.decode('ComputeBudget111111111111111111111111111111')),Buffer.from(bs58.decode('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu')));
 const blockhash=bs58.encode(Buffer.alloc(32,40)),tableAddress=bs58.encode(Buffer.alloc(32,60));
 const loaded=Array.from({length:exits?4:1},(_,i)=>Buffer.alloc(32,80+i));
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
  const roles=[1,2,0,3,4,5,6,profit?23:21,profit?24:22,7,8,9,10,13,14,16,15,17,18,20];
  const data=Buffer.concat([Buffer.from('7562427f1e3249b9','hex'),u64(0),u64(30000000),u64(profit?110000000:95000000),Buffer.from([profit?1:0,0]),u64(profit?2:1),u64(seconds)]);
  instructions.push(instruction(20,roles,data));
 }
 const message=Buffer.concat([Buffer.from(lookup?[128,3,1,2,21]:[3,1,2,21]),...keys,Buffer.from(bs58.decode(blockhash)),Buffer.from([instructions.length]),...instructions,
  ...(lookup?[Buffer.from([1]),Buffer.from(bs58.decode(tableAddress)),Buffer.from([loaded.length,...loaded.map((_,i)=>i),0])]:[])]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,apiPrivate),message]);
 assert.ok(wire.length<=1232);
 const preparation={serializedTxBase64:wire.toString('base64'),positionPubkey:bs58.encode(keys[6]),quote:{side:'long'},txMetadata:{blockhash,lastValidBlockHeight:'100000'}};
 const intent={asset:'SOL',side:'LONG',walletAddress:bs58.encode(keys[0]),marginUsd:'10',leverage:'3',referencePrice:'100',maxSlippageBps:50,stopLoss:exits?'95':null,takeProfit:exits?'110':null};
 const calls=[];
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getSlot')return 50;
  if(method==='getMultipleAccounts'){assert.deepEqual(params[0],[tableAddress]);return {context:{slot:51},value:[account]};}
  throw Error('UNEXPECTED_RPC');
 };
 return {preparation,intent,request,calls,account,table,loaded};
}
test('combined server gate inspects exact prepared wire, fee, core intent and RPC-resolved addresses without signing permission',async()=>{
 for(const lookup of [false,true]){
  const f=fixture({lookup}),result=await inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds});
  assert.equal(result.stage,'INSPECTED_NOT_AUTHORIZED');assert.equal(result.readyForSigning,false);
  assert.equal(result.requiresSameWireSimulation,true);assert.equal(result.requiresVerifiedCustodiesAndPdas,true);
  assert.equal(result.capabilities.priorityFeeLamports,'100');
  if(lookup){assert.equal(result.resolvedKeys[21],bs58.encode(f.loaded[0]));assert.equal(result.observedSlot,51);}
  assert.equal(f.calls.some(c=>/send|execute|sign/i.test(c.method)),false);
 }
});
test('Telegram settings and builder response feed the complete inspection chain but never become signing-ready',async()=>{
 const f=fixture({exits:true});let builderCalls=0;
 const input={settings:{capital:100,loss:20,positions:2,margin:10,leverage:3,dailyTrades:5},signal:{id:'signal-1',createdAt:new Date(now).toISOString(),pair:'SOLUSDT',side:'LONG',entry:100,sl:95,tp1:110},decision:{ok:true},walletAddress:f.intent.walletAddress,snapshot:{updatedAt:now,walletAddress:f.intent.walletAddress,availableUsd:100,allocatedUsd:0,lossTodayUsd:0,openPositions:0,tradesToday:0},enabled:true,paused:false,maxSlippageBps:50,now};
 const result=await prepareInspectedServerAutomation(input,{nowSeconds:seconds,rpcRequest:f.request,builderRequest:async()=>{builderCalls++;return new Response(JSON.stringify(f.preparation));}});
 assert.equal(builderCalls,1);assert.equal(result.inspection.core.exitCount,2);assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
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
  const f=fixture({lookup:true});mutate(f);await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds}));
 }
 const f=fixture({lookup:true});
 await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:async(m,p)=>m==='getMultipleAccounts'?{context:{slot:49},value:[f.account]}:f.request(m,p),nowSeconds:seconds}));
});
test('changed network, blockhash, expired instruction or mismatched intent cannot pass the combined gate',async()=>{
 const f=fixture();
 for(const options of [{nowSeconds:seconds+31},{minimumSlot:51},{request:async()=> 'wrong-network'}]){
  await assert.rejects(inspectServerPerpsPreparation(f.preparation,f.intent,{request:f.request,nowSeconds:seconds,...options}));
 }
 await assert.rejects(inspectServerPerpsPreparation({...f.preparation,txMetadata:{...f.preparation.txMetadata,blockhash:f.intent.walletAddress}},f.intent,{request:f.request,nowSeconds:seconds}));
 await assert.rejects(inspectServerPerpsPreparation(f.preparation,{...f.intent,side:'SHORT'},{request:f.request,nowSeconds:seconds}));
});
