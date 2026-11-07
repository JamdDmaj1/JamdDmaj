// Complete-account evidence, not an automatic journal mutation or signing grant.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {requireVerifiedPerpsEntryRecoveryHistory} from './perps-entry-recovery-history.js';
import {requireHistoricalPerpsEntryRecoveryCosts} from './perps-entry-recovery-historical-costs.js';
const proofs=new WeakMap(),consumed=new WeakSet();
function fail(){throw Error('PERPS_ENTRY_RECOVERY_COMPLETION_REQUIRED');}
export function proveAccountedPerpsEntryRecovery({journal,swapJournal,reservationId,signature,account,historicalCosts=null}){
 requirePerpsExecutionJournal(journal);requireBotSwapJournal(swapJournal);
 const parent=journal.read(reservationId),hold=journal.entryConversionHold(reservationId),swap=parent&&swapJournal.readBySignature(parent.wallet,signature);
 if(!parent||!hold||!['RESERVED','UNCERTAIN'].includes(parent.state)||parent.signal!=='manual:'+reservationId||hold.state!=='FINALIZED'
  ||swap?.state!=='FINALIZED'||JSON.parse(swap.review).reservationId!==reservationId)fail();
 requireFreshServerPerpsDailyAccount(account,{walletAddress:parent.wallet,journal});
 if(historicalCosts)requireHistoricalPerpsEntryRecoveryCosts(historicalCosts,{journal,swapJournal,account});
 const currentRecovery=account.entryRecoveries?.find(v=>v.signature===signature&&v.reservationId===reservationId);
 const recovery=currentRecovery??(historicalCosts&&historicalCosts.recoveryDay<account.day?{
  slot:historicalCosts.recoverySlot,day:historicalCosts.recoveryDay,conversionSignature:historicalCosts.conversionSignature,receivedUsdcUnits:historicalCosts.receivedUsdcUnits}:null);
 if(!recovery||account.networkFeesIncludedInUsdLoss!==true||account.requiresReconciledDailyAccounting!==false
  ||account.historyThroughSlot<recovery.slot||account.observedSlot<recovery.slot||currentRecovery&&recovery.day!==account.day
  ||recovery.conversionSignature!==hold.signature)fail();
 if(currentRecovery)requireVerifiedPerpsEntryRecoveryHistory(currentRecovery,{journal,swapJournal});
 // Same-day execution history must retain the failed opening and initial
 // conversion. Prior-day completion needs a separate historical-cost audit.
 const initial=account.entryConversions?.find(v=>v.signature===hold.signature&&v.reservationId===reservationId);
 const failed=account.transactions?.find(v=>v.signature===parent.signature&&v.failed===true);
 const unsigned=parent.state==='RESERVED';
 if(historicalCosts){
  requireHistoricalPerpsEntryRecoveryCosts(historicalCosts,{journal,swapJournal,account});
  if(historicalCosts.reservationId!==reservationId||historicalCosts.signature!==signature||historicalCosts.walletAddress!==parent.wallet
   ||historicalCosts.initialSignature!==hold.signature||historicalCosts.initialSlot>recovery.slot
   ||!initial&&historicalCosts.initialDay>=account.day
   ||unsigned&&historicalCosts.failedOpeningSlot!==null
   ||!unsigned&&(!Number.isSafeInteger(historicalCosts.failedOpeningSlot)||historicalCosts.failedOpeningSlot>recovery.slot
    ||!failed&&historicalCosts.failedOpeningDay>=account.day))fail();
 }
 if(!initial&&!historicalCosts||account.tradesToday<0||unsigned&&(parent.signature!==null||parent.wire_hash!==null||JSON.parse(swap.review).openingSignature!==null)
  ||!unsigned&&(!failed&&!historicalCosts||failed&&failed.slot>recovery.slot))fail();
 const failedOpeningSlot=unsigned?null:failed?.slot??historicalCosts.failedOpeningSlot;
 const result=Object.freeze({stage:'ACCOUNTED_ENTRY_RECOVERY_ONLY',reservationId,walletAddress:parent.wallet,signature,
  recoverySlot:recovery.slot,failedOpeningSlot,openingNeverBroadcast:unsigned,day:account.day,receivedUsdcUnits:recovery.receivedUsdcUnits,
  lossTodayUsdcUnits:account.lossTodayUsdcUnits,networkFeeUsdUnits:account.networkFeeUsdUnits,
  readyForSigning:false,tradingEnabled:false,originalRiskReleased:false});
 proofs.set(result,{journal,swapJournal,account,historicalCosts,parent:JSON.stringify(parent),hold:JSON.stringify(hold),swap:JSON.stringify(swap)});return result;
}
export function requireAccountedPerpsEntryRecovery(value){
 const p=proofs.get(value);if(!p||consumed.has(value)||JSON.stringify(p.journal.read(value.reservationId))!==p.parent
  ||JSON.stringify(p.journal.entryConversionHold(value.reservationId))!==p.hold
  ||JSON.stringify(p.swapJournal.readBySignature(value.walletAddress,value.signature))!==p.swap)fail();
 requireFreshServerPerpsDailyAccount(p.account,{walletAddress:value.walletAddress,journal:p.journal});
 if(p.historicalCosts)requireHistoricalPerpsEntryRecoveryCosts(p.historicalCosts,{journal:p.journal,swapJournal:p.swapJournal,account:p.account});return value;
}
export function consumeAccountedPerpsEntryRecovery(value,{journal}={}){
 requireAccountedPerpsEntryRecovery(value);const p=proofs.get(value);if(p.journal!==journal)fail();
 consumed.add(value);return Object.freeze({parent:p.parent,hold:p.hold});
}
