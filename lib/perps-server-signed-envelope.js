// Verify signer OUTPUT, never access a key or request a signature here.
// This is not execution permission: controls, chain freshness and custody policy
// must be revalidated by the execution coordinator before any broadcast.
import bs58 from 'bs58';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {readServerPerpsPreparationEvidence} from './perps-server-preparation.js';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_OWNER_SIGNATURE');}
export function verifyOwnerSignedServerPerpsEnvelope(prepared,signedBase64,{journal,reservationId,walletAddress,signalId}={}){
 const evidence=readServerPerpsPreparationEvidence(prepared,{walletAddress,signalId});
 if(typeof journal?.read!=='function'||typeof signedBase64!=='string'||signedBase64.length>1644)fail();
 const row=journal.read(reservationId);
 if(row?.state!=='SIGNING'||row.wallet!==walletAddress||row.signal!==signalId||row.reservation!==reservationId||BigInt(row.margin)!==BigInt(prepared.plan.body.inputTokenAmount))fail();
 const original=Buffer.from(prepared.preparation.serializedTxBase64,'base64'),signed=Buffer.from(signedBase64,'base64');
 if(signed.toString('base64')!==signedBase64||signed.length!==original.length||signed.length>1232||signed.length<194||signed[0]!==3||original[0]!==3
  ||original.subarray(1,129).some(b=>b!==0)||signed.subarray(65,129).some(b=>b!==0)||!signed.subarray(65).equals(original.subarray(65)))fail();
 const ownerKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(walletAddress))]),format:'der',type:'spki'});
 if(!verify(null,signed.subarray(193),ownerKey,signed.subarray(1,65)))fail();
 const signature=bs58.encode(signed.subarray(1,65)),wireHash=createHash('sha256').update(signed).digest('hex');
 const result=Object.freeze({stage:'OWNER_SIGNATURE_ONLY',readyForBroadcast:false,walletAddress,signalId,reservationId,signature,wireHash,
  requiresFreshControlAndChainChecks:true,requiresCustodyAuthorization:true});
 proofs.set(result,{prepared,journal,margin:row.margin,signedBase64,evidence});return result;
}
export function readOwnerSignedServerPerpsEnvelope(value,{journal}={}){
 const proof=proofs.get(value);if(!proof||journal!==undefined&&journal!==proof.journal)fail();
 readServerPerpsPreparationEvidence(proof.prepared,{walletAddress:value.walletAddress,signalId:value.signalId});
 const row=proof.journal.read(value.reservationId);
 if(row?.state!=='SIGNING'||row.wallet!==value.walletAddress||row.signal!==value.signalId||row.margin!==proof.margin)fail();
 return Object.freeze({signedBase64:proof.signedBase64,evidence:proof.evidence});
}
