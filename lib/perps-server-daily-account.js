// Complete finalized address history + verified transaction effects + native
// account bank. No API P/L, caller-provided loss totals or signatures are trusted.
import {performance} from 'node:perf_hooks';
import {readServerPerpsAccount,requireFreshServerPerpsAccount} from './perps-server-account.js';
import {readServerPerpsSignatureHistory,requireFreshServerPerpsSignatureHistory} from './perps-server-signature-history.js';
import {readServerPerpsTradeTransaction,requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import {readJournalledPerpsCancellation} from './perps-cancellation-history.js';
import {requirePerpsNetworkFeeValuation} from './perps-network-fee-valuation.js';
import {readJournalledPerpsConversion,requireVerifiedPerpsConversionHistory} from './perps-conversion-history.js';
import {requirePerpsConversionUsdValuation} from './perps-conversion-usd-valuation.js';
import {readJournalledPerpsPlatformFee,requirePerpsPlatformFeeHistory} from './perps-platform-fee-history.js';
const proofs=new WeakMap();
function fail(){throw Error('UNRECONCILED_SERVER_PERPS_DAILY_ACCOUNT');}
export function requireFreshServerPerpsDailyAccount(value,{walletAddress,minimumSlot=0,journal}={}){
 const proof=proofs.get(value);if(!proof||value.walletAddress!==walletAddress||value.observedSlot<minimumSlot)fail();
 if(proof.recheckFees)proof.recheckFees();
 // Plain finalized chain accounting can be independent of a journal. Once a
 // journal-derived exception or custody baseline is used, it cannot be moved
 // to a different journal for authorization.
 if(proof.journal!==undefined&&journal!==undefined&&journal!==proof.journal)fail();
 requireFreshServerPerpsAccount(proof.account,{walletAddress,minimumSlot});
 if(proof.baseline){
  requireFreshServerPerpsDailyAccount(proof.baseline,{walletAddress});
 }else requireFreshServerPerpsSignatureHistory(proof.history,{walletAddress,day:value.day});
 if(proof.conversions?.length){
  for(const conversion of proof.conversions)requireVerifiedPerpsConversionHistory(conversion,{journal:proof.journal});
  requirePerpsConversionUsdValuation(proof.conversionValuation,{conversions:proof.conversions,day:value.day});
 }
 if(proof.platformFees)for(const fee of proof.platformFees)requirePerpsPlatformFeeHistory(fee);
 const age=proof.clock()-proof.started;if(!Number.isFinite(age)||age<0||age>10000||new Date(proof.now()).toISOString().slice(0,10)!==value.day)fail();return value;
}
// The exclusive custody signer has no unjournaled transaction API. Confirmed
// funds may therefore be used without waiting for finality only while ALL open
// and uncertain journal collateral remains charged. Closing a position in the
// confirmed bank never frees its finalized/journal risk. This reader is not for
// imported keys or a user's separately operated main/Phantom wallet.
export function createServerPerpsCustodyRiskReader({request,journal,verifyExclusiveCustody,readNetworkFees,readConversionLoss,paymentJournal,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof journal?.riskState!=='function'||typeof verifyExclusiveCustody!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const baselines=new Map(),readFinalized=createServerPerpsDailyAccountReader({request,now,monotonicNow,journal,readNetworkFees,readConversionLoss,paymentJournal});
 return async function read({walletAddress,ownerAccountHash,minimumSlot=0}){
  if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash))fail();
  const identity=await verifyExclusiveCustody({walletAddress,ownerAccountHash});
  if(identity?.exclusive!==true||identity.purpose!=='jamddmaj-perps-automation'||identity.walletAddress!==walletAddress||identity.ownerAccountHash!==ownerAccountHash)fail();
  const started=monotonicNow();if(!Number.isFinite(started))fail();
  const key=ownerAccountHash+':'+walletAddress,feesVersion=paymentJournal?.walletVersion(walletAddress);let cached=baselines.get(key);
  if(cached&&cached.feesVersion!==feesVersion)cached=null;
  if(cached){const age=started-cached.started;if(!Number.isFinite(age)||age<0||age>5000)cached=null;else try{requireFreshServerPerpsDailyAccount(cached.value,{walletAddress});}catch{cached=null;}}
  if(!cached){
   const value=await readFinalized({walletAddress});cached={value,started,feesVersion};
   if(baselines.size>=64)baselines.delete(baselines.keys().next().value);baselines.set(key,cached);
  }
  const baseline=cached.value,current=await readServerPerpsAccount({walletAddress,minimumSlot:Math.max(minimumSlot,baseline.historyThroughSlot)},{request,now,monotonicNow,commitment:'confirmed'});
  requireFreshServerPerpsDailyAccount(baseline,{walletAddress});
  const ledger=journal.riskState(walletAddress),day=new Date(now()).toISOString().slice(0,10);
  if(ledger.walletAddress!==walletAddress||ledger.day!==day||baseline.day!==day)fail();
  const collateral=new Map();
  for(const position of [...baseline.positions,...current.positions]){
   const before=collateral.get(position.address)??0n,next=BigInt(position.collateralUsdUnits);collateral.set(position.address,before>next?before:next);
  }
  const chainRisk=[...collateral.values()].reduce((sum,value)=>sum+value,0n),heldOpen=BigInt(ledger.activeMarginUsdcUnits);
  const result=Object.freeze({...baseline,...current,stage:'RECONCILED_CUSTODY_RISK_ACCOUNT',readyForSigning:false,balancesComplete:true,day,
   observedAt:Math.min(baseline.observedAt,current.observedAt),lossTodayUsdcUnits:baseline.lossTodayUsdcUnits,
   allocatedUsdcUnits:String(chainRisk>heldOpen?chainRisk:heldOpen),openPositions:Math.max(collateral.size,ledger.openReservationCount),
   observedOpenPositions:current.openPositions,finalizedOpenPositions:baseline.openPositions,
   tradesToday:Math.max(baseline.tradesToday,ledger.executedToday),pendingMarginUsdcUnits:ledger.pendingMarginUsdcUnits,pendingCount:ledger.pendingCount,
   historyThroughSlot:baseline.historyThroughSlot,requiresReconciledDailyAccounting:false,requiresExclusiveCustodyJournal:true});
  proofs.set(result,{account:current,baseline,journal,started,clock:monotonicNow,now});
  requireFreshServerPerpsDailyAccount(result,{walletAddress,minimumSlot,journal});return result;
 };
}
export async function readServerPerpsDailyAccount({walletAddress,minimumSlot=0},{request,now=Date.now,monotonicNow=()=>performance.now(),journal,readNetworkFees,readConversionLoss,paymentJournal}={}){
 return readAccount({walletAddress,minimumSlot},{request,now,monotonicNow,journal,readNetworkFees,readConversionLoss,paymentJournal},new Map());
}
// Only this closure can populate its cache, from verified finalized receipts.
// Balances, coverage, settings and daily totals are NEVER served from the cache.
export function createServerPerpsDailyAccountReader({request,now=Date.now,monotonicNow=()=>performance.now(),journal,readNetworkFees,readConversionLoss,paymentJournal}={}){
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const receipts=new Map();let cachedDay;
 return async input=>{
  const day=new Date(now()).toISOString().slice(0,10);if(day!==cachedDay){receipts.clear();cachedDay=day;}
  return readAccount(input,{request,now,monotonicNow,journal,readNetworkFees,readConversionLoss,paymentJournal},receipts);
 };
}
async function readAccount({walletAddress,minimumSlot=0},{request,now,monotonicNow,journal,readNetworkFees,readConversionLoss,paymentJournal},receipts){
 const feeVersion=paymentJournal?.walletVersion(walletAddress),recheckFees=()=>{if(paymentJournal&&paymentJournal.walletVersion(walletAddress)!==feeVersion)fail();};
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const account=await readServerPerpsAccount({walletAddress,minimumSlot},{request,now,monotonicNow,commitment:'finalized'});
 const day=new Date(now()).toISOString().slice(0,10);
 const history=await readServerPerpsSignatureHistory({walletAddress,day},{request,now,monotonicNow});
 if(history.observedSlot<account.observedSlot)fail();
 // History and balance banks can advance during reads. Any subsequent wallet
 // or position activity makes the balance/allocated-risk snapshot inconsistent.
 if(history.rows.some(row=>row.slot>account.observedSlot))fail();
 let loss=0n,walletFees=0n,trades=0,failedTransactions=0,platformFeeUnits=0n;const transactions=[],cancellations=[],conversions=[],platformFees=[];
 // Bound reads and preserve the account's ten-second lease across the entire
 // reconciliation. A production service can cache immutable finalized receipts,
 // but it must never replace a missing receipt with a zero-loss assumption.
 let next=0;await Promise.all(Array.from({length:3},async()=>{
  while(next<history.rows.length){
   const row=history.rows[next++];
   requireFreshServerPerpsAccount(account,{walletAddress,minimumSlot});
   const cacheKey=walletAddress+':'+day+':'+row.signature;
   let receipt=receipts.get(cacheKey);
   if(!receipt){
    receipt=await readServerPerpsTradeTransaction({walletAddress,signature:row.signature,day},{request,now,monotonicNow,requireTradeEvent:false});
    if(receipts.size>=2000)receipts.delete(receipts.keys().next().value);
    receipts.set(cacheKey,receipt);
   }
   requireVerifiedServerPerpsTradeTransaction(receipt);
   if(receipt.slot!==row.slot||receipt.blockTime!==row.blockTime||receipt.failed!==row.failed)fail();
   const platformFee=await readJournalledPerpsPlatformFee(receipt,{paymentJournal,request,now});
   if(platformFee){platformFees.push(platformFee);platformFeeUnits+=BigInt(platformFee.platformFeeUsdcUnits);}
   if(receipt.failed){failedTransactions++;}
   else {
    const cancellation=await readJournalledPerpsCancellation(receipt,{journal});
    if(cancellation)cancellations.push(cancellation);
    else {
     const conversion=await readJournalledPerpsConversion(receipt,{journal,request,now,monotonicNow});
     if(conversion)conversions.push(conversion);
     else {
      if(receipt.perpsActivity&&(!receipt.events.length||receipt.unknownPerpsEvents))fail();
      for(const event of receipt.events){loss+=BigInt(event.conservativeLossUsdUnits);if(event.action==='Increase')trades++;}
     }
    }
   }
   walletFees+=BigInt(receipt.walletFeeLamports);transactions.push(receipt);
  }
 }));
 let conversionValuation;
 loss+=platformFeeUnits;
 if(conversions.length){
  if(typeof readConversionLoss!=='function')fail();
  conversionValuation=requirePerpsConversionUsdValuation(await readConversionLoss({conversions,day}),{conversions,day});
  loss+=BigInt(conversionValuation.conversionLossUsdUnits);
 }
 let networkFees;
 if(readNetworkFees!==undefined){
  if(typeof readNetworkFees!=='function')fail();
  networkFees=requirePerpsNetworkFeeValuation(await readNetworkFees({transactions,day}),{transactions});
  if(networkFees.day!==day||networkFees.walletNetworkFeesLamports!==walletFees.toString())fail();
  loss+=BigInt(networkFees.networkFeeUsdUnits);
 }
 requireFreshServerPerpsAccount(account,{walletAddress,minimumSlot});
 requireFreshServerPerpsSignatureHistory(history,{walletAddress,day});
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||new Date(now()).toISOString().slice(0,10)!==day)fail();
 const result=Object.freeze({...account,stage:'RECONCILED_DAILY_ACCOUNT',readyForSigning:false,balancesComplete:true,day,
  lossTodayUsdcUnits:loss.toString(),tradesToday:trades,failedTransactions,walletNetworkFeesLamports:walletFees.toString(),
  lossBasis:networkFees?'CONSERVATIVE_REALIZED_PERPS_PNL_PROTOCOL_AND_VALUED_NETWORK_FEES':'CONSERVATIVE_REALIZED_PERPS_PNL_AND_PROTOCOL_FEES',networkFeesIncludedInUsdLoss:!!networkFees,
  networkFeeUsdUnits:networkFees?.networkFeeUsdUnits??null,networkFeeValuationBasis:networkFees?.basis??null,
  conversionLossUsdUnits:conversionValuation?.conversionLossUsdUnits??'0',conversionLossValuationBasis:conversionValuation?.basis??null,
  ...paymentJournal?{platformFeeUsdcUnits:platformFeeUnits.toString(),platformFees:Object.freeze(platformFees)}:{},
  requiresReconciledDailyAccounting:false,historyThroughSlot:history.observedSlot,transactions:Object.freeze(transactions),cancellations:Object.freeze(cancellations),conversions:Object.freeze(conversions),
  requiresFreshControlAndReservation:true});
 recheckFees();proofs.set(result,{account,history,started,clock:monotonicNow,now,journal,conversions,conversionValuation,platformFees,recheckFees});
 return requireFreshServerPerpsDailyAccount(result,{walletAddress,minimumSlot,journal});
}
