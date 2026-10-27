import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {getProgramDerivedAddress,getCompiledTransactionMessageDecoder} from '@solana/kit';
export const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111',USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const recipient=bs58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(9)));
export async function transferFixture(wallet,{mint='SOL',missing=false,timeout=false}={}){
 const system=n=>({owner:SYSTEM,executable:false,lamports:Number(n),data:['','base64'],rentEpoch:0});
 const token=(who,amount)=>{const d=Buffer.alloc(165);Buffer.from(bs58.decode(USDC)).copy(d);Buffer.from(bs58.decode(who)).copy(d,32);d.writeBigUInt64LE(amount,64);d[108]=1;return {owner:TOKEN,executable:false,lamports:2039280,data:[d.toString('base64'),'base64'],rentEpoch:0};};
 const m=Buffer.alloc(82);m[44]=6;m[45]=1;
 const derive=async who=>(await getProgramDerivedAddress({programAddress:'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',seeds:[bs58.decode(who),bs58.decode(TOKEN),bs58.decode(USDC)]}))[0];
 const source=await derive(wallet),destination=await derive(recipient),state=new Map([[wallet,system(1000000000n)],[recipient,system(1000000n)],[USDC,{owner:TOKEN,executable:false,lamports:1461600,data:[m.toString('base64'),'base64'],rentEpoch:0}],[source,token(wallet,50000000n)],[destination,missing?null:token(recipient,2000000n)]]);
 let sends=0,simulationError=false,corrupt=false;const simulations=[],messages=[];
 const rpc=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getLatestBlockhash')return {context:{slot:100},value:{blockhash:bs58.encode(new Uint8Array(32).fill(7)),lastValidBlockHeight:200}};
  if(method==='getMultipleAccounts')return {context:{slot:100},value:params[0].map(k=>structuredClone(state.get(k)??null))};
  if(method==='isBlockhashValid')return {context:{slot:100},value:true};
  if(method==='getFeeForMessage'){messages.push(Buffer.from(params[0],'base64'));return {context:{slot:100},value:5000};}
  if(method==='getMinimumBalanceForRentExemption')return 2039280;
  if(method==='simulateTransaction'){
   simulations.push(params);if(simulationError)return {context:{slot:100},value:{err:{InstructionError:[0,'x']},accounts:null}};
   const wire=Buffer.from(params[0],'base64'),decoded=getCompiledTransactionMessageDecoder().decode(wire.subarray(65)),instructions=decoded.instructions;
   const final=instructions.at(-1),data=Buffer.from(final.data),isSol=mint==='SOL',units=data.readBigUInt64LE(isSol?4:1);
   const result=params[1].accounts.addresses.map(k=>structuredClone(state.get(k)??null));result[0].lamports-=5000+(isSol?Number(units):missing?2039280:0);
   if(isSol)result[1].lamports+=Number(units);else{result[3]=token(wallet,50000000n-units);result[4]=token(recipient,2000000n*(missing?0n:1n)+units);}
   if(corrupt)result[0].lamports--;
   return {context:{slot:100},value:{err:null,accounts:result,unitsConsumed:10000}};
  }
  if(method==='sendTransaction'){sends++;if(timeout)throw Error('TIMEOUT');return bs58.encode(Buffer.from(params[0],'base64').subarray(1,65));}
  throw Error('Unexpected RPC '+method);
 };
 return {rpc,state,source,destination,messages,simulations,sends:()=>sends,failSimulation:()=>{simulationError=true;},corruptSimulation:()=>{corrupt=true;}};
}
