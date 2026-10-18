import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {inspectServerPerpsPreparation} from '../lib/perps-server-preparation.js';
import {PERPS_CUSTODIES,PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities,readAndCheckServerPerpsCustodies} from '../lib/perps-server-custody.js';
import {simulateServerPerpsPositionEffects,getServerPerpsSimulationSnapshots} from '../lib/perps-server-simulation.js';
const COMPUTE='ComputeBudget111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
function custodyAccount(asset){
 const data=Buffer.alloc(416),id=PERPS_CUSTODIES[asset],i=asset==='SOL'?0:1;
 Buffer.from('01b830515d833f91','hex').copy(data);Buffer.from(bs58.decode(PERPS_POOL)).copy(data,8);Buffer.from(bs58.decode(id.mint)).copy(data,40);
 Buffer.alloc(32,100+i).copy(data,72);data[104]=id.decimals;data[105]=Number(id.stable);Buffer.alloc(32,110+i).copy(data,106);data[138]=2;
 data.writeBigUInt64LE(500000n,175);data[199]=data[202]=data[203]=1;Buffer.alloc(32,120+i).copy(data,384);
 return {owner:PERPS_PROGRAM,executable:false,data:[data.toString('base64'),'base64'],lamports:3000000};
}
async function fixture(){
 // Deterministic unfunded identities; only the mock API slot is signed here.
 const apiPrivate=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,21)]),format:'der',type:'pkcs8'});
 const api=bs58.encode(createPublicKey(apiPrivate).export({format:'der',type:'spki'}).subarray(-32)),owner=bs58.encode(Buffer.alloc(32,1)),keeper=bs58.encode(Buffer.alloc(32,2));
 const intent={walletAddress:owner,asset:'SOL',side:'LONG',marginUsd:'10',leverage:'3',maxSlippageBps:50,referencePrice:'100',stopLoss:null,takeProfit:null};
 const ids=await deriveServerPerpsIdentities(intent),blockhash=bs58.encode(Buffer.alloc(32,90));
 const roles=[keeper,api,owner,bs58.encode(Buffer.alloc(32,3)),ids.perpetuals,PERPS_POOL,ids.position,PERPS_CUSTODIES.SOL.address,bs58.encode(Buffer.alloc(32,120)),bs58.encode(Buffer.alloc(32,110)),
  PERPS_CUSTODIES.SOL.address,bs58.encode(Buffer.alloc(32,120)),bs58.encode(Buffer.alloc(32,110)),bs58.encode(Buffer.alloc(32,100)),bs58.encode(Buffer.alloc(32,4)),bs58.encode(Buffer.alloc(32,5)),TOKEN,SYSTEM,ids.eventAuthority,PERPS_PROGRAM];
 const readonly=[TOKEN,SYSTEM,ids.eventAuthority,COMPUTE,PERPS_PROGRAM];
 const keys=[owner,keeper,api,...new Set(roles.filter(k=>![owner,keeper,api,...readonly].includes(k))),...readonly];
 const ix=(program,accounts,data)=>Buffer.concat([Buffer.from([keys.indexOf(program),accounts.length,...accounts.map(a=>keys.indexOf(a)),data.length]),data]);
 const budget=Buffer.alloc(5);budget[0]=2;budget.writeUInt32LE(100000,1);
 const opening=Buffer.concat([Buffer.from('a47e44b6dfa640b7','hex'),u64(30000000),Buffer.from([1]),u64(10000000),Buffer.from([1]),u64(100500000),u64(1000)]);
 const message=Buffer.concat([Buffer.from([3,1,readonly.length,keys.length]),...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.from(bs58.decode(blockhash)),Buffer.from([3]),
  ix(COMPUTE,[],budget),ix(COMPUTE,[],Buffer.concat([Buffer.from([3]),u64(1000)])),ix(PERPS_PROGRAM,roles,opening)]);
 const wire=Buffer.concat([Buffer.from([3]),Buffer.alloc(128),sign(null,message,apiPrivate),message]).toString('base64');
 const preparation={serializedTxBase64:wire,positionPubkey:ids.position,txMetadata:{blockhash,lastValidBlockHeight:'100000'}};
 const data=Buffer.alloc(210);Buffer.from('aabc8fe47a40f7d0','hex').copy(data);
 for(const [offset,address]of [[8,owner],[40,PERPS_POOL],[72,PERPS_CUSTODIES.SOL.address],[104,PERPS_CUSTODIES.SOL.address]])Buffer.from(bs58.decode(address)).copy(data,offset);
 data.writeBigUInt64LE(999n,136);data.writeBigUInt64LE(1000n,144);data[152]=1;data.writeBigUInt64LE(100000000n,153);data.writeBigUInt64LE(30000000n,161);data.writeBigUInt64LE(9990000n,169);data[209]=ids.positionBump;
 const positionAccount={owner:PERPS_PROGRAM,executable:false,data:[data.toString('base64'),'base64'],lamports:2000000};
 const calls=[];
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getSlot')return (params[0].minContextSlot||0)+1;
  if(method==='getBlockHeight')return 5;
  if(method==='getMultipleAccounts'){
   if(params[0][0]===PERPS_CUSTODIES.SOL.address)return {context:{slot:params[1].minContextSlot+1},value:[custodyAccount('SOL'),custodyAccount('USDC')]};
   return {context:{slot:params[1].minContextSlot+1},value:params[0].map(address=>address===owner?{owner:SYSTEM,executable:false,lamports:100000000,data:['','base64']}:null)};
  }
  if(method==='getFeeForMessage'){assert.equal(params[0],message.toString('base64'));return {context:{slot:params[1].minContextSlot+1},value:15100};}
  if(method==='simulateTransaction'){
   assert.equal(params[0],wire);assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);
   return {context:{slot:params[1].minContextSlot+1},value:{err:null,unitsConsumed:90000,accounts:params[1].accounts.addresses.map(address=>address===ids.position?positionAccount:address===owner?{owner:SYSTEM,executable:false,lamports:97984900,data:['','base64']}:null)}};
  }
  throw Error('UNEXPECTED_RPC_METHOD');
 };
 const inspection=await inspectServerPerpsPreparation(preparation,intent,{request,nowSeconds:1000});
 const custody=await readAndCheckServerPerpsCustodies(inspection,intent,{request});
 const prepared={stage:inspection.stage,preparation,intent,inspection,custody};calls.length=0;
 return {prepared,request,calls,positionAccount};
}
test('exact-envelope simulation watches writable accounts, validates position deltas and keeps spending disabled',async()=>{
 const f=await fixture(),result=await simulateServerPerpsPositionEffects(f.prepared,{request:f.request,monotonicNow:()=>0});
 assert.equal(result.positionEffects.sizeDeltaUsdUnits,'30000000');assert.equal(result.positionEffects.collateralDeltaUsdUnits,'9990000');
 assert.equal(result.feeLamports,'15100');assert.equal(result.readyForSigning,false);assert.equal(result.requiresFundingAndRentChecks,true);
 const snapshots=getServerPerpsSimulationSnapshots(result,f.prepared.preparation.serializedTxBase64);
 assert.equal(snapshots.before[f.prepared.custody.position],null);assert.equal(snapshots.after[f.prepared.custody.position].owner,PERPS_PROGRAM);
 assert.equal(Object.isFrozen(snapshots.after),true);assert.equal(Object.isFrozen(snapshots.after[f.prepared.custody.position].data),true);
 assert.throws(()=>getServerPerpsSimulationSnapshots({...result},f.prepared.preparation.serializedTxBase64));
 assert.throws(()=>getServerPerpsSimulationSnapshots(result,'changed-wire'));
 assert.equal(f.calls.some(c=>/send|execute|signTransaction/i.test(c.method)),false);
});
test('simulation rejects incomplete snapshots, stale context, rejected transactions and replaced blockhashes',async()=>{
 for(const mutate of [r=>r.value.accounts.pop(),r=>r.value.err={InstructionError:[0,'InvalidArgument']},r=>r.value.replacementBlockhash={blockhash:'changed'},
  r=>r.context.slot=0,r=>r.value.unitsConsumed=100001,r=>r.value.unitsConsumed=0,r=>delete r.value.err]){
  const f=await fixture();
  await assert.rejects(simulateServerPerpsPositionEffects(f.prepared,{monotonicNow:()=>0,request:async(m,p)=>{const r=await f.request(m,p);if(m==='simulateTransaction')mutate(r);return r;}}));
 }
});
test('null/excessive fees, expired height, network mismatch and excessive elapsed time never become simulation evidence',async()=>{
 for(const [method,value]of [['getFeeForMessage',{context:{slot:10},value:null}],['getFeeForMessage',{context:{slot:10},value:1000001}],['getBlockHeight',100001],['getGenesisHash','devnet']]){
  const f=await fixture();await assert.rejects(simulateServerPerpsPositionEffects(f.prepared,{monotonicNow:()=>0,request:(m,p)=>m===method?value:f.request(m,p)}));
 }
 for(const elapsed of [-1,30001,NaN]){
  const f=await fixture();let count=0;await assert.rejects(simulateServerPerpsPositionEffects(f.prepared,{request:f.request,monotonicNow:()=>count++===0?0:elapsed}));
 }
});
test('unexpected position effects or malformed simulated account balances fail closed',async()=>{
 for(const mutate of [f=>{const b=Buffer.from(f.positionAccount.data[0],'base64');b.writeBigUInt64LE(30000001n,161);f.positionAccount.data[0]=b.toString('base64');},
  f=>f.positionAccount.lamports=Number.MAX_SAFE_INTEGER+1,f=>f.positionAccount.owner=SYSTEM]){
  const f=await fixture();mutate(f);await assert.rejects(simulateServerPerpsPositionEffects(f.prepared,{request:f.request,monotonicNow:()=>0}));
 }
});
