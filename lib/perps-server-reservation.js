// Connect verified, short-lived preparation to durable risk accounting.
// The readers MUST be authenticated server stores, never request-body claims.
// Reservation is not permission to sign, and this module has no signer/send API.
import {readServerPerpsPreparationEvidence} from './perps-server-preparation.js';
import {validateAutomationSettings} from './automation-panel.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
function fail(){throw Error('PERPS_RESERVATION_REVALIDATION_REQUIRED');}
function canonicalSettings(value){return JSON.stringify(validateAutomationSettings(value));}
export async function reservePreparedServerPerpsAutomation(prepared,{journal,readAccount,readControls,walletAddress,signalId,reservationId,controlRevision}={}){
 if(typeof journal?.reserve!=='function'||typeof journal?.cancelUnsigned!=='function'||typeof readAccount!=='function'||typeof readControls!=='function'
  ||typeof controlRevision!=='string'||!controlRevision||controlRevision.length>180||/[\x00-\x1f]/.test(controlRevision))fail();
 const readEvidence=()=>readServerPerpsPreparationEvidence(prepared,{walletAddress,signalId});
 const evidence=readEvidence(),settings=canonicalSettings(evidence.settings);
 const checkControls=controls=>{
  controls=structuredClone(controls);
  if(controls?.walletAddress!==walletAddress||controls.revision!==controlRevision||controls.enabled!==true||controls.paused!==false||canonicalSettings(controls.settings)!==settings)fail();
 };
 checkControls(await readControls({walletAddress}));readEvidence();
 const observed=await readAccount({walletAddress,minimumSlot:evidence.observedSlot});
 if(observed?.requiresExclusiveCustodyJournal===true)requireFreshServerPerpsDailyAccount(observed,{walletAddress,minimumSlot:evidence.observedSlot,journal});
 const snapshot=structuredClone(observed);
 if(!Number.isSafeInteger(snapshot?.observedSlot)||snapshot.observedSlot<evidence.observedSlot)fail();
 checkControls(await readControls({walletAddress}));readEvidence();
 const limits={capitalUsd:String(evidence.settings.capital),dailyLossUsd:String(evidence.settings.loss),positions:evidence.settings.positions,dailyTrades:evidence.settings.dailyTrades};
 const reservation=journal.reserve({walletAddress,signalId,reservationId,marginUsd:evidence.marginUsd,limits,snapshot});
 try{
  // If evidence expires during the durable write, release only this unsigned
  // reservation. Journal failure keeps funds held; never enter signing here.
  readEvidence();
  if(reservation?.state!=='RESERVED'||reservation.wallet!==walletAddress||reservation.signal!==signalId||reservation.reservation!==reservationId)fail();
  return Object.freeze({stage:'RESERVED_NOT_AUTHORIZED',readyForSigning:false,tradingEnabled:false,reservation,evidence,
   requiresFreshControlAndChainChecks:true,requiresCustodyAuthorization:true});
 }catch(error){journal.cancelUnsigned(reservationId);throw error;}
}
