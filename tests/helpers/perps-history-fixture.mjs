// Deterministic unfunded fixtures, never submitted to any RPC.
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import layout from '../../lib/perps-event-layout.json' with {type:'json'};
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
import {readServerPerpsDailyAccount} from '../../lib/perps-server-daily-account.js';
export const fixtureNow=Date.parse('2026-10-18T12:00:00Z');
const signer=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,68)]),format:'der',type:'pkcs8'});
export const fixtureWallet=bs58.encode(createPublicKey(signer).export({format:'der',type:'spki'}).subarray(-32));
export async function emptyFixtureDailyAccount(walletAddress,{availableUsdcUnits='20000000',monotonicNow=()=>0,bankSlot=500000}={}){
 const token=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(token);Buffer.from(bs58.decode(walletAddress)).copy(token,32);token.writeBigUInt64LE(BigInt(availableUsdcUnits),64);token[108]=1;
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getMultipleAccounts')return {context:{slot:bankSlot},value:[{owner:'11111111111111111111111111111111',executable:false,lamports:100000000,data:['','base64']},
   {owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:2039280,data:[token.toString('base64'),'base64']},...Array(6).fill(null)]};
  if(method==='getSlot')return 500000;
  if(method==='getBlocks')return [68000];
  if(method==='getBlockTime')return params[0]===500000?fixtureNow/1000-5:fixtureNow/1000-172800;
  if(method==='getFirstAvailableBlock')return 100;
  if(method==='getSignaturesForAddress')return [];
  throw Error('unexpected fixture-only read');
 };
 return readServerPerpsDailyAccount({walletAddress},{request,now:()=>fixtureNow,monotonicNow});
}
export async function historyTransaction({name='InstantDecreasePositionEvent',nonce=4,program=PERPS_PROGRAM,pnlDelta='1234567',feeUsd='30000',eventOwner=fixtureWallet,threeSigners=false,fieldOverrides={}}={}){
 const identities=await deriveServerPerpsIdentities({walletAddress:eventOwner,asset:'SOL',side:'LONG'}),schema=layout.events.find(e=>e.name===name),fields={};
 for(const [k,t]of schema.fields)fields[k]=typeof t==='object'?null:t==='publicKey'?fixtureWallet:t==='bool'?false:t==='u8'?0:'0';
 Object.assign(fields,{owner:eventOwner,pool:PERPS_POOL,positionKey:identities.position,positionSide:1,
  positionMint:PERPS_CUSTODIES.SOL.mint,positionCustody:PERPS_CUSTODIES.SOL.address,positionCollateralCustody:PERPS_CUSTODIES.SOL.address,
  pnlDelta,hasProfit:false,feeUsd});
 if(Object.hasOwn(fields,'positionCollateralMint'))fields.positionCollateralMint=PERPS_CUSTODIES.SOL.mint;
 Object.assign(fields,fieldOverrides);
 const encode=(type,value)=>{
  if(typeof type==='object')return value===null?Buffer.from([0]):Buffer.concat([Buffer.from([1]),encode(type.option,value)]);if(type==='publicKey')return Buffer.from(bs58.decode(value));
  if(type==='bool'||type==='u8')return Buffer.from([Number(value)]);
  const b=Buffer.alloc(8);if(type==='i64')b.writeBigInt64LE(BigInt(value));else b.writeBigUInt64LE(BigInt(value));return b;
 };
 const event=Buffer.concat([createHash('sha256').update('event:'+name).digest().subarray(0,8),...schema.fields.map(([k,t])=>encode(t,fields[k]))]);
 const signers=[signer,...threeSigners?[45,46].map(n=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,n)]),format:'der',type:'pkcs8'})):[]];
 const keys=[...signers.map(k=>bs58.encode(createPublicKey(k).export({format:'der',type:'spki'}).subarray(-32))),program,identities.eventAuthority];if(eventOwner!==fixtureWallet)keys.push(eventOwner);
 const count=signers.length,programIndex=count;
 const message=Buffer.concat([Buffer.from([count,threeSigners?1:0,keys.length-count,keys.length]),...(keys.map(k=>Buffer.from(bs58.decode(k)))),Buffer.alloc(32,nonce),Buffer.from([1,programIndex,1,0,1,42])]);
 const signatures=signers.map(key=>sign(null,message,key)),signature=bs58.encode(signatures[0]),wire=Buffer.concat([Buffer.from([count]),...signatures,message]);
 const tx={slot:499990+nonce,blockTime:fixtureNow/1000-10,transaction:[wire.toString('base64'),'base64'],meta:{err:null,fee:5000,loadedAddresses:{writable:[],readonly:[]},
  innerInstructions:program===PERPS_PROGRAM?[{index:0,instructions:[{programIdIndex:programIndex,accounts:[programIndex+1],stackHeight:2,data:bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),event]))}]}]:[]}};
 return {signature,tx,position:identities.position,event};
}
