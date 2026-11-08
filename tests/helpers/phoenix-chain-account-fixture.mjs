// Independently assembled on-chain layouts; no SDK account encoder is used.
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PHOENIX_IDENTITIES as ID} from '../../lib/phoenix-market-plan.js';
import {derivePhoenixWalletAccounts} from '../../lib/phoenix-instruction-bindings.js';

export const PHOENIX_TEST_TIME=1800000000000;
export const phoenixTestKey=n=>bs58.encode(Uint8Array.from({length:32},(_,i)=>i===31?n:0));
export const PHOENIX_TEST_WALLET=phoenixTestKey(12);
export function phoenixRpcAccount(owner,data,lamports=2039280){return {owner,executable:false,lamports,data:[data.toString('base64'),'base64']};}
export function phoenixTokenBytes(mint,owner,amount){
 const b=Buffer.alloc(165);b.set(bs58.decode(mint),0);b.set(bs58.decode(owner),32);b.writeBigUInt64LE(BigInt(amount),64);b[108]=1;return b;
}
export function phoenixTraderBytes({address,wallet=PHOENIX_TEST_WALLET,index=1,baseLots=0n,virtualQuoteLots=0n,assetId=7,collateral=10000000n,positionAuthority=wallet,capacity=index===0?32:1}={}){
 const b=Buffer.alloc(240+capacity*40),hasPosition=baseLots!==0n||virtualQuoteLots!==0n;
 createHash('sha256').update('account:trader').digest().copy(b,0,0,8);
 b.writeBigUInt64LE(1n,8);b.writeBigUInt64LE(1000n,16);
 b.set(bs58.decode(address),24);b.set(bs58.decode(wallet),56);
 b.writeBigInt64LE(collateral,88);b.writeUInt32LE(63,96);
 b.writeUInt32LE(index===0?32:1,112);b.writeUInt32LE(index===0?0:1,116);
 b.set(bs58.decode(positionAuthority),120);b[154]=0;b[155]=index;
 b.set(bs58.decode(wallet),156);b.writeBigUInt64LE(900n,192);
 b.writeBigUInt64LE(hasPosition?1n:0n,224);b.writeBigUInt64LE(BigInt(capacity),232);
 if(hasPosition){b.writeBigUInt64LE(BigInt(assetId),240);b.writeBigInt64LE(baseLots,248);b.writeBigInt64LE(virtualQuoteLots,256);b.writeBigInt64LE(0n,264);b[272]=1;}
 return b;
}
export async function phoenixChainAccountFixture({baseLots=-240n,virtualQuoteLots=30000000n,wallet=PHOENIX_TEST_WALLET}={}){
 const a=await derivePhoenixWalletAccounts(wallet,1);
 const [parent]=await getProgramDerivedAddress({programAddress:ID.program,seeds:['trader',bs58.decode(wallet),new Uint8Array([0]),new Uint8Array([0])]});
 const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111';
 const map=new Map([
  [wallet,phoenixRpcAccount(SYSTEM,Buffer.alloc(0),100000000)],
  [a.usdcAta,phoenixRpcAccount(TOKEN,phoenixTokenBytes(ID.usdc,wallet,3000000n))],
  [a.canonicalAta,null],
  [parent,phoenixRpcAccount(ID.program,phoenixTraderBytes({address:parent,wallet,index:0,collateral:0n}))],
  [a.trader,phoenixRpcAccount(ID.program,phoenixTraderBytes({address:a.trader,wallet,baseLots,virtualQuoteLots}))]
 ]);
 let monotonic=0,clock=PHOENIX_TEST_TIME,slot=1000,genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
 const calls=[];
 const request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return genesis;
  if(method==='getMultipleAccounts')return {context:{slot},value:params[0].map(address=>map.get(address)??null)};
  throw Error('UNEXPECTED_RPC_METHOD');
 };
 return {wallet,a,parent,map,calls,request,now:()=>clock,monotonicNow:()=>monotonic,
  advance(ms){clock+=ms;monotonic+=ms;},setSlot(value){slot=value;},setGenesis(value){genesis=value;}};
}
