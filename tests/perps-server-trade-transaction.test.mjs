import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import layout from '../lib/perps-event-layout.json' with {type:'json'};
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readServerPerpsTradeTransaction,requireVerifiedServerPerpsTradeTransaction} from '../lib/perps-server-trade-transaction.js';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',now=Date.parse('2026-10-18T12:00:00Z');
// Public, unfunded fixture seed. Never connected to an RPC or broadcaster.
const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,67)]),format:'der',type:'pkcs8'});
const walletAddress=bs58.encode(createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32));
async function fixture({version=-1,asset='SOL',side='LONG',name='InstantDecreasePositionEvent'}={}){
 const identities=await deriveServerPerpsIdentities({walletAddress,asset,side}),schema=layout.events.find(e=>e.name===name),fields={};
 for(const [k,t]of schema.fields)fields[k]=typeof t==='object'?null:t==='publicKey'?walletAddress:t==='bool'?false:t==='u8'?0:'0';
 Object.assign(fields,{owner:walletAddress,pool:PERPS_POOL,positionKey:identities.position,positionSide:side==='LONG'?1:2,
  positionMint:PERPS_CUSTODIES[asset].mint,positionCustody:PERPS_CUSTODIES[asset].address,positionCollateralCustody:PERPS_CUSTODIES[side==='LONG'?asset:'USDC'].address,
  pnlDelta:'1234567',hasProfit:false,feeUsd:'30000'});
 if(Object.hasOwn(fields,'positionCollateralMint'))fields.positionCollateralMint=PERPS_CUSTODIES[side==='LONG'?asset:'USDC'].mint;
 const encode=(type,value)=>{
  if(typeof type==='object')return Buffer.from([0]);
  if(type==='publicKey')return Buffer.from(bs58.decode(value));
  if(type==='bool'||type==='u8')return Buffer.from([Number(value)]);
  const b=Buffer.alloc(8);if(type==='i64')b.writeBigInt64LE(BigInt(value));else b.writeBigUInt64LE(BigInt(value));return b;
 };
 const event=Buffer.concat([createHash('sha256').update('event:'+name).digest().subarray(0,8),...schema.fields.map(([k,t])=>encode(t,fields[k]))]);
 const keys=[walletAddress,PERPS_PROGRAM,...version===0?[]:[identities.eventAuthority]];
 const message=Buffer.concat([Buffer.from(version===0?[128,1,0,1,keys.length]:[1,0,2,keys.length]),...keys.map(k=>Buffer.from(bs58.decode(k))),Buffer.alloc(32,4),
  Buffer.from([1,1,1,0,1,42]),...version===0?[Buffer.from([1]),Buffer.alloc(32,7),Buffer.from([0,1,0])]:[]]);
 const signature=sign(null,message,privateKey),wire=Buffer.concat([Buffer.from([1]),signature,message]);
 const tx={slot:300,blockTime:now/1000-10,transaction:[wire.toString('base64'),'base64'],meta:{err:null,fee:5000,
  loadedAddresses:{writable:[],readonly:version===0?[identities.eventAuthority]:[]},
  innerInstructions:[{index:0,instructions:[{programIdIndex:1,accounts:[2],stackHeight:2,data:bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),event]))}]}]}};
 const calls=[],request=async(method,params)=>{calls.push({method,params});if(method==='getGenesisHash')return genesis;if(method==='getTransaction')return tx;throw Error('unexpected RPC');};
 return {input:{walletAddress,signature:bs58.encode(signature),day:'2026-10-18'},options:{request,now:()=>now},calls,tx,wire,event};
}
test('finalized signed legacy/v0 transactions bind real CPI origin and six position identities, without daily completeness',async()=>{
 for(const version of [-1,0])for(const asset of ['SOL','ETH','BTC'])for(const side of ['LONG','SHORT']){
  const f=await fixture({version,asset,side}),proof=await readServerPerpsTradeTransaction(f.input,f.options);
  assert.equal(requireVerifiedServerPerpsTradeTransaction(proof),proof);assert.equal(proof.events[0].asset,asset);assert.equal(proof.events[0].side,side);
  assert.equal(proof.events[0].conservativeLossUsdUnits,'1264567');assert.equal(proof.events[0].requiresVerifiedChainOrigin,false);
  assert.equal(proof.requiresCompleteDailyHistory,true);assert.equal(proof.readyForSigning,false);assert.equal(proof.transactionFeeLamports,'5000');
  assert.deepEqual(f.calls.map(c=>c.method),['getGenesisHash','getTransaction','getGenesisHash']);
  assert.deepEqual(f.calls[1].params,[f.input.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  assert.ok(Object.isFrozen(proof.events[0]));assert.throws(()=>requireVerifiedServerPerpsTradeTransaction({...proof}));
 }
});
test('unfinalized lookup, failed, wrong-day, future, absent and truncated transactions cannot provide events',async()=>{
 for(const mutate of [f=>f.tx.meta.err={InstructionError:[0,'Custom']},f=>f.tx.blockTime-=86400,f=>f.tx.blockTime=now/1000+3,
  f=>f.tx.slot=-1,f=>f.tx.meta.fee=NaN,f=>f.tx.transaction[1]='json',f=>f.tx.meta.innerInstructions=null,
  f=>f.tx.transaction[0]=f.wire.subarray(0,-1).toString('base64'),f=>f.tx.transaction[0]+='=',f=>f.tx.meta.loadedAddresses.readonly=[walletAddress]]){
  const f=await fixture();mutate(f);await assert.rejects(readServerPerpsTradeTransaction(f.input,f.options),/UNVERIFIED_SERVER_PERPS_TRADE_TRANSACTION/);
 }
 const f=await fixture();await assert.rejects(readServerPerpsTradeTransaction(f.input,{...f.options,request:async m=>m==='getGenesisHash'?genesis:null}));
});
test('all five trade event types are read from verified CPI while a different wallet cannot claim them',async()=>{
 for(const {name}of layout.events){
  const f=await fixture({name}),proof=await readServerPerpsTradeTransaction(f.input,f.options);
  assert.equal(proof.events[0].eventName,name);
  await assert.rejects(readServerPerpsTradeTransaction({...f.input,walletAddress:PERPS_PROGRAM},f.options));
 }
});
test('altered signature/message, wrong requested signature and duplicate loaded keys are rejected',async()=>{
 for(const version of [-1,0])for(const offset of [1,40,70,130]){
  const f=await fixture({version}),changed=Buffer.from(f.wire);changed[offset]^=1;f.tx.transaction[0]=changed.toString('base64');
  await assert.rejects(readServerPerpsTradeTransaction(f.input,f.options));
 }
 const f=await fixture();f.input.signature=bs58.encode(Buffer.alloc(64,3));await assert.rejects(readServerPerpsTradeTransaction(f.input,f.options));
 const g=await fixture({version:0});g.tx.meta.loadedAddresses.readonly=[walletAddress];await assert.rejects(readServerPerpsTradeTransaction(g.input,g.options));
});
test('foreign program, log injection and absent events never become zero-loss evidence',async()=>{
 for(const mutate of [f=>f.tx.meta.innerInstructions[0].instructions[0].programIdIndex=0,
  f=>f.tx.meta.innerInstructions=[],f=>f.tx.meta.innerInstructions[0].instructions[0].data=bs58.encode(Buffer.alloc(16))]){
  const f=await fixture();mutate(f);f.tx.meta.logMessages=['Program data: '+f.event.toString('base64')];await assert.rejects(readServerPerpsTradeTransaction(f.input,f.options));
 }
});
test('wrong CPI authority, stack, account indexes and duplicate/out-of-range groups fail closed',async()=>{
 for(const mutate of [ix=>ix.accounts=[0],ix=>ix.accounts=[2,0],ix=>ix.accounts=[256],ix=>ix.stackHeight=1,ix=>ix.stackHeight=null,
  ix=>ix.programIdIndex=256,ix=>ix.data+='0']){
  const f=await fixture();mutate(f.tx.meta.innerInstructions[0].instructions[0]);await assert.rejects(readServerPerpsTradeTransaction(f.input,f.options));
 }
 for(const mutate of [f=>f.tx.meta.innerInstructions.push(f.tx.meta.innerInstructions[0]),f=>f.tx.meta.innerInstructions[0].index=1]){
  const f=await fixture();mutate(f);await assert.rejects(readServerPerpsTradeTransaction(f.input,f.options));
 }
});
test('network switches, invalid day and expired or backwards observation clocks cannot seal evidence',async()=>{
 const f=await fixture();let calls=0;await assert.rejects(readServerPerpsTradeTransaction(f.input,{...f.options,request:async(m,p)=>m==='getGenesisHash'?(++calls===1?genesis:'devnet'):f.options.request(m,p)}));
 for(const day of ['2026-02-30','2026-10-18x',null])await assert.rejects(readServerPerpsTradeTransaction({...f.input,day},f.options));
 for(const jump of [15001,-1,NaN]){let clockCalls=0;await assert.rejects(readServerPerpsTradeTransaction(f.input,{...f.options,monotonicNow:()=>++clockCalls===1?100:100+jump}));}
});
