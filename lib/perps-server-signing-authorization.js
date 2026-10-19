// Short, one-use authority for the exclusive server custody signer. A plain
// object, saved settings, successful simulation or reservation alone is not it.
import {performance} from 'node:perf_hooks';
import {readServerPerpsPreparationEvidence} from './perps-server-preparation.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {validateAutomationSettings} from './automation-panel.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
const grants=new WeakMap();
function fail(){throw Error('PERPS_CUSTODY_SIGNING_NOT_AUTHORIZED');}
function settings(value){return JSON.stringify(validateAutomationSettings(value));}
export async function authorizeServerPerpsSigning(prepared,{controls,journal,readAccount,ownerAccountHash,walletAddress,signalId,reservationId,controlRevision,monotonicNow=()=>performance.now()}={}){
 if(typeof controls?.read!=='function'||typeof journal?.read!=='function'||typeof journal?.revalidateSigning!=='function'||typeof readAccount!=='function'
  ||typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)||typeof monotonicNow!=='function')fail();
 const evidence=readServerPerpsPreparationEvidence(prepared,{walletAddress,signalId}),expected=settings(evidence.settings);
 function recheck(){
  readServerPerpsPreparationEvidence(prepared,{walletAddress,signalId});
  const current=controls.read({ownerAccountHash,walletAddress}),row=journal.read(reservationId);
  if(current.walletAddress!==walletAddress||current.revision!==controlRevision||current.enabled!==true||current.paused!==false||settings(current.settings)!==expected
   ||row?.state!=='SIGNING'||row.wallet!==walletAddress||row.signal!==signalId||row.reservation!==reservationId||BigInt(row.margin)!==BigInt(prepared.plan.body.inputTokenAmount)
   ||row.position_address!==evidence.positionAddress||row.entry_exit_plan!==canonicalServerPerpsEntryExitPlan(evidence.entryExitPlan))fail();
 }
 recheck();
 const account=await readAccount({walletAddress,minimumSlot:evidence.observedSlot});
 requireFreshServerPerpsDailyAccount(account,{walletAddress,minimumSlot:evidence.observedSlot,journal});recheck();
 const limits={capitalUsd:String(evidence.settings.capital),dailyLossUsd:String(evidence.settings.loss),positions:evidence.settings.positions,dailyTrades:evidence.settings.dailyTrades};
 journal.revalidateSigning(reservationId,{limits,snapshot:account});
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const grant=Object.freeze({stage:'SINGLE_USE_CUSTODY_SIGNING_AUTHORIZATION',ownerAccountHash,walletAddress,signalId,reservationId,controlRevision,wireHash:evidence.wireHash});
 grants.set(grant,{prepared,journal,account,limits,recheck,clock:monotonicNow,started,consumed:false,evidence});return grant;
}
export function consumeServerPerpsSigningAuthorization(grant){
 const proof=grants.get(grant);if(!proof||proof.consumed)fail();
 const revalidate=()=>{
  const elapsed=proof.clock()-proof.started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>2000)fail();
  proof.recheck();requireFreshServerPerpsDailyAccount(proof.account,{walletAddress:grant.walletAddress,minimumSlot:proof.evidence.observedSlot,journal:proof.journal});
  proof.journal.revalidateSigning(grant.reservationId,{limits:proof.limits,snapshot:proof.account});
 };
 revalidate();proof.consumed=true;
 return Object.freeze({prepared:proof.prepared,journal:proof.journal,walletAddress:grant.walletAddress,ownerAccountHash:grant.ownerAccountHash,
  signalId:grant.signalId,reservationId:grant.reservationId,revalidate});
}
