// One-use custody authority for a recorded finalized close's protected second
// leg. Never opens positions or activates automation. No network sender here.
import {readJournaledPerpsCloseConversion} from './perps-journal-close-conversion.js';
import {simulatePerpsCloseConversion,readSimulatedPerpsCloseConversion} from './perps-close-conversion-simulation.js';
import {storedPerpsCloseConversionWire,verifyOwnerSignedPerpsCloseConversionIntent} from './perps-close-conversion-record.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
const grants=new WeakMap(),permissions=new WeakSet(),signedProofs=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_CONVERSION_NOT_AUTHORIZED');}
export async function authorizePerpsCloseConversion(prepared,{journal,controls,backupRegistry,request,isClosingAllowed,
 ownerAccountHash,walletAddress,closeId,controlRevision,maxSlippageBps,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePerpsExecutionJournal(journal);
 if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)||typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'
  ||typeof request!=='function'||typeof isClosingAllowed!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'
  ||!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100)fail();
 const p=readJournaledPerpsCloseConversion(prepared,journal),wire=p.prepared.wire;
 if(p.id!==closeId||p.close.wallet!==walletAddress||wire.walletAddress!==walletAddress)fail();
 const wireJson=storedPerpsCloseConversionWire(wire);let signing=false,latest;
 function recheck(){
  readJournaledPerpsCloseConversion(prepared,journal);
  if(isClosingAllowed()!==true)fail();
  const c=controls.read({ownerAccountHash,walletAddress}),row=journal.readPositionCloseConversion(closeId);
  if(c?.walletAddress!==walletAddress||c.revision!==controlRevision||typeof c.enabled!=='boolean'||c.paused!==!c.enabled
   ||row?.state!==(signing?'SIGNING':'PREPARED')||row.wire_json!==wireJson||row.signature!==null||row.wire_hash!==null
   ||journal.pending(walletAddress).length||journal.pendingExitCancellations(walletAddress).length)fail();
  requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified({ownerAccountHash,walletAddress}),{ownerAccountHash,walletAddress});
  return row;
 }
 async function refresh(){
  const row=recheck(),before=JSON.stringify(row),guarded=async(m,args)=>{recheck();const value=await request(m,args);recheck();return value;};
  const simulation=await simulatePerpsCloseConversion(wire,{request:guarded,minimumSlot:row.prepared_slot,maxSlippageBps,now,monotonicNow});
  const evidence=readSimulatedPerpsCloseConversion(simulation);
  if(JSON.stringify(recheck())!==before||simulation.networkFeeLamports!==String(row.fee_lamports)
   ||BigInt(evidence.after[walletAddress].lamports)<1000000n)fail();
  latest=simulation;return simulation;
 }
 await refresh();recheck();journal.beginPositionCloseConversionSigning(closeId,prepared);signing=true;recheck();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const common=()=>{recheck();readSimulatedPerpsCloseConversion(latest);};
 const grant=Object.freeze({stage:'SINGLE_USE_CLOSE_CONVERSION_AUTHORIZATION',walletAddress,ownerAccountHash,closeId,controlRevision});
 grants.set(grant,{used:false,wire,journal,started,monotonicNow,common,refresh,latest:()=>latest});return grant;
}
export function consumePerpsCloseConversionAuthorization(grant){
 const p=grants.get(grant);if(!p||p.used)fail();
 const revalidate=()=>{const age=p.monotonicNow()-p.started;if(!Number.isFinite(age)||age<0||age>2000)fail();p.common();};
 revalidate();p.used=true;
 const authority=Object.freeze({walletAddress:grant.walletAddress,ownerAccountHash:grant.ownerAccountHash,closeId:grant.closeId,controlRevision:grant.controlRevision,
  journal:p.journal,wire:p.wire,revalidate,revalidateForBroadcast:p.common,revalidateFreshForBroadcast:p.refresh,latestSimulation:p.latest});
 permissions.add(authority);return authority;
}
export function verifyAuthorizedPerpsCloseConversionSignature(encoded,authority){
 if(!permissions.has(authority))fail();authority.revalidate();
 const intent=verifyOwnerSignedPerpsCloseConversionIntent(authority.wire,encoded);authority.revalidate();permissions.delete(authority);
 const signed=Object.freeze({stage:'AUTHORIZED_CLOSE_CONVERSION_OWNER_SIGNATURE',walletAddress:authority.walletAddress,closeId:authority.closeId,
  signature:intent.signature,wireHash:intent.wireHash,readyForBroadcast:false});
 signedProofs.set(signed,{encoded,intent,authority});return signed;
}
export function readAuthorizedPerpsCloseConversionSignature(signed,{journal}={}){
 const p=signedProofs.get(signed);if(!p||p.authority.journal!==journal)fail();p.authority.revalidateForBroadcast();return p;
}
