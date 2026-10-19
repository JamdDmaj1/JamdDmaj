// Cancellation inspection only. No builder transport, private key, activation,
// journal mutation or submission capability. Same-wire simulation still needed.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
import {requireVerifiedServerPerpsExitCleanup} from './perps-position-closure.js';
import {resolveServerPerpsPreparationEnvelope} from './perps-server-preparation.js';
import {checkServerPerpsCapabilities} from './perps-server-capabilities.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',COMPUTE='ComputeBudget111111111111111111111111111111';
const inspected=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_EXIT_CANCELLATION');}
const tokenAddress=async owner=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(PERPS_CUSTODIES.USDC.mint)]}))[0];
function writable(envelope,index){
 if(index<3)return index<3-envelope.readonlySigned;
 if(index<envelope.staticKeys.length)return index<envelope.staticKeys.length-envelope.readonlyUnsigned;
 return index<envelope.staticKeys.length+envelope.lookups.reduce((n,table)=>n+table.writable.length,0);
}
export function requireInspectedPerpsExitCancellation(value){
 const proof=inspected.get(value);if(!proof)fail();requireVerifiedServerPerpsExitCleanup(proof.cleanup);return value;
}
export function readInspectedPerpsExitCancellationEvidence(value){requireInspectedPerpsExitCancellation(value);return inspected.get(value);}
export async function inspectServerPerpsExitCancellation(preparation,cleanup,{exitAddress,request}={}){
 requireVerifiedServerPerpsExitCleanup(cleanup);
 preparation=structuredClone(preparation);
 const pending=cleanup.pendingExits.find(exit=>exit.address===exitAddress);if(!pending)fail();
 const resolved=await resolveServerPerpsPreparationEnvelope(preparation,cleanup.walletAddress,{request,minimumSlot:cleanup.requestObservedSlot});
 const {envelope,resolvedKeys:keys}=resolved,capabilities=checkServerPerpsCapabilities(envelope);
 let ids;for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT']){
  const value=await deriveServerPerpsIdentities({walletAddress:cleanup.walletAddress,asset,side});if(value.position===cleanup.positionAddress)ids={...value,asset,side};
 }
 if(!ids)fail();
 const [ownerAta,requestAta]=await Promise.all([tokenAddress(cleanup.walletAddress),tokenAddress(exitAddress)]);
 const keeper=keys[1],owner=cleanup.walletAddress,mint=PERPS_CUSTODIES.USDC.mint;
 const allowedWritable=new Set([owner,keeper,ownerAta,PERPS_POOL,exitAddress,requestAta]);
 for(let i=0;i<keys.length;i++)if(writable(envelope,i)&&!allowedWritable.has(keys[i]))fail();
 let cancellations=0,ataCreates=0;
 for(const instruction of envelope.instructions){
  const program=keys[instruction.program],data=Buffer.from(instruction.dataBase64,'base64'),accounts=instruction.accounts.map(index=>keys[index]);
  if(program===COMPUTE)continue; // Canonical compute ordering/fees checked above.
  if(program===ATA){
   if(cancellations||++ataCreates!==1||data.length!==1||data[0]!==1||accounts.length!==6
    ||JSON.stringify(accounts)!==JSON.stringify([owner,ownerAta,owner,mint,SYSTEM,TOKEN]))fail();
   continue;
  }
  if(program!==PERPS_PROGRAM||++cancellations!==1||data.length!==8)fail();
  const tag=data.toString('hex'),expected=tag==='2869d9bcdc2d6d6e'
   ?[keeper,owner,ownerAta,PERPS_POOL,exitAddress,requestAta,ids.position,TOKEN,ids.eventAuthority,PERPS_PROGRAM]
   :tag==='7944a21cd82fc842'
    ?[keeper,owner,ownerAta,PERPS_POOL,exitAddress,requestAta,ids.position,mint,TOKEN,SYSTEM,ATA,ids.eventAuthority,PERPS_PROGRAM]:null;
  if(!expected||JSON.stringify(accounts)!==JSON.stringify(expected))fail();
  if(tag==='7944a21cd82fc842'&&!writable(envelope,instruction.accounts[0]))fail();
  // Required writable roles cannot be downgraded; position and program identities
  // must remain readonly. The owner is the fee payer; keeper is signer slot 1.
  for(const index of instruction.accounts){const role=keys[index];if(role!==keeper&&writable(envelope,index)!==allowedWritable.has(role))fail();}
 }
 if(cancellations!==1)fail();requireVerifiedServerPerpsExitCleanup(cleanup);
 const value=Object.freeze({stage:'EXIT_CANCELLATION_INSPECTED_NOT_AUTHORIZED',walletAddress:owner,reservationId:cleanup.reservationId,
  positionAddress:ids.position,exitAddress,ownerAta,requestAta,observedSlot:resolved.observedSlot,envelope,resolvedKeys:keys,capabilities,
  readyForSigning:false,requiresSameWireSimulation:true,requiresFreshCleanupProof:true,requiresDurableCancellationRecord:true});
 inspected.set(value,Object.freeze({cleanup,pending,intent:Object.freeze({walletAddress:owner,asset:ids.asset,side:ids.side}),lastValidBlockHeight:String(preparation.txMetadata.lastValidBlockHeight)}));return requireInspectedPerpsExitCancellation(value);
}
