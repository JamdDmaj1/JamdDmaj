// Cancellation inspection only. No builder transport, private key, activation,
// journal mutation or submission capability. Same-wire simulation still needed.
import {createHash} from 'node:crypto';
import {requireVerifiedServerPerpsExitCleanup} from './perps-position-closure.js';
import {resolveServerPerpsPreparationEnvelope} from './perps-server-preparation.js';
import {derivePerpsCancellationRoles,inspectPerpsCancellationPolicy} from './perps-exit-cancellation-policy.js';
const inspected=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_EXIT_CANCELLATION');}
export function requireInspectedPerpsExitCancellation(value){
 const proof=inspected.get(value);if(!proof)fail();requireVerifiedServerPerpsExitCleanup(proof.cleanup);return value;
}
export function readInspectedPerpsExitCancellationEvidence(value){requireInspectedPerpsExitCancellation(value);return inspected.get(value);}
export function perpsCancellationUnsignedWireHash(value){requireInspectedPerpsExitCancellation(value);return createHash('sha256').update(Buffer.from(value.envelope.serializedTxBase64,'base64')).digest('hex');}
export async function inspectServerPerpsExitCancellation(preparation,cleanup,{exitAddress,request}={}){
 requireVerifiedServerPerpsExitCleanup(cleanup);
 preparation=structuredClone(preparation);
 const pending=cleanup.pendingExits.find(exit=>exit.address===exitAddress);if(!pending)fail();
 const resolved=await resolveServerPerpsPreparationEnvelope(preparation,cleanup.walletAddress,{request,minimumSlot:cleanup.requestObservedSlot});
 const {envelope,resolvedKeys:keys}=resolved,owner=cleanup.walletAddress;
 const roles=await derivePerpsCancellationRoles({walletAddress:owner,positionAddress:cleanup.positionAddress,exitAddress});
 const {capabilities}=inspectPerpsCancellationPolicy(envelope,keys,roles),{ownerAta,requestAta}=roles;
 requireVerifiedServerPerpsExitCleanup(cleanup);
 const value=Object.freeze({stage:'EXIT_CANCELLATION_INSPECTED_NOT_AUTHORIZED',walletAddress:owner,reservationId:cleanup.reservationId,
  positionAddress:roles.positionAddress,exitAddress,ownerAta,requestAta,observedSlot:resolved.observedSlot,envelope,resolvedKeys:keys,capabilities,
  readyForSigning:false,requiresSameWireSimulation:true,requiresFreshCleanupProof:true,requiresDurableCancellationRecord:true});
 inspected.set(value,Object.freeze({cleanup,pending,intent:roles.intent,lastValidBlockHeight:String(preparation.txMetadata.lastValidBlockHeight)}));return requireInspectedPerpsExitCancellation(value);
}
