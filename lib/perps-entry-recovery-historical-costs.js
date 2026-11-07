// Read-only historical cost join. No signing, transport or reserve release.
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {recoverHeldPerpsEntryCollateral} from './perps-entry-conversion-recovery.js';
import {readBoundPerpsEntryCollateral} from './perps-entry-conversion-binding.js';
import {readServerPerpsTradeTransaction,requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import {readJournalledPerpsEntryConversion,requireVerifiedPerpsEntryConversionHistory} from './perps-entry-conversion-history.js';
import {createHistoricalPerpsEntryConversionUsdValuationReader,requireHistoricalPerpsEntryConversionUsdValuation} from './perps-entry-conversion-usd-valuation.js';
import {createHistoricalPerpsNetworkFeeValuationReader,requireHistoricalPerpsNetworkFeeValuation} from './perps-network-fee-valuation.js';
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {readEntryRecoveryAttempts} from './perps-entry-recovery-attempts.js';
import {readJournalledPerpsEntryRecovery,requireVerifiedPerpsEntryRecoveryHistory} from './perps-entry-recovery-history.js';
import {createHistoricalPerpsEntryRecoveryUsdValuationReader,requireHistoricalPerpsEntryRecoveryUsdValuation} from './perps-entry-recovery-usd-valuation.js';
import {readFailedPerpsEntryRecovery,requireFailedPerpsEntryRecovery,readFailedPerpsEntryRecoveryTransaction} from './perps-entry-recovery-failure.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_ENTRY_RECOVERY_HISTORICAL_COSTS_REQUIRED');}
function capture(journal,swapJournal,reservationId,signature){
 const parent=journal.read(reservationId),hold=journal.entryConversionHold(reservationId);
 if(!parent||!hold)fail();
 return {parent,hold,conversion:swapJournal.read(hold.conversion_id),swap:swapJournal.readBySignature(parent.wallet,signature),
  attempts:readEntryRecoveryAttempts(id=>swapJournal.read(id),{walletAddress:parent.wallet,reservationId,conversionSignature:hold.signature}).rows};
}
export async function readHistoricalPerpsEntryRecoveryCosts({journal,swapJournal,reservationId,signature,ownerAccountHash,account},
 {request,fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const started=monotonicNow(),at=now(),state=capture(journal,swapJournal,reservationId,signature),saved=JSON.stringify(state);
 const {parent,hold,swap,conversion}=state;
 if(!Number.isFinite(started)||!Number.isSafeInteger(at)||typeof request!=='function'||!['RESERVED','UNCERTAIN'].includes(parent.state)
  ||parent.signal!=='manual:'+reservationId||hold.state!=='FINALIZED'||swap?.state!=='FINALIZED'||swap.owner!==ownerAccountHash
  ||conversion?.owner!==ownerAccountHash||JSON.parse(swap.review).reservationId!==reservationId)fail();
 const current=()=>{if(JSON.stringify(capture(journal,swapJournal,reservationId,signature))!==saved)fail();};
 const guarded=async(method,params)=>{current();const result=await request(method,params);current();return result;};
 requireFreshServerPerpsDailyAccount(account,{walletAddress:parent.wallet,journal});
 if(account.networkFeesIncludedInUsdLoss!==true||account.requiresReconciledDailyAccounting!==false)fail();
 const entry=await recoverHeldPerpsEntryCollateral({executionJournal:journal,journal:swapJournal,reservationId,ownerAccountHash},{request:guarded,now,monotonicNow});
 if(entry.stage==='RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY'||entry.executionDay>account.day)fail();
 const transaction=await readServerPerpsTradeTransaction({walletAddress:parent.wallet,signature:hold.signature,day:entry.executionDay},
  {request:guarded,now,monotonicNow,requireTradeEvent:false});
 const initial=await readJournalledPerpsEntryConversion(transaction,{journal,swapJournal,request:guarded,now,monotonicNow});
 if(!initial||initial.slot!==entry.slot||initial.slot>account.historyThroughSlot)fail();
 const common={fetchImpl,now,monotonicNow},conversionInput={conversions:[initial],day:initial.day};
 const initialToday=account.entryConversions.find(row=>row.signature===hold.signature&&row.reservationId===reservationId);
 let conversionValuation=null;
 const oldTransactions=[];
 if(initial.day===account.day){if(!initialToday||initialToday.slot!==initial.slot)fail();}
 else {
  if(initialToday||account.transactions.some(row=>row.signature===initial.signature))fail();
  conversionValuation=await createHistoricalPerpsEntryConversionUsdValuationReader(common)(conversionInput);oldTransactions.push(transaction);
 }
 let recovery=account.entryRecoveries.find(row=>row.signature===signature&&row.reservationId===reservationId),recoveryValuation=null;
 if(recovery)requireVerifiedPerpsEntryRecoveryHistory(recovery,{journal,swapJournal});
 else {
  const raw=await guarded('getTransaction',[signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  if(!Number.isSafeInteger(raw?.blockTime))fail();
  const day=new Date(raw.blockTime*1000).toISOString().slice(0,10);
  if(day>=account.day||account.transactions.some(row=>row.signature===signature))fail();
  const returned=await readServerPerpsTradeTransaction({walletAddress:parent.wallet,signature,day},
   {request:(method,params)=>method==='getTransaction'&&params[0]===signature?Promise.resolve(structuredClone(raw)):guarded(method,params),now,monotonicNow,requireTradeEvent:false});
  recovery=await readJournalledPerpsEntryRecovery(returned,{journal,swapJournal,request:guarded,now,monotonicNow});
  if(!recovery)fail();
  recoveryValuation=await createHistoricalPerpsEntryRecoveryUsdValuationReader(common)({recoveries:[recovery],day});oldTransactions.push(returned);
 }
 if(recovery.conversionSignature!==initial.signature||recovery.slot<initial.slot||recovery.blockTime<initial.blockTime
  ||recovery.slot>account.historyThroughSlot||recovery.slot>account.observedSlot||recovery.day>account.day)fail();
 let opening=null,openingReceipt=null;
 if(parent.state==='UNCERTAIN'){
  let captured;
  openingReceipt=await readPerpsBroadcastReceipt({walletAddress:parent.wallet,signature:parent.signature,wireHash:parent.wire_hash},async(method,params)=>{
   const result=await guarded(method,params);if(method==='getTransaction'&&params[0]===parent.signature)captured=result;return result;
  },{now,requireFinalized:true});
  if(!openingReceipt||openingReceipt.state!=='FAILED'||openingReceipt.slot<initial.slot||openingReceipt.executionDay>account.day)fail();
  opening=await readServerPerpsTradeTransaction({walletAddress:parent.wallet,signature:parent.signature,day:openingReceipt.executionDay},
   {request:(method,params)=>method==='getTransaction'&&params[0]===parent.signature?Promise.resolve(structuredClone(captured)):guarded(method,params),now,monotonicNow,requireTradeEvent:false});
  if(!opening.failed||opening.events.length||opening.slot!==openingReceipt.slot||opening.walletFeeLamports!==opening.transactionFeeLamports
   ||opening.slot>recovery.slot||opening.blockTime<initial.blockTime||opening.blockTime>recovery.blockTime||opening.slot>account.historyThroughSlot)fail();
  const today=account.transactions.find(row=>row.signature===parent.signature);
  if(opening.day===account.day){if(!today?.failed||today.slot!==opening.slot||today.walletFeeLamports!==opening.walletFeeLamports)fail();}
  else {if(today)fail();oldTransactions.push(opening);}
 }
 const failedReturns=[];
 for(const row of state.attempts.filter(row=>row.state==='FAILED')){
  const failure=await readFailedPerpsEntryRecovery({journal:swapJournal,executionJournal:journal,id:row.id,ownerAccountHash},{request:guarded,now,monotonicNow});
  if(!failure||failure.slot>=recovery.slot||failure.day>recovery.day)fail();
  const tx=readFailedPerpsEntryRecoveryTransaction(failure),today=account.transactions.find(value=>value.signature===failure.signature);
  if(failure.day===account.day){if(!today?.failed||today.slot!==failure.slot||today.walletFeeLamports!==failure.networkFeeLamports)fail();}
  else {if(today)fail();oldTransactions.push(tx);}
  const index=state.attempts.findIndex(previous=>previous.id===row.id),next=state.attempts[index+1],reference=next&&JSON.parse(next.review).previousFailure;
  if(!reference||['signature','wireHash','slot','day'].some(key=>reference[key]!==failure[key]))fail();
  failedReturns.push(failure);
 }
 if(!oldTransactions.length)fail();
 const feeGroups=[];
 for(const day of [...new Set(oldTransactions.map(row=>row.day))]){
  const transactions=oldTransactions.filter(row=>row.day===day),valuation=await createHistoricalPerpsNetworkFeeValuationReader(common)({transactions,day});
  feeGroups.push({transactions,valuation});
 }
 const value=Object.freeze({stage:'HISTORICAL_ENTRY_RECOVERY_COSTS_ONLY',reservationId,walletAddress:parent.wallet,signature,
  initialSignature:initial.signature,initialSlot:initial.slot,initialDay:initial.day,failedOpeningSlot:opening?.slot??null,failedOpeningDay:opening?.day??null,
  accountingDay:account.day,historicalConversionLossUsdUnits:conversionValuation?.entryConversionLossUsdUnits??'0',
  recoverySlot:recovery.slot,recoveryDay:recovery.day,receivedUsdcUnits:recovery.receivedUsdcUnits,conversionSignature:recovery.conversionSignature,
  historicalRecoveryLossUsdUnits:recoveryValuation?.recoveryLossUsdUnits??'0',
  historicalNetworkFeeUsdUnits:feeGroups.reduce((sum,g)=>sum+BigInt(g.valuation.networkFeeUsdUnits),0n).toString(),
  readyForSigning:false,originalRiskReleased:false});
 proofs.set(value,{journal,swapJournal,reservationId,signature,saved,account,entry,initial,recovery,recoveryValuation,opening,openingReceipt,conversionInput,conversionValuation,feeGroups,failedReturns,started,at,now,monotonicNow});
 return requireHistoricalPerpsEntryRecoveryCosts(value,{journal,swapJournal,account});
}
export function requireHistoricalPerpsEntryRecoveryCosts(value,{journal,swapJournal,account}={}){
 const p=proofs.get(value);if(!p||p.journal!==journal||p.swapJournal!==swapJournal||p.account!==account
  ||JSON.stringify(capture(journal,swapJournal,p.reservationId,p.signature))!==p.saved)fail();
 const age=p.monotonicNow()-p.started;
 if(!Number.isFinite(age)||age<0||age>10000||p.now()<p.at||new Date(p.now()).toISOString().slice(0,10)!==value.accountingDay)fail();
 requireFreshServerPerpsDailyAccount(account,{walletAddress:value.walletAddress,journal});readBoundPerpsEntryCollateral(p.entry);
 requireVerifiedPerpsEntryConversionHistory(p.initial,{journal,swapJournal});
 requireVerifiedPerpsEntryRecoveryHistory(p.recovery,{journal,swapJournal});
 if(p.recoveryValuation)requireHistoricalPerpsEntryRecoveryUsdValuation(p.recoveryValuation,{recoveries:[p.recovery],day:p.recovery.day});
 if(p.opening){requireVerifiedServerPerpsTradeTransaction(p.opening);if(p.now()-p.openingReceipt.observedAt>10000)fail();}
 if(p.conversionValuation)requireHistoricalPerpsEntryConversionUsdValuation(p.conversionValuation,p.conversionInput);
 for(const failure of p.failedReturns)requireFailedPerpsEntryRecovery(failure,{journal:swapJournal});
 for(const group of p.feeGroups)requireHistoricalPerpsNetworkFeeValuation(group.valuation,{transactions:group.transactions});
 return value;
}
