// Rooted second-leg history exception, never a generic PoolSwap whitelist.
// Only the exact recorded conversion and finalized first-leg payout qualify.
// Immutable receipt facts may be cached; they are not fresh signing evidence.
import {createHash} from 'node:crypto';
import {readServerPerpsTradeTransaction,requireVerifiedServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
import {readRecordedPerpsCloseConversionPayout} from './perps-close-conversion-recovery.js';
import {storeVerifiedPerpsConversionReceipt} from './perps-close-conversion-record.js';
const proofs=new WeakMap(),cache=new WeakMap(),hash=b=>createHash('sha256').update(b).digest('hex');
function fail(){throw Error('UNVERIFIED_PERPS_CONVERSION_HISTORY');}
export function requireVerifiedPerpsConversionHistory(value,{transaction,journal}={}){
 const p=proofs.get(value);if(!p||transaction!==undefined&&transaction!==p.transaction||journal!==undefined&&journal!==p.journal)fail();
 requireVerifiedServerPerpsTradeTransaction(p.transaction);requireVerifiedServerPerpsTradeTransaction(p.first);
 if(JSON.stringify(p.journal.readPositionCloseConversionSettlement(value.closeId))!==p.encoded)fail();return value;
}
export async function readJournalledPerpsConversion(transaction,{journal,request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireVerifiedServerPerpsTradeTransaction(transaction);
 if(typeof journal?.readPositionCloseConversionBySignature!=='function'||typeof journal?.readPositionCloseConversionSettlement!=='function')return null;
 const row=journal.readPositionCloseConversionBySignature({walletAddress:transaction.walletAddress,signature:transaction.signature});if(!row)return null;
 let byJournal=cache.get(transaction);if(!byJournal){byJournal=new WeakMap();cache.set(transaction,byJournal);}
 const cached=byJournal.get(journal);if(cached){try{return requireVerifiedPerpsConversionHistory(cached,{transaction,journal});}catch{byJournal.delete(journal);}}
 if(typeof request!=='function'||transaction.failed||transaction.events.length||transaction.unknownPerpsEvents!==1||!transaction.perpsActivity)fail();
 const e=readVerifiedPerpsTransactionEvidence(transaction);
 // The complete-history reader has already captured this rooted transaction.
 // Reuse exactly those immutable bytes/effects, never a conflicting second RPC
 // response for the same signature. Native custody and finality reads stay real.
 const capturedRequest=(m,p)=>m==='getTransaction'&&p[0]===transaction.signature?Promise.resolve({slot:transaction.slot,blockTime:transaction.blockTime,transaction:[e.wire,'base64'],meta:e.meta}):request(m,p);
 const {snapshot,payout}=await readRecordedPerpsCloseConversionPayout(journal,row.close_id,{request:capturedRequest,now,monotonicNow});
 if(!payout||snapshot.close.wallet!==transaction.walletAddress||payout.signature!==transaction.signature||payout.slot!==transaction.slot||payout.blockTime!==transaction.blockTime)fail();
 const encoded=JSON.stringify(snapshot),current=()=>{if(JSON.stringify(journal.readPositionCloseConversionSettlement(row.close_id))!==encoded)fail();};
 const fact=storeVerifiedPerpsConversionReceipt(payout,snapshot.conversion,snapshot.close,snapshot.execution);
 if(snapshot.conversion.state==='FINALIZED'&&snapshot.conversion.receipt_json!==fact)fail();
 if(hash(Buffer.from(e.wire,'base64'))!==payout.wireHash)fail();
 const recorded=JSON.parse(snapshot.execution.payout_json),settlement=JSON.parse(snapshot.close.settlement);
 const guarded=async(m,p)=>{current();const value=await request(m,p);current();return value;};
 const first=await readServerPerpsTradeTransaction({walletAddress:transaction.walletAddress,signature:snapshot.execution.signature,day:recorded.executionDay},{request:guarded,now,monotonicNow});current();
 const events=first.events.filter(v=>v.eventName==='InstantDecreasePositionEvent'&&v.positionAddress===snapshot.close.position);
 if(first.failed||first.unknownPerpsEvents||first.events.length!==1||events.length!==1||first.slot!==recorded.slot||first.blockTime!==recorded.blockTime||first.slot>transaction.slot
  ||first.blockTime>transaction.blockTime||first.transactionFeeLamports!==recorded.networkFeeLamports)fail();
 const raw=Buffer.from(readVerifiedPerpsTransactionEvidence(first).wire,'base64');if(raw[0]!==3)fail();raw.fill(0,65,129);
 if(hash(raw)!==snapshot.execution.wire_hash)fail();raw.fill(0,1,65);if(hash(raw)!==snapshot.close.unsigned_wire_hash)fail();
 const event=events[0],fields=event.fields;
 if(event.asset!==settlement.asset||event.side!==settlement.side||fields.desiredMint!==recorded.receiveMint||fields.transferToken!==recorded.receivedTokenUnits
  ||fields.sizeUsdDelta!==settlement.sizeUsdUnits||fields.originalPositionCollateralUsd!==settlement.collateralUsdUnits||fields.positionOpenTime!==settlement.positionOpenTimeSeconds)fail();
 const value=Object.freeze({stage:'FINALIZED_JOURNALED_CLOSE_CONVERSION',readyForSigning:false,walletAddress:transaction.walletAddress,signature:transaction.signature,
  closeId:row.close_id,slot:transaction.slot,blockTime:transaction.blockTime,day:transaction.day,
  firstLegSignature:first.signature,firstLegDay:first.day,inputValueUsdUnits:fields.transferAmountUsd,
  receivedUsdcUnits:payout.receivedUsdcUnits,swapFeeUsdcUnits:payout.swapFeeUsdcUnits,networkFeeLamports:payout.networkFeeLamports,
  requiresUsdValuation:true,requiresCompleteDailyAccounting:true});
 proofs.set(value,{transaction,first,journal,encoded});byJournal.set(journal,value);return requireVerifiedPerpsConversionHistory(value,{transaction,journal});
}
