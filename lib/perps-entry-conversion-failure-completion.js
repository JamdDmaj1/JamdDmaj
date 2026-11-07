// Release evidence only for an exact rooted first-leg failure with full costs.
import {requireRecordedPerpsEntryConversionFailure} from './perps-entry-conversion-recovery.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {perpsNavigationDraft} from './perps-navigation.js';
const proofs=new WeakMap(),used=new WeakSet();
function fail(){throw Error('PERPS_ENTRY_CONVERSION_FAILURE_ACCOUNTING_REQUIRED');}
export function proveAccountedFailedEntryConversion({journal,swapJournal,reservationId,failure,account}){
 requirePerpsExecutionJournal(journal);requireBotSwapJournal(swapJournal);requireRecordedPerpsEntryConversionFailure(failure,{journal:swapJournal});
 const parent=journal.read(reservationId),hold=journal.entryConversionHold(reservationId),swap=swapJournal.read(failure.id),review=swap&&JSON.parse(swap.review);
 if(parent?.state!=='RESERVED'||parent.signal!=='manual:'+reservationId||parent.signature!==null||parent.wire_hash!==null
  ||hold?.state!=='HELD'||hold.signature!==null||hold.wire_hash!==null||hold.conversion_id!==failure.id||parent.wallet!==failure.walletAddress
  ||hold.input_units!==String(parent.margin)||review?.reservationId!==reservationId||review.stage!=='PROTECTED_ENTRY_CONVERSION_PREPARED'
  ||review.maxSlippageBps!==50||review.usdcUnits!==hold.input_units||JSON.stringify(perpsNavigationDraft(review.draft))!==hold.draft_json)fail();
 requireFreshServerPerpsDailyAccount(account,{walletAddress:parent.wallet,minimumSlot:failure.slot,journal});
 const transaction=account.transactions.find(v=>v.signature===failure.signature);
 if(account.networkFeesIncludedInUsdLoss!==true||account.requiresReconciledDailyAccounting!==false||account.historyThroughSlot<failure.slot)fail();
 const sameDay=account.day===failure.day;
 // An exact rooted failure commits no conversion or collateral. Its fee belongs
 // to its verified transaction day, not the day a status query finally resumes.
 // Current-day costs still require a complete, freshly valued account. Never
 // use this exception for a successful conversion or an unverified failed row.
 if(sameDay){
  if(!transaction?.failed||transaction.slot!==failure.slot||transaction.walletFeeLamports!==failure.networkFeeLamports)fail();
 }else if(failure.day>=account.day||transaction!==undefined)fail();
 const value=Object.freeze({stage:'ACCOUNTED_FAILED_ENTRY_CONVERSION',reservationId,walletAddress:parent.wallet,conversionId:failure.id,
  signature:failure.signature,slot:failure.slot,day:failure.day,accountingDay:account.day,feeIncludedInCurrentDay:sameDay,
  readyForSigning:false,originalRiskReleased:false});
 proofs.set(value,{journal,swapJournal,failure,account,parent:JSON.stringify(parent),hold:JSON.stringify(hold),swap:JSON.stringify(swap)});return value;
}
export function consumeAccountedFailedEntryConversion(value,{journal}={}){
 const p=proofs.get(value);if(!p||used.has(value)||p.journal!==journal)fail();
 requireRecordedPerpsEntryConversionFailure(p.failure,{journal:p.swapJournal});
 requireFreshServerPerpsDailyAccount(p.account,{walletAddress:value.walletAddress,minimumSlot:value.slot,journal});
 if(JSON.stringify(journal.read(value.reservationId))!==p.parent||JSON.stringify(journal.entryConversionHold(value.reservationId))!==p.hold
  ||JSON.stringify(p.swapJournal.read(value.conversionId))!==p.swap)fail();
 used.add(value);return p;
}
