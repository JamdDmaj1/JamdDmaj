// Exact wallet-only partial signature for parent registration. The Phoenix
// co-signature must still be obtained and verified before claiming finality.
// No signer, sender, custody grant or replacement-message capability.
import {createHash,createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {requirePhoenixParentOnboarding,requirePhoenixParentSimulation} from './phoenix-parent-onboarding.js';
const proofs=new WeakMap();
const fail=()=>{throw Error('PHOENIX_PARENT_SIGNATURE_REJECTED');};
export function capturePhoenixParentSignature(preparation,simulation,encoded,{request}={}){
 requirePhoenixParentOnboarding(preparation);requirePhoenixParentSimulation(simulation,{preparation,request});
 if(typeof encoded!=='string')fail();
 const wire=Buffer.from(encoded,'base64'),original=Buffer.from(preparation.serializedTxBase64,'base64');
 if(wire.toString('base64')!==encoded||wire.length!==original.length||wire[0]!==2||!wire.subarray(65).equals(original.subarray(65))||
    original.subarray(1,129).some(n=>n!==0))fail();
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(preparation.walletAddress))]),format:'der',type:'spki'});
 if(!verify(null,wire.subarray(129),key,wire.subarray(1,65)))fail();
 const result=Object.freeze({stage:'PHOENIX_PARENT_WALLET_PARTIALLY_SIGNED',walletAddress:preparation.walletAddress,parentAddress:preparation.parentAddress,
  onboarder:preparation.onboarder,signature:bs58.encode(wire.subarray(1,65)),serializedTxBase64:encoded,
  wireHash:createHash('sha256').update(wire).digest('hex'),messageHash:preparation.messageHash,networkFeeLamports:simulation.networkFeeLamports,
  rentLockedLamports:simulation.rentLockedLamports,maximumLamports:simulation.maximumLamports,observedSlot:simulation.observedSlot,
  lastValidBlockHeight:preparation.lastValidBlockHeight,requiresProtocolCosignature:true,readyForBroadcast:false});
 proofs.set(result,{preparation,simulation,request});return result;
}
export function requirePhoenixParentSignature(value,{preparation,simulation,request}={}){
 const p=proofs.get(value);if(!p||p.preparation!==preparation||p.simulation!==simulation||p.request!==request)fail();
 requirePhoenixParentOnboarding(preparation);requirePhoenixParentSimulation(simulation,{preparation,request});return value;
}
