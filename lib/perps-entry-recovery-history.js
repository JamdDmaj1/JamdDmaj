// Finalized recovery facts only. Not a generic PoolSwap exemption, valuation,
// complete-day accounting proof or permission to release reserved capital.
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireVerifiedServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
import {readRecordedPerpsEntryRecoveryReceipt} from './perps-entry-collateral-recovery-receipt.js';
import {PERPS_CUSTODIES} from './perps-server-custody.js';
import {readEntryRecoveryAttempts} from './perps-entry-recovery-attempts.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_ENTRY_RECOVERY_HISTORY_REQUIRED');}
function snapshot(journal,swapJournal,walletAddress,signature){
 const swap=swapJournal.readBySignature(walletAddress,signature);if(!swap)return null;
 const review=JSON.parse(swap.review);if(review.stage!=='ENTRY_COLLATERAL_RECOVERY_INTENT')return null;
 const parent=journal.read(review.reservationId),hold=journal.entryConversionHold(review.reservationId),conversion=hold&&swapJournal.read(hold.conversion_id);
 const attempts=readEntryRecoveryAttempts(id=>swapJournal.read(id),{walletAddress,reservationId:review.reservationId,conversionSignature:review.conversionSignature}).rows;
 return {swap,parent,hold,conversion,attempts};
}
export function requireVerifiedPerpsEntryRecoveryHistory(value,{journal,swapJournal,transaction}={}){
 const p=proofs.get(value);if(!p||journal!==undefined&&journal!==p.journal||swapJournal!==undefined&&swapJournal!==p.swapJournal
  ||transaction!==undefined&&transaction!==p.transaction)fail();
 requireVerifiedServerPerpsTradeTransaction(p.transaction);
 if(JSON.stringify(snapshot(p.journal,p.swapJournal,value.walletAddress,value.signature))!==p.saved)fail();return value;
}
export async function readJournalledPerpsEntryRecovery(transaction,{journal,swapJournal,request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireVerifiedServerPerpsTradeTransaction(transaction);
 if(journal===undefined||swapJournal===undefined)return null;
 requirePerpsExecutionJournal(journal);requireBotSwapJournal(swapJournal);
 const captured=snapshot(journal,swapJournal,transaction.walletAddress,transaction.signature);if(!captured)return null;
 if(transaction.failed||!transaction.perpsActivity||transaction.events.length||transaction.unknownPerpsEvents!==1)fail();
 const saved=JSON.stringify(captured),evidence=readVerifiedPerpsTransactionEvidence(transaction);
 const current=()=>{if(JSON.stringify(snapshot(journal,swapJournal,transaction.walletAddress,transaction.signature))!==saved)fail();};
 const receipt=await readRecordedPerpsEntryRecoveryReceipt({journal:swapJournal,executionJournal:journal,id:captured.swap.id,ownerAccountHash:captured.swap.owner},{now,monotonicNow,
  request:async(method,params)=>{current();const reply=method==='getTransaction'&&params[0]===transaction.signature?
   {slot:transaction.slot,blockTime:transaction.blockTime,transaction:[evidence.wire,'base64'],meta:evidence.meta}:await request(method,params);current();return reply;}});current();
 if(!receipt||receipt.slot!==transaction.slot||receipt.blockTime!==transaction.blockTime||receipt.executionDay!==transaction.day)fail();
 const value=Object.freeze({stage:'FINALIZED_JOURNALED_ENTRY_RECOVERY',readyForSigning:false,walletAddress:transaction.walletAddress,
  signature:transaction.signature,reservationId:captured.parent.reservation,conversionSignature:captured.conversion.signature,
  asset:receipt.asset,collateralDecimals:PERPS_CUSTODIES[receipt.asset].decimals,slot:transaction.slot,blockTime:transaction.blockTime,day:transaction.day,
  convertedCollateralUnits:receipt.convertedTokenUnits,receivedUsdcUnits:receipt.receivedUsdcUnits,swapFeeUsdcUnits:receipt.swapFeeUsdcUnits,
  networkFeeLamports:receipt.networkFeeLamports,requiresIndependentUsdValuation:true,requiresCompleteDailyAccounting:true});
 proofs.set(value,{journal,swapJournal,transaction,saved});return requireVerifiedPerpsEntryRecoveryHistory(value,{journal,swapJournal,transaction});
}
