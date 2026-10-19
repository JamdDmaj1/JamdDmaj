// Deterministic unfunded fixtures, never submitted to any RPC.
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import layout from '../../lib/perps-event-layout.json' with {type:'json'};
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../../lib/perps-server-custody.js';
export const fixtureNow=Date.parse('2026-10-18T12:00:00Z');
const signer=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,68)]),format:'der',type:'pkcs8'});
export const fixtureWallet=bs58.encode(createPublicKey(signer).export({format:'der',type:'spki'}).subarray(-32));
export async function historyTransaction({name='InstantDecreasePositionEvent',nonce=4,program=PERPS_PROGRAM,pnlDelta='1234567',feeUsd='30000'}={}){
 const identities=await deriveServerPerpsIdentities({walletAddress:fixtureWallet,asset:'SOL',side:'LONG'}),schema=layout.events.find(e=>e.name===name),fields={};
 for(const [k,t]of schema.fields)fields[k]=typeof t==='object'?null:t==='publicKey'?fixtureWallet:t==='bool'?false:t==='u8'?0:'0';
 Object.assign(fields,{owner:fixtureWallet,pool:PERPS_POOL,positionKey:identities.position,positionSide:1,
  positionMint:PERPS_CUSTODIES.SOL.mint,positionCustody:PERPS_CUSTODIES.SOL.address,positionCollateralCustody:PERPS_CUSTODIES.SOL.address,
  pnlDelta,hasProfit:false,feeUsd});
 if(Object.hasOwn(fields,'positionCollateralMint'))fields.positionCollateralMint=PERPS_CUSTODIES.SOL.mint;
 const encode=(type,value)=>{
  if(typeof type==='object')return Buffer.from([0]);if(type==='publicKey')return Buffer.from(bs58.decode(value));
  if(type==='bool'||type==='u8')return Buffer.from([Number(value)]);
  const b=Buffer.alloc(8);if(type==='i64')b.writeBigInt64LE(BigInt(value));else b.writeBigUInt64LE(BigInt(value));return b;
 };
 const event=Buffer.concat([createHash('sha256').update('event:'+name).digest().subarray(0,8),...schema.fields.map(([k,t])=>encode(t,fields[k]))]);
 const message=Buffer.concat([Buffer.from([1,0,2,3]),...([fixtureWallet,program,identities.eventAuthority].map(k=>Buffer.from(bs58.decode(k)))),Buffer.alloc(32,nonce),Buffer.from([1,1,1,0,1,42])]);
 const signed=sign(null,message,signer),signature=bs58.encode(signed),wire=Buffer.concat([Buffer.from([1]),signed,message]);
 const tx={slot:499990+nonce,blockTime:fixtureNow/1000-10,transaction:[wire.toString('base64'),'base64'],meta:{err:null,fee:5000,loadedAddresses:{writable:[],readonly:[]},
  innerInstructions:program===PERPS_PROGRAM?[{index:0,instructions:[{programIdIndex:1,accounts:[2],stackHeight:2,data:bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),event]))}]}]:[]}};
 return {signature,tx,position:identities.position};
}
