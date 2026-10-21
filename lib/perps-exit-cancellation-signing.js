// Separate, one-use cancellation-only custody authority. This never activates a
// bot, opens a position, exposes a seed, provides a generic signer or sends wire.
import {createHash,createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {readInspectedPerpsExitCancellationEvidence,requireInspectedPerpsExitCancellation,perpsCancellationUnsignedWireHash} from './perps-exit-cancellation.js';
import {readSimulatedPerpsExitCancellationEvidence,requireSimulatedPerpsExitCancellation,readPerpsCancellationUsdcBalance} from './perps-exit-cancellation-simulation.js';
import {requireFreshServerPerpsAccount} from './perps-server-account.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {decodeRecordedServerPerpsExit} from './perps-server-exits.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const grants=new WeakMap(),permissions=new WeakMap(),signedProofs=new WeakMap();
function fail(){throw Error('PERPS_CANCELLATION_SIGNING_NOT_AUTHORIZED');}
export async function authorizeServerPerpsExitCancellation(simulation,{controls,journal,backupRegistry,readAccount,request,isExecutionRunning,
 ownerAccountHash,walletAddress,cancellationId,controlRevision,monotonicNow=()=>performance.now()}={}){
 if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)||typeof controls?.read!=='function'||typeof journal?.readExitCancellation!=='function'
  ||typeof journal?.read!=='function'||typeof journal?.pending!=='function'||typeof journal?.pendingExitCancellations!=='function'||typeof journal?.beginExitCancellationSigning!=='function'
  ||typeof backupRegistry?.readVerified!=='function'||typeof readAccount!=='function'||typeof request!=='function'||typeof isExecutionRunning!=='function'||typeof monotonicNow!=='function')fail();
 const {inspection}=readSimulatedPerpsExitCancellationEvidence(simulation),evidence=readInspectedPerpsExitCancellationEvidence(inspection),cleanup=evidence.cleanup;
 if(inspection.walletAddress!==walletAddress)fail();let signing=false;
 function recheck(){
  requireInspectedPerpsExitCancellation(inspection);requireSimulatedPerpsExitCancellation(simulation);
  if(typeof journal.assertExitCancellationCloseAllowed==='function')journal.assertExitCancellationCloseAllowed(cleanup);
  if(isExecutionRunning()!==true)fail();
  const current=controls.read({ownerAccountHash,walletAddress}),row=journal.readExitCancellation(cancellationId),entry=journal.read(inspection.reservationId);
  if(current.walletAddress!==walletAddress||current.revision!==controlRevision||typeof current.enabled!=='boolean'||current.paused!==!current.enabled
   ||row?.state!==(signing?'SIGNING':'PREPARED')||row.wallet!==walletAddress||row.address!==inspection.exitAddress||row.reservation!==inspection.reservationId
   ||row.signature!==null||row.wire_hash!==null||row.unsigned_wire_hash!==perpsCancellationUnsignedWireHash(inspection)||String(row.fee_lamports)!==simulation.feeLamports
   ||entry?.state!=='OPEN'||entry.wallet!==walletAddress||entry.signature!==cleanup.signature||entry.wire_hash!==cleanup.wireHash
   ||entry.position_address!==cleanup.positionAddress||entry.entry_exit_plan!==cleanup.entryExitPlan||journal.pending(walletAddress).length)fail();
  const pending=journal.pendingExitCancellations(walletAddress);if(pending.length!==1||pending[0].id!==cancellationId)fail();
  requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified({ownerAccountHash,walletAddress}),{ownerAccountHash,walletAddress});
 }
 async function pendingAt(minimumSlot){
  const addresses=[inspection.exitAddress,inspection.requestAta],reply=await request('getMultipleAccounts',[addresses,{commitment:'confirmed',encoding:'base64',minContextSlot:minimumSlot}]);
  if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<minimumSlot)fail();
  const bank=canonicalServerPerpsSimulationSnapshot(addresses,reply.value);
  await decodeRecordedServerPerpsExit(evidence.pending,bank[inspection.exitAddress],evidence.intent);
  if(readPerpsCancellationUsdcBalance(bank[inspection.requestAta],inspection.exitAddress).toString()!==simulation.returnedUsdcUnits
   ||(BigInt(bank[inspection.exitAddress].lamports)+BigInt(bank[inspection.requestAta].lamports)).toString()!==simulation.recoveredRentLamports)fail();
  return reply.context.slot;
 }
 const required=BigInt(simulation.feeLamports)+BigInt(simulation.addedOwnerAtaRentLamports)+1000000n;
 async function revalidateFresh(){
  recheck();if(await request('getGenesisHash',[])!==GENESIS)fail();
  const minimum=await pendingAt(simulation.observedSlot),account=await readAccount({walletAddress,ownerAccountHash,minimumSlot:minimum});
  requireFreshServerPerpsAccount(account,{walletAddress,minimumSlot:minimum});recheck();
  if(account.source!==inspection.ownerAta||BigInt(account.payerLamports)<required)fail();
  const lastSlot=await pendingAt(account.observedSlot),height=await request('getBlockHeight',[{commitment:'confirmed',minContextSlot:lastSlot}]);
  if(!Number.isSafeInteger(height)||height<0||BigInt(height)>BigInt(evidence.lastValidBlockHeight)||await request('getGenesisHash',[])!==GENESIS)fail();
  requireFreshServerPerpsAccount(account,{walletAddress,minimumSlot:minimum});recheck();return {account,minimum};
 }
 const {account,minimum}=await revalidateFresh();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 journal.beginExitCancellationSigning(cancellationId,simulation);signing=true;recheck();
 const revalidateCommon=()=>{recheck();requireFreshServerPerpsAccount(account,{walletAddress,minimumSlot:minimum});if(BigInt(account.payerLamports)<required)fail();};
 const grant=Object.freeze({stage:'SINGLE_USE_EXIT_CANCELLATION_AUTHORIZATION',walletAddress,ownerAccountHash,cancellationId,exitAddress:inspection.exitAddress,controlRevision});
 grants.set(grant,{consumed:false,inspection,simulation,journal,started,clock:monotonicNow,revalidateCommon,revalidateFresh});return grant;
}
export function consumeServerPerpsExitCancellationAuthorization(grant){
 const proof=grants.get(grant);if(!proof||proof.consumed)fail();
 const revalidate=()=>{const age=proof.clock()-proof.started;if(!Number.isFinite(age)||age<0||age>2000)fail();proof.revalidateCommon();};
 revalidate();proof.consumed=true;
 const authorization=Object.freeze({inspection:proof.inspection,simulation:proof.simulation,journal:proof.journal,walletAddress:grant.walletAddress,
  ownerAccountHash:grant.ownerAccountHash,cancellationId:grant.cancellationId,controlRevision:grant.controlRevision,revalidate,revalidateForBroadcast:proof.revalidateCommon,
  revalidateFreshForBroadcast:proof.revalidateFresh});
 permissions.set(authorization,{used:false});return authorization;
}
export function verifyOwnerSignedPerpsExitCancellation(encoded,authorization){
 const permission=permissions.get(authorization);if(!permission||permission.used||typeof encoded!=='string'||encoded.length>1644)fail();
 authorization.revalidate();const original=Buffer.from(authorization.inspection.envelope.serializedTxBase64,'base64'),wire=Buffer.from(encoded,'base64');
 if(wire.toString('base64')!==encoded||wire.length!==original.length||wire[0]!==3||wire.subarray(65,129).some(b=>b!==0)||!wire.subarray(65).equals(original.subarray(65)))fail();
 const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(authorization.walletAddress))]),format:'der',type:'spki'});
 if(!verify(null,wire.subarray(193),key,wire.subarray(1,65)))fail();
 authorization.revalidate();permission.used=true;
 const value=Object.freeze({stage:'OWNER_CANCELLATION_SIGNATURE_ONLY',walletAddress:authorization.walletAddress,cancellationId:authorization.cancellationId,
  exitAddress:authorization.inspection.exitAddress,signature:bs58.encode(wire.subarray(1,65)),wireHash:createHash('sha256').update(wire).digest('hex'),readyForBroadcast:false});
 signedProofs.set(value,Object.freeze({encoded,authorization}));return value;
}
export function readOwnerSignedPerpsExitCancellation(value,{journal}={}){
 const proof=signedProofs.get(value);if(!proof||journal!==undefined&&journal!==proof.authorization.journal)fail();
 proof.authorization.revalidateForBroadcast();return Object.freeze({signedBase64:proof.encoded,authorization:proof.authorization});
}
