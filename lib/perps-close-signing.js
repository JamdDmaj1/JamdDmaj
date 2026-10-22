// Dedicated first-leg authority for explicitly reviewed native settlement:
// on-chain close PRICE limit, no absolute first-leg payout guarantee, followed
// by a separately journaled Swap2 minimum when conversion is required.
import {createHash} from 'node:crypto';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {readServerPerpsFullCloseOracleEffects,checkServerPerpsFullCloseOracleEffects} from './perps-server-close-oracle-effects.js';
import {readServerPerpsFullCloseReserves,checkServerPerpsFullCloseReserves} from './perps-server-close-reserves.js';
import {readServerPerpsFullCloseVaults,checkServerPerpsFullCloseVaults} from './perps-server-close-vaults.js';
import {readServerPerpsFullCloseFunding,checkServerPerpsFullCloseFunding} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation,simulateServerPerpsFullCloseEffects} from './perps-server-close-simulation.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {readServerPerpsCloseOracles} from './perps-close-oracle-context.js';
import {checkServerPerpsFullCloseInstructionPolicy} from './perps-server-close-policy.js';
import {checkServerPerpsFullCloseCore} from './perps-server-close-intent.js';
import {describeSimulatedPerpsCloseSettlement,canonicalPerpsCloseSettlement} from './perps-close-settlement.js';
import {readSimulatedPerpsCloseReturn,checkSimulatedPerpsCloseReturn} from './perps-close-return-policy.js';
import {verifyOwnerSignedPerpsCloseIntent} from './perps-close-execution-record.js';
import {PERPS_PROGRAM} from './perps-server-custody.js';
export const NATIVE_CLOSE_PROTECTION='NATIVE_PRICE_THEN_USDC_MINIMUM';
const grants=new WeakMap(),permissions=new WeakSet(),signedProofs=new WeakMap();
function fail(){throw Error('PERPS_NATIVE_CLOSE_NOT_AUTHORIZED');}
function evidence(effects){
 const {reserves}=readServerPerpsFullCloseOracleEffects(effects),{vaults}=readServerPerpsFullCloseReserves(reserves);
 const {funding}=readServerPerpsFullCloseVaults(vaults),{simulation}=readServerPerpsFullCloseFunding(funding);
 const {inspection}=readServerPerpsFullCloseSimulation(simulation),{plan}=readInspectedServerPerpsFullClose(inspection);
 return {funding,simulation,inspection,plan};
}
export function describeNativePerpsCloseProtection(oracleEffects,returnPolicy){
 const {plan,funding}=evidence(oracleEffects),{limits}=readSimulatedPerpsCloseReturn(returnPolicy,{oracleEffects});
 if(plan.settlement!=='COLLATERAL_THEN_USDC'||limits.minimumReturnUnits!=='0')fail();
 return Object.freeze({stage:'NATIVE_CLOSE_PROTECTION_REVIEW',readyForSigning:false,walletAddress:plan.walletAddress,positionAddress:plan.positionAddress,
  settlementProtection:NATIVE_CLOSE_PROTECTION,firstLegProtection:'ON_CHAIN_PRICE_LIMIT',firstLegAbsoluteMinimum:null,
  priceLimitUsdUnits:plan.priceLimitUsdUnits,receiveAsset:plan.requiresSeparateUsdcConversion?plan.asset:'USDC',
  estimatedTokenUnits:plan.requiresSeparateUsdcConversion?funding.receivedCollateralUnits:funding.receivedUsdcUnits,
  maximumNetworkFeeLamports:limits.maximumNetworkFeeLamports,requiresProtectedUsdcConversion:plan.requiresSeparateUsdcConversion,
  conversionMinimumUsdcUnits:null,conversionMinimumStatus:plan.requiresSeparateUsdcConversion?'REQUIRES_SEPARATE_FINALIZED_PROCEEDS_REVIEW':'NOT_REQUIRED',
  estimatesAreGuaranteed:false});
}
export async function authorizeNativePerpsFullClose(oracleEffects,{returnPolicy,journal,controls,backupRegistry,request,isClosingAllowed,
 ownerAccountHash,walletAddress,closeId,controlRevision,settlementProtection,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePerpsExecutionJournal(journal);
 if(settlementProtection!==NATIVE_CLOSE_PROTECTION||typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)
  ||typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof request!=='function'
  ||typeof isClosingAllowed!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const {inspection,plan}=evidence(oracleEffects),approved=readSimulatedPerpsCloseReturn(returnPolicy,{oracleEffects}).limits;
 const review=describeNativePerpsCloseProtection(oracleEffects,returnPolicy);
 // A positive review floor cannot be silently downgraded to a price bound.
 if(approved.minimumReturnUnits!=='0'||plan.settlement!=='COLLATERAL_THEN_USDC'||plan.walletAddress!==walletAddress)fail();
 const row=Object.freeze(journal.readPositionClose(closeId)),description=JSON.parse(describeSimulatedPerpsCloseSettlement(oracleEffects).encoded);
 const expected=canonicalPerpsCloseSettlement({...description,returnLimits:approved},plan),wire=inspection.envelope.serializedTxBase64;
 if(row?.state!=='PREPARED'||row.wallet!==walletAddress||row.position!==plan.positionAddress||row.settlement!==expected
  ||row.unsigned_wire_hash!==createHash('sha256').update(Buffer.from(wire,'base64')).digest('hex'))fail();
 const encoded=JSON.stringify(row);let signing=false,latest=null;
 function recheck(){
  evidence(oracleEffects);readSimulatedPerpsCloseReturn(returnPolicy,{oracleEffects});
  if(isClosingAllowed()!==true||JSON.stringify(journal.readPositionClose(closeId))!==encoded)fail();
  const c=controls.read({ownerAccountHash,walletAddress}),execution=journal.readPositionCloseExecution(closeId);
  if(c?.walletAddress!==walletAddress||c.revision!==controlRevision||typeof c.enabled!=='boolean'||c.paused!==!c.enabled
   ||journal.pending(walletAddress).length||journal.pendingExitCancellations(walletAddress).length)fail();
  if(signing){if(execution?.state!=='SIGNING')fail();journal.readPositionCloseSettlement(closeId);}
  else if(execution!==null)fail();
  requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified({ownerAccountHash,walletAddress}),{ownerAccountHash,walletAddress});
 }
 async function refresh(){
  recheck();const guarded=async(m,p)=>{recheck();const v=await request(m,p);recheck();return v;};
  const at=now();if(!Number.isSafeInteger(at)||at<30000)fail();const nowSeconds=Math.floor(at/1000);
  checkServerPerpsFullCloseCore(inspection.envelope.instructions.find(ix=>inspection.resolvedKeys[ix.program]===PERPS_PROGRAM&&
   ['2e17f02c1e8a5e8c','a2bfc83e8b3eb011'].includes(Buffer.from(ix.dataBase64,'base64').subarray(0,8).toString('hex')))?.dataBase64,plan,nowSeconds);
  const context=await readServerPerpsCloseOracles(inspection,{request:guarded});
  const policy=checkServerPerpsFullCloseInstructionPolicy(inspection,{oracleContext:context,nowSeconds});
  const minimumSlot=Math.max(row.observed_slot,context.observedSlot,latest?.observedSlot??0);
  const simulation=await simulateServerPerpsFullCloseEffects(inspection,{request:guarded,oracleContext:context,minimumSlot,monotonicNow});
  const funding=await checkServerPerpsFullCloseFunding(simulation,{request:guarded,monotonicNow});
  const vaults=await checkServerPerpsFullCloseVaults(funding,policy),reserves=checkServerPerpsFullCloseReserves(vaults);
  const effects=checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:Math.floor(now()/1000)});
  checkSimulatedPerpsCloseReturn(effects,approved);
  if(funding.networkFeeLamports!==String(row.fee_lamports)
   ||BigInt(readServerPerpsFullCloseSimulation(simulation).after[walletAddress].lamports)<1000000n)fail();
  recheck();latest=effects;return effects;
 }
 await refresh();recheck();journal.beginPositionCloseSigning(closeId);signing=true;recheck();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const common=()=>{recheck();evidence(latest);};
 const grant=Object.freeze({stage:'SINGLE_USE_NATIVE_CLOSE_AUTHORIZATION',ownerAccountHash,walletAddress,closeId,controlRevision,
  settlementProtection:NATIVE_CLOSE_PROTECTION,firstLegAbsoluteMinimum:null,priceLimitUsdUnits:plan.priceLimitUsdUnits,review});
 grants.set(grant,{used:false,journal,inspection,row,wire,common,refresh,started,monotonicNow});return grant;
}
export function consumeNativePerpsCloseAuthorization(grant){
 const p=grants.get(grant);if(!p||p.used)fail();
 const revalidate=()=>{const age=p.monotonicNow()-p.started;if(!Number.isFinite(age)||age<0||age>2000)fail();p.common();};
 revalidate();p.used=true;
 const authority=Object.freeze({ownerAccountHash:grant.ownerAccountHash,walletAddress:grant.walletAddress,closeId:grant.closeId,
  controlRevision:grant.controlRevision,journal:p.journal,inspection:p.inspection,row:p.row,serializedTxBase64:p.wire,revalidate,
  revalidateForBroadcast:p.common,revalidateFreshForBroadcast:p.refresh});permissions.add(authority);return authority;
}
export function verifyAuthorizedNativePerpsCloseSignature(encoded,authority){
 if(!permissions.has(authority))fail();authority.revalidate();
 const intent=verifyOwnerSignedPerpsCloseIntent(authority.row,encoded);authority.revalidate();permissions.delete(authority);
 const signed=Object.freeze({stage:'AUTHORIZED_NATIVE_CLOSE_OWNER_SIGNATURE',closeId:authority.closeId,walletAddress:authority.walletAddress,
  signature:intent.signature,wireHash:intent.wireHash,readyForBroadcast:false});signedProofs.set(signed,{encoded,intent,authority});return signed;
}
export function readAuthorizedNativePerpsCloseSignature(value,{journal}={}){
 const p=signedProofs.get(value);if(!p||p.authority.journal!==journal)fail();p.authority.revalidateForBroadcast();return p;
}
