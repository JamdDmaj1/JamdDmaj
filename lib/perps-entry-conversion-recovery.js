// Reconstruct the exact recorded first leg through its native constructor.
// No signing, replacement blockhash, send, automatic opening or risk release.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {requireBotSwapJournal,verifyBotSwapStoredRecord} from './perps-bot-swap-journal.js';
import {PERPS_CUSTODIES,decodeServerPerpsCustody} from './perps-server-custody.js';
import {buildUnsignedPerpsEntryConversionWire} from './perps-entry-conversion-wire.js';
import {readFinalizedPerpsEntryConversionReceipt} from './perps-close-conversion-receipt.js';
import {bindFinalizedPerpsEntryConversion} from './perps-entry-conversion-binding.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {readServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence} from './perps-server-trade-transaction.js';
const failures=new WeakMap();
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
function fail(){throw Error('PERPS_ENTRY_CONVERSION_RECOVERY_UNAVAILABLE');}
async function readRecordedEntryWire({journal,id,ownerAccountHash},{request,now=Date.now,monotonicNow=()=>performance.now(),allowFailed=false}={}){
 requireBotSwapJournal(journal);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const row=journal.read(id);
 if(!row||row.owner!==ownerAccountHash||!(allowFailed?['UNKNOWN','FAILED']:['UNKNOWN','FINALIZED']).includes(row.state))fail();
 verifyBotSwapStoredRecord(row);
 const encoded=JSON.stringify(row),review=JSON.parse(row.review);
 if(review.stage!=='PROTECTED_ENTRY_CONVERSION_PREPARED'||review.maxSlippageBps!==50
   ||review.draft?.side!=='LONG'||!['BTC','ETH','SOL'].includes(review.draft.asset)
   ||!Number.isSafeInteger(review.observedSlot)||review.observedSlot<0)fail();
 const current=()=>{if(JSON.stringify(journal.read(id))!==encoded)fail();};
 const guarded=async(m,p)=>{current();const value=await request(m,p);current();return value;};
 if(await guarded('getGenesisHash',[])!==GENESIS)fail();
 const c=PERPS_CUSTODIES[review.draft.asset],u=PERPS_CUSTODIES.USDC;
 const reply=await guarded('getMultipleAccounts',[[u.address,c.address],{encoding:'base64',commitment:'finalized',minContextSlot:review.observedSlot}]);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<review.observedSlot||!Array.isArray(reply.value)||reply.value.length!==2)fail();
 const usdc=decodeServerPerpsCustody('USDC',u.address,reply.value[0]),collateral=decodeServerPerpsCustody(review.draft.asset,c.address,reply.value[1]);
 // Constructor uses single-byte counts and two fixed leading compute-budget
 // instructions. Extract only reconstruction inputs, then compare ALL bytes.
 const message=Buffer.from(row.message,'base64'),count=message[3],blockAt=4+count*32,computeAt=blockAt+33;
 if(message[0]!==1||message[1]!==0||count<1||count>=128||message.length<computeAt+20)fail();
 const price=message.readBigUInt64LE(computeAt+12);
 if(price>10000n)fail();
 const wire=await buildUnsignedPerpsEntryConversionWire({walletAddress:row.wallet,asset:review.draft.asset,
  blockhash:bs58.encode(message.subarray(blockAt,blockAt+32)),usdcUnits:review.usdcUnits,
  minimumCollateralUnits:review.minimumCollateralUnits,lastValidBlockHeight:row.last_height,computeUnitPriceMicroLamports:Number(price)},usdc,collateral);
 current();if(wire.messageBase64!==row.message)fail();
 return {wire,row,guarded,current};
}
export async function readRecordedPerpsEntryConversionEvidence(input,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const {wire,row,guarded,current}=await readRecordedEntryWire(input,{request,now,monotonicNow});
 const review=JSON.parse(row.review);
 const receipt=await readFinalizedPerpsEntryConversionReceipt(wire,{signature:row.signature,
  wireHash:createHash('sha256').update(Buffer.from(row.signed,'base64')).digest('hex'),createdAt:row.created,minimumSlot:review.observedSlot},
  {request:guarded,now,monotonicNow});current();
 return Object.freeze({wire,receipt,row:Object.freeze({...row})});
}
export async function readRecordedPerpsEntryConversionFailure(input,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const {wire,row,guarded,current}=await readRecordedEntryWire(input,{request,now,monotonicNow,allowFailed:true});
 const statusReply=await guarded('getSignatureStatuses',[[row.signature],{searchTransactionHistory:true}]);
 if(!Array.isArray(statusReply?.value)||statusReply.value.length!==1)fail();
 const status=statusReply.value[0];if(status===null||status?.confirmationStatus!=='finalized')return null;
 if(!Object.hasOwn(status,'err')||status.err===null)fail();
 const tx=await guarded('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(tx===null)return null;
 if(!Number.isSafeInteger(status.slot)||status.slot<JSON.parse(row.review).observedSlot||!Number.isSafeInteger(statusReply.context?.slot)||statusReply.context.slot<status.slot
  ||tx.slot!==status.slot||JSON.stringify(tx.meta?.err)!==JSON.stringify(status.err)||tx.transaction?.[0]!==row.signed)fail();
 const blockTime=tx.blockTime;if(!Number.isSafeInteger(blockTime)||blockTime*1000<row.created-2000)fail();
 const transaction=await readServerPerpsTradeTransaction({walletAddress:row.wallet,signature:row.signature,day:new Date(blockTime*1000).toISOString().slice(0,10)},
  {request:(m,p)=>m==='getTransaction'&&p[0]===row.signature?Promise.resolve(structuredClone(tx)):guarded(m,p),now,monotonicNow,requireTradeEvent:false});
 if(!transaction.failed||transaction.events.length||transaction.walletFeeLamports!==transaction.transactionFeeLamports)fail();
 const meta=tx.meta;
 if(!Array.isArray(meta.preBalances)||!Array.isArray(meta.postBalances)||meta.preBalances.length!==meta.postBalances.length||!meta.preBalances.length
  ||!Array.isArray(meta.preTokenBalances)||!Array.isArray(meta.postTokenBalances)||JSON.stringify(meta.preTokenBalances)!==JSON.stringify(meta.postTokenBalances))fail();
 for(let i=0;i<meta.preBalances.length;i++)if(!Number.isSafeInteger(meta.preBalances[i])||meta.preBalances[i]<0||!Number.isSafeInteger(meta.postBalances[i])||meta.postBalances[i]<0
  ||meta.postBalances[i]!==meta.preBalances[i]-(i===0?meta.fee:0))fail();
 const evidence=readVerifiedPerpsTransactionEvidence(transaction);
 if(evidence.wire!==row.signed||Buffer.from(evidence.wire,'base64').subarray(65).toString('base64')!==wire.messageBase64)fail();current();
 const result=Object.freeze({stage:'FINALIZED_RECORDED_ENTRY_CONVERSION_FAILURE',id:row.id,walletAddress:row.wallet,signature:row.signature,
  wireHash:createHash('sha256').update(Buffer.from(row.signed,'base64')).digest('hex'),slot:transaction.slot,day:transaction.day,
  networkFeeLamports:transaction.walletFeeLamports,readyForSigning:false,originalRiskReleased:false,requiresCompleteDailyAccounting:true});
 const age=monotonicNow()-started;if(!Number.isFinite(age)||age<0||age>10000)fail();
 failures.set(result,{journal:input.journal,row:JSON.stringify(row),transaction,started,monotonicNow});return result;
}
export function requireRecordedPerpsEntryConversionFailure(value,{journal}={}){
 const p=failures.get(value);if(!p||journal!==undefined&&p.journal!==journal||JSON.stringify(p.journal.read(value.id))!==p.row)fail();
 const age=p.monotonicNow()-p.started;if(!Number.isFinite(age)||age<0||age>10000)fail();return value;
}
export async function recoverRecordedPerpsEntryCollateral(input,options={}){
 const {wire,receipt,row}=await readRecordedPerpsEntryConversionEvidence(input,options);
 if(receipt===null)return Object.freeze({stage:'RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY',readyForSigning:false,tradingEnabled:false,id:row.id,signature:row.signature});
 return bindFinalizedPerpsEntryConversion({...input,wire,receipt});
}

// Join recovery to its original durable risk hold. Finality never cancels the
// reservation or grants opening authority; a separate fresh review is required.
export async function recoverHeldPerpsEntryCollateral({executionJournal,journal,reservationId,ownerAccountHash},options={}){
 requirePerpsExecutionJournal(executionJournal);
 const parent=executionJournal.read(reservationId),hold=executionJournal.entryConversionHold(reservationId);
 if(!parent||!hold||parent.signal!=='manual:'+reservationId||!['RESERVED','SIGNING','UNCERTAIN','OPEN','CLOSED','CANCELLED'].includes(parent.state)
   ||hold.input_units!==String(parent.margin))fail();
 if(parent.state==='CANCELLED'&&(hold.state!=='FINALIZED'||!Number.isSafeInteger(parent.closed_slot)||parent.signature!==null||parent.wire_hash!==null))fail();
 const saved=JSON.stringify({parent,hold});
 const current=()=>{if(JSON.stringify({parent:executionJournal.read(reservationId),hold:executionJournal.entryConversionHold(reservationId)})!==saved)fail();};
 const value=await recoverRecordedPerpsEntryCollateral({journal,id:hold.conversion_id,ownerAccountHash},options);current();
 if(value.stage==='RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY')return value;
 if(value.walletAddress!==parent.wallet||value.asset!==hold.asset||value.spentUsdcUnits!==hold.input_units)fail();
 if(hold.state==='HELD'){
  if(parent.state!=='RESERVED')fail();
  executionJournal.finalizeEntryConversionHold(reservationId,value);
 }else if(hold.state!=='FINALIZED'||hold.signature!==value.signature||hold.wire_hash!==value.wireHash)fail();
 // The exact finalized receipt also settles the original swap exclusion. It
 // does not release the execution reservation or authorize another conversion.
 const row=journal.read(hold.conversion_id);
 if(row.state==='UNKNOWN')journal.settle(row.id,value.signature,'FINALIZED');
 return value;
}

// SIGNING is persisted before custody access; UNKNOWN is persisted before any
// transport attempt. Aborting SIGNING wins atomically against beginBroadcast.
// No absence-of-chain-result guess, network read, signature or retry is used.
export function recoverNeverBroadcastHeldPerpsEntryConversion({executionJournal,journal,reservationId,ownerAccountHash}){
 requirePerpsExecutionJournal(executionJournal);requireBotSwapJournal(journal);
 const parent=executionJournal.read(reservationId),hold=executionJournal.entryConversionHold(reservationId);
 if(!parent||!hold||hold.state!=='HELD'||parent.signal!=='manual:'+reservationId||!['RESERVED','CANCELLED'].includes(parent.state))fail();
 const row=journal.read(hold.conversion_id);
 if(!row||row.owner!==ownerAccountHash||row.wallet!==parent.wallet||!['SIGNING','ABORTED'].includes(row.state))fail();
 const review=JSON.parse(row.review);
 if(review.stage!=='PROTECTED_ENTRY_CONVERSION_PREPARED'||review.reservationId!==reservationId||review.maxSlippageBps!==50
   ||JSON.stringify(review.draft)!==hold.draft_json||review.usdcUnits!==hold.input_units)fail();
 if(row.state==='SIGNING')journal.recoverNeverBroadcast(row.id,ownerAccountHash);
 const released=executionJournal.releaseNeverBroadcastEntryConversion(reservationId,{swapJournal:journal,ownerAccountHash});
 return Object.freeze({stage:'ENTRY_CONVERSION_NEVER_BROADCAST_RELEASED',id:reservationId,walletAddress:released.wallet,
  state:released.state,readyForSigning:false,tradingEnabled:false,readyForRetry:false,requiresNewReview:true});
}
