// Immutable finalized first-leg facts, NOT a generic PoolSwap allowlist or a
// signing grant. Daily loss still requires an independently branded valuation.
import {createHash} from 'node:crypto';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireVerifiedServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
import {readRecordedPerpsEntryConversionEvidence} from './perps-entry-conversion-recovery.js';
import {perpsNavigationDraft} from './perps-navigation.js';
const proofs=new WeakMap(),cache=new WeakMap(),hash=data=>createHash('sha256').update(data).digest('hex');
function fail(){throw Error('UNVERIFIED_PERPS_ENTRY_CONVERSION_HISTORY');}
export function requireVerifiedPerpsEntryConversionHistory(value,{transaction,journal,swapJournal}={}){
 const p=proofs.get(value);if(!p||transaction!==undefined&&transaction!==p.transaction||journal!==undefined&&journal!==p.journal
   ||swapJournal!==undefined&&swapJournal!==p.swapJournal)fail();
 requireVerifiedServerPerpsTradeTransaction(p.transaction);
 if(JSON.stringify(p.journal.readEntryConversionHistorySnapshot({walletAddress:value.walletAddress,signature:value.signature,swapJournal:p.swapJournal}))!==p.encoded)fail();
 return value;
}
export async function readJournalledPerpsEntryConversion(transaction,{journal,swapJournal,request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireVerifiedServerPerpsTradeTransaction(transaction);
 if(journal===undefined||swapJournal===undefined)return null;
 requirePerpsExecutionJournal(journal);requireBotSwapJournal(swapJournal);
 const snapshot=journal.readEntryConversionHistorySnapshot({walletAddress:transaction.walletAddress,signature:transaction.signature,swapJournal});
 if(!snapshot)return null;
 let byJournal=cache.get(transaction);if(!byJournal){byJournal=new WeakMap();cache.set(transaction,byJournal);}
 const cached=byJournal.get(journal);
 if(cached){try{return requireVerifiedPerpsEntryConversionHistory(cached,{transaction,journal,swapJournal});}catch{byJournal.delete(journal);}}
 const {parent,hold,swap}=snapshot,review=JSON.parse(swap.review),draft=perpsNavigationDraft(review.draft),encoded=JSON.stringify(snapshot);
 if(typeof request!=='function'||transaction.failed||transaction.events.length||transaction.unknownPerpsEvents!==1||!transaction.perpsActivity
   ||parent.state==='CANCELLED'||parent.signal!=='manual:'+hold.reservation||parent.wallet!==transaction.walletAddress
   ||hold.input_units!==String(parent.margin)||hold.draft_json!==JSON.stringify(draft)||draft.side!=='LONG'||draft.asset!==hold.asset
   ||review.reservationId!==hold.reservation||!['UNKNOWN','FINALIZED'].includes(swap.state)||swap.wallet!==parent.wallet
   ||!['HELD','FINALIZED'].includes(hold.state)||(hold.state==='HELD'&&parent.state!=='RESERVED'))fail();
 const current=()=>{if(JSON.stringify(journal.readEntryConversionHistorySnapshot({walletAddress:transaction.walletAddress,signature:transaction.signature,swapJournal}))!==encoded)fail();};
 const evidence=readVerifiedPerpsTransactionEvidence(transaction);
 const capturedRequest=async(method,params)=>{
  current();const value=method==='getTransaction'&&params[0]===transaction.signature?
   {slot:transaction.slot,blockTime:transaction.blockTime,transaction:[evidence.wire,'base64'],meta:evidence.meta}:await request(method,params);
  current();return value;
 };
 const {receipt}=await readRecordedPerpsEntryConversionEvidence({journal:swapJournal,id:swap.id,ownerAccountHash:swap.owner},
  {request:capturedRequest,now,monotonicNow});current();
 if(!receipt||receipt.signature!==transaction.signature||receipt.slot!==transaction.slot||receipt.blockTime!==transaction.blockTime
   ||receipt.spentUsdcUnits!==hold.input_units||receipt.asset!==hold.asset||hash(Buffer.from(evidence.wire,'base64'))!==receipt.wireHash
   ||hold.state==='FINALIZED'&&(hold.signature!==receipt.signature||hold.wire_hash!==receipt.wireHash))fail();
 const value=Object.freeze({stage:'FINALIZED_JOURNALED_ENTRY_CONVERSION',readyForSigning:false,walletAddress:transaction.walletAddress,
  signature:transaction.signature,reservationId:hold.reservation,slot:transaction.slot,blockTime:transaction.blockTime,day:transaction.day,
  asset:receipt.asset,spentUsdcUnits:receipt.spentUsdcUnits,receivedCollateralUnits:receipt.receivedCollateralUnits,
  collateralMint:receipt.collateralMint,collateralDecimals:receipt.collateralDecimals,swapFeeCollateralUnits:receipt.swapFeeCollateralUnits,
  nativeSwapUsdUnits:receipt.swapUsdAmount,networkFeeLamports:receipt.networkFeeLamports,
  requiresIndependentUsdValuation:true,requiresCompleteDailyAccounting:true});
 proofs.set(value,{transaction,journal,swapJournal,encoded});byJournal.set(journal,value);
 return requireVerifiedPerpsEntryConversionHistory(value,{transaction,journal,swapJournal});
}
