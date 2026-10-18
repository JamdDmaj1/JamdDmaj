// Bind funding inspection to non-forgeable exact-wire simulation snapshots.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {getProgramDerivedAddress} from '@solana/kit';
import {getServerPerpsSimulationSnapshots} from './perps-server-simulation.js';
import {inspectServerPerpsFunding} from './perps-server-funding.js';
import {PERPS_PROGRAM,PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_FUNDING');}
async function associated(owner,mint){return (await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];}
function bytes(account){if(!account||account.executable)fail();return Buffer.from(account.data[0],'base64');}
function closed(a){return a===null||(a?.owner==='11111111111111111111111111111111'&&!a.executable&&String(a.lamports)==='0'&&a.data[0]==='');}
export async function checkServerPerpsFundingSimulation(prepared,simulation,{request,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow(),wire=prepared.preparation?.serializedTxBase64;
 const proof=getServerPerpsSimulationSnapshots(simulation,wire),{before,after,source,intent,envelope,keys}=proof;
 if(!Number.isFinite(started)||simulation.readyForSigning!==false||!Number.isSafeInteger(simulation.observedSlot))fail();
 const ids=await deriveServerPerpsIdentities(intent),collateralMint=PERPS_CUSTODIES[intent.side==='LONG'?intent.asset:'USDC'].mint;
 if(source!==await associated(intent.walletAddress,PERPS_CUSTODIES.USDC.mint))fail();
 const collateralAccount=await associated(intent.walletAddress,collateralMint),rents=Object.create(null),closures=Object.create(null);
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 async function addRent(address,program,tokenOwner=null,mint=null){
  if(Object.hasOwn(rents,address))return;
  if(!Object.hasOwn(before,address)||!Object.hasOwn(after,address)||!after[address])fail();
  const length=bytes(after[address]).length;
  const minimum=await request('getMinimumBalanceForRentExemption',[length,{commitment:'confirmed'}]);
  if(!Number.isSafeInteger(minimum)||minimum<=0)fail();
  rents[address]={program,tokenOwner,mint,minimum:String(minimum)};
 }
 for(const ix of envelope.instructions){
  if(envelope.staticKeys[ix.program]!==PERPS_PROGRAM)continue;
  const data=Buffer.from(ix.dataBase64,'base64'),tag=data.subarray(0,8).toString('hex'),roles=ix.accounts.map(i=>keys[i]);
  if(tag==='c52656a5c71726ea')continue; // Its full instruction policy remains independently mandatory.
  if(tag==='e455b9704e4f4d02'){
   if(roles.length!==3||!Object.hasOwn(before,roles[0])||!Object.hasOwn(after,roles[0])||!Object.hasOwn(before,roles[1]))fail();
   const previous=before[roles[0]],next=after[roles[0]],discriminator=createHash('sha256').update('account:TokenLedger').digest().subarray(0,8);
   for(const account of [previous,next]){const b=bytes(account);if(account.owner!==PERPS_PROGRAM||b.length!==48||!b.subarray(0,8).equals(discriminator))fail();}
   if(previous.lamports!==next.lamports)fail();
   let amount=0n;const token=before[roles[1]];
   if(!closed(token)){
    const b=bytes(token);if(token.owner!==TOKEN||b.length!==165||bs58.encode(b.subarray(32,64))!==intent.walletAddress||bs58.encode(b.subarray(0,32))!==collateralMint)fail();amount=b.readBigUInt64LE(64);
   }
   const b=bytes(next);if(bs58.encode(b.subarray(8,40))!==roles[1]||b.readBigUInt64LE(40)!==amount)fail();continue;
  }
  if(roles.length!==20||roles[6]!==ids.position)fail();
  await addRent(ids.position,PERPS_PROGRAM);
  if(tag==='a47e44b6dfa640b7'){
   if(intent.side==='SHORT'&&roles[3]!==source)fail();
   if(roles[3]===collateralAccount&&roles[3]!==source){
    if(!closed(after[roles[3]]))await addRent(roles[3],TOKEN,intent.walletAddress,collateralMint);
    closures[roles[3]]=collateralMint;
   }
  }else if(tag==='7562427f1e3249b9'){
   const [exit]=await getProgramDerivedAddress({programAddress:PERPS_PROGRAM,seeds:['position_request',bs58.decode(ids.position),data.subarray(34,42),new Uint8Array([2])]});
   const exitToken=await associated(exit,PERPS_CUSTODIES.USDC.mint);
   if(roles[7]!==exit||roles[8]!==exitToken||roles[3]!==source||roles[13]!==PERPS_CUSTODIES.USDC.mint)fail();
   await addRent(exit,PERPS_PROGRAM);await addRent(exitToken,TOKEN,exit,PERPS_CUSTODIES.USDC.mint);
  }else fail();
 }
 const funding=inspectServerPerpsFunding({payer:intent.walletAddress,source,marginUnits:exactUsdUnits(intent.marginUsd),feeLamports:simulation.feeLamports,before,after,rents,emptyFundingClosures:closures});
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000)fail();
 return funding;
}
