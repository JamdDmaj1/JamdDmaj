// Structural cancellation policy shared by preparation and finalized history.
// Neither plain inputs nor this policy-only result confer any authority.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {checkServerPerpsCapabilities} from './perps-server-capabilities.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
function fail(){throw Error('UNVERIFIED_PERPS_EXIT_CANCELLATION');}
const tokenAddress=async owner=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(PERPS_CUSTODIES.USDC.mint)]}))[0];
export async function derivePerpsCancellationRoles({walletAddress,positionAddress,exitAddress}){
 let ids,intent;for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const value=await deriveServerPerpsIdentities({walletAddress,asset,side});if(value.position===positionAddress){ids=value;intent=Object.freeze({walletAddress,asset,side});}
 }
 if(!ids)fail();const [ownerAta,requestAta]=await Promise.all([tokenAddress(walletAddress),tokenAddress(exitAddress)]);
 return Object.freeze({walletAddress,positionAddress,exitAddress,ownerAta,requestAta,eventAuthority:ids.eventAuthority,intent});
}
export function perpsCancellationWritable(envelope,index){
 if(index<3)return index<3-envelope.readonlySigned;
 if(index<envelope.staticKeys.length)return index<envelope.staticKeys.length-envelope.readonlyUnsigned;
 return index<envelope.staticKeys.length+envelope.lookups.reduce((n,table)=>n+table.writable.length,0);
}
export function inspectPerpsCancellationPolicy(envelope,keys,roles){
 const capabilities=checkServerPerpsCapabilities(envelope);
 if(!Array.isArray(keys)||keys.length!==envelope.accountCount||new Set(keys).size!==keys.length||keys[0]!==roles.walletAddress
  ||envelope.staticKeys.some((key,index)=>key!==keys[index]))fail();
 const {ownerAta,requestAta,exitAddress,positionAddress,eventAuthority}=roles,keeper=keys[1],owner=roles.walletAddress,mint=PERPS_CUSTODIES.USDC.mint;
 const allowed=new Set([owner,keeper,ownerAta,PERPS_POOL,exitAddress,requestAta]);
 for(let i=0;i<keys.length;i++)if(perpsCancellationWritable(envelope,i)&&!allowed.has(keys[i]))fail();
 let cancellations=0,ataCreates=0;
 for(const instruction of envelope.instructions){
  const program=keys[instruction.program],data=Buffer.from(instruction.dataBase64,'base64'),accounts=instruction.accounts.map(index=>keys[index]);
  if(program===COMPUTE)continue;
  if(program===ATA){
   if(cancellations||++ataCreates!==1||data.length!==1||data[0]!==1||accounts.length!==6
    ||JSON.stringify(accounts)!==JSON.stringify([owner,ownerAta,owner,mint,SYSTEM,TOKEN]))fail();continue;
  }
  if(program!==PERPS_PROGRAM||++cancellations!==1||data.length!==8)fail();
  const tag=data.toString('hex'),expected=tag==='2869d9bcdc2d6d6e'
   ?[keeper,owner,ownerAta,PERPS_POOL,exitAddress,requestAta,positionAddress,TOKEN,eventAuthority,PERPS_PROGRAM]
   :tag==='7944a21cd82fc842'?[keeper,owner,ownerAta,PERPS_POOL,exitAddress,requestAta,positionAddress,mint,TOKEN,SYSTEM,ATA,eventAuthority,PERPS_PROGRAM]:null;
  if(!expected||JSON.stringify(accounts)!==JSON.stringify(expected)||tag==='7944a21cd82fc842'&&!perpsCancellationWritable(envelope,instruction.accounts[0]))fail();
  for(const index of instruction.accounts){const role=keys[index];if(role!==keeper&&perpsCancellationWritable(envelope,index)!==allowed.has(role))fail();}
 }
 if(cancellations!==1)fail();return Object.freeze({stage:'CANCELLATION_POLICY_ONLY',readyForSigning:false,capabilities});
}
