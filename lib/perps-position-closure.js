// Read-only, finalized whole-position and request-bound entry closure evidence.
// A missing API row,
// confirmed-only balance, timeout or expired blockhash is never a closure.
import {readPerpsBroadcastReceipt,isVerifiedPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {deriveServerPerpsIdentities} from './perps-server-custody.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
import {readServerPerpsTradeTransaction,requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import bs58 from 'bs58';
import {decodeRecordedServerPerpsExit} from './perps-server-exits.js';
import {readJournalledPerpsCancellation,requireVerifiedPerpsCancellationHistory} from './perps-cancellation-history.js';
import {readFinalizedPerpsClosePayout,requireVerifiedPerpsClosePayout} from './perps-close-payout-receipt.js';
import {storeVerifiedPerpsClosePayout} from './perps-close-execution-record.js';
const proofs=new WeakMap(),cleanupProofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_POSITION_CLOSURE');}
function requireEvidence(value,proof){
 if(!proof||!isVerifiedPerpsBroadcastReceipt(proof.receipt)||proof.receipt.confirmationStatus!=='finalized')fail();
 requireFreshServerPerpsDailyAccount(proof.account,{walletAddress:value.walletAddress,minimumSlot:proof.receipt.slot});
 if(proof.exitTransaction){requireVerifiedServerPerpsTradeTransaction(proof.entryTransaction);requireVerifiedServerPerpsTradeTransaction(proof.exitTransaction);}
 if(proof.manualClose){
  const m=proof.manualClose;requireVerifiedPerpsClosePayout(m.payout);
  requireFreshServerPerpsDailyAccount(proof.account,{walletAddress:value.walletAddress,minimumSlot:m.minimumSlot,journal:m.journal});
  if(JSON.stringify(m.journal.readPositionCloseCleanupSettlement(m.identity))!==m.encoded)fail();
 }
 const age=proof.now()-proof.receipt.observedAt;if(!Number.isFinite(age)||age<0||age>10000)fail();return value;
}
export function requireVerifiedServerPerpsPositionClosure(value){return requireEvidence(value,proofs.get(value));}
export function requireVerifiedServerPerpsExitCleanup(value){return requireEvidence(value,cleanupProofs.get(value));}
export function readServerPerpsPositionClosure(record,options){return readPositionState(record,options,false);}
// Discovery only, with a distinct unforgeable proof. Never frees journal risk,
// authorizes signing or cancels anything. A later transaction path must recheck.
export async function readServerPerpsExitCleanup(record,options){
 const cleanup=await readPositionState(record,options,true),journal=options?.journal;
 if(!cleanup||typeof journal?.readPositionCloseCleanupSettlement!=='function')return cleanup;
 const identity=Object.freeze({walletAddress:cleanup.walletAddress,positionAddress:cleanup.positionAddress,reservationId:cleanup.reservationId});
 const snapshot=journal.readPositionCloseCleanupSettlement(identity);if(snapshot===null)return cleanup;
 const encoded=JSON.stringify(snapshot),entry=snapshot.entries.find(e=>e.reservation===cleanup.reservationId);
 const minimumSlot=Math.max(snapshot.execution.confirmed_slot,snapshot.conversion?.confirmed_slot??0);
 if(cleanup.closureStage!=='FINALIZED_WHOLE_POSITION_CLOSED'||!entry||entry.signature!==cleanup.signature||entry.wire_hash!==cleanup.wireHash
  ||entry.entry_exit_plan!==cleanup.entryExitPlan||cleanup.observedSlot<minimumSlot)fail();
 const current=()=>{if(JSON.stringify(journal.readPositionCloseCleanupSettlement(identity))!==encoded)fail();};
 const request=async(m,p)=>{current();const v=await options.request(m,p);current();return v;};
 const payout=await readFinalizedPerpsClosePayout(snapshot.close,{signature:snapshot.execution.signature,wireHash:snapshot.execution.wire_hash},
  {request,now:options.now??Date.now,monotonicNow:options.monotonicNow??(()=>performance.now())});current();
 if(!payout||storeVerifiedPerpsClosePayout(payout,snapshot.close)!==snapshot.execution.payout_json)fail();
 cleanupProofs.get(cleanup).manualClose=Object.freeze({journal,identity,encoded,payout,minimumSlot,closeId:snapshot.close.id});
 return requireVerifiedServerPerpsExitCleanup(cleanup);
}
// A distinct original private binding. A generic orphan proof, a copied object
// or mere stored FIRST_LEG_FINALIZED state cannot bypass a held manual close.
export function readVerifiedServerPerpsCloseCleanupBinding(cleanup){
 requireVerifiedServerPerpsExitCleanup(cleanup);const p=cleanupProofs.get(cleanup)?.manualClose;if(!p)fail();return p;
}
async function readPositionState(record,{request,readFinalizedAccount,now=Date.now,journal}={},cleanupOnly){
 if(record?.state!=='OPEN'||typeof record.position_address!=='string'||typeof request!=='function'||typeof readFinalizedAccount!=='function'||typeof now!=='function')fail();
 if(record.entry_exit_plan==null)return null;
 const plan=JSON.parse(record.entry_exit_plan);if(canonicalServerPerpsEntryExitPlan(plan)!==record.entry_exit_plan)fail();
 let positionIdentity;for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT'])if((await deriveServerPerpsIdentities({walletAddress:record.wallet,asset,side})).position===record.position_address)positionIdentity={walletAddress:record.wallet,asset,side};
 if(!positionIdentity)fail();
 const receipt=await readPerpsBroadcastReceipt({walletAddress:record.wallet,signature:record.signature,wireHash:record.wire_hash},request,{now,requireFinalized:true});
 if(!receipt)return null;if(receipt.state!=='CONFIRMED')fail();
 const account=requireFreshServerPerpsDailyAccount(await readFinalizedAccount({walletAddress:record.wallet,minimumSlot:receipt.slot}),{walletAddress:record.wallet,minimumSlot:receipt.slot});
 if(account.commitment!=='finalized'||account.requiresExclusiveCustodyJournal===true||account.day!==new Date(now()).toISOString().slice(0,10))fail();
 if(account.positions.some(p=>p.address===record.position_address)){
  return readIndividualEntryClosure(record,{receipt,account,request,now,cleanupOnly,positionIdentity,journal});
 }
 if(receipt.executionDay===account.day){
  if(!account.transactions.some(t=>t.signature===record.signature&&!t.failed&&t.events.some(e=>e.action==='Increase'&&e.positionAddress===record.position_address)))fail();
  if(!account.transactions.some(t=>!t.failed&&t.slot>=receipt.slot&&t.events.some(e=>['Decrease','Liquidate'].includes(e.action)&&e.positionAddress===record.position_address)))fail();
 }
 const value=Object.freeze({stage:'FINALIZED_WHOLE_POSITION_CLOSED',walletAddress:record.wallet,signature:record.signature,wireHash:record.wire_hash,
  reservationId:record.reservation,positionAddress:record.position_address,observedSlot:account.observedSlot,observedAt:account.observedAt,day:account.day,
  lossTodayUsdcUnits:account.lossTodayUsdcUnits,entryExitPlan:record.entry_exit_plan,readyForSigning:false});
 return finishClosure(value,{receipt,account,now},{plan,account,request,cleanupOnly,positionIdentity});
}
async function readIndividualEntryClosure(record,{receipt,account,request,now,cleanupOnly,positionIdentity,journal}){
 const plan=JSON.parse(record.entry_exit_plan),encoded=canonicalServerPerpsEntryExitPlan(plan);
 if(encoded!==record.entry_exit_plan||!plan.exits.length)return null;
 const entryTransaction=await readServerPerpsTradeTransaction({walletAddress:record.wallet,signature:record.signature,day:receipt.executionDay},{request,now});
 if(entryTransaction.slot!==receipt.slot||entryTransaction.failed||entryTransaction.unknownPerpsEvents
  ||entryTransaction.events.filter(e=>e.action==='Increase'&&e.positionAddress===record.position_address&&e.fields.sizeUsdDelta===plan.sizeUsdUnits).length!==1)fail();
 const exits=new Set(plan.exits.map(exit=>exit.address)),seen=new Set();let matched;
 function inspect(transaction,cancellation=null){
  requireVerifiedServerPerpsTradeTransaction(transaction);
  if(transaction.walletAddress!==record.wallet||transaction.failed||transaction.slot<=receipt.slot||transaction.slot>account.observedSlot||transaction.blockTime<entryTransaction.blockTime)return;
  if(cancellation){requireVerifiedPerpsCancellationHistory(cancellation,{transaction});return;}
  if(transaction.unknownPerpsEvents||transaction.perpsActivity&&!transaction.events.length)fail();
  for(const event of transaction.events){
   const address=event.fields.positionRequestKey??event.fields.positionRequest;
   if(event.action!=='Decrease'||event.positionAddress!==record.position_address||!exits.has(address))continue;
   // A partial exit is not closure of this entry. Do not add arbitrary decreases
   // together or attribute another entry's liquidation/manual close to this one.
   if(event.fields.sizeUsdDelta!==plan.sizeUsdUnits)continue;
   if(matched)fail();matched={transaction,event,address};
  }
 }
 for(const transaction of account.transactions){seen.add(transaction.signature);inspect(transaction,account.cancellations?.find(value=>value.signature===transaction.signature));}
 // Positive request-bound evidence may predate today's complete risk history
 // after an outage. Query only the recorded exit addresses, with a hard work cap;
 // missing/pruned/index-only results never become proof of a closed entry.
 let reads=0;
 if(!matched)for(const exit of plan.exits){
  const rows=await request('getSignaturesForAddress',[exit.address,{commitment:'finalized',minContextSlot:account.observedSlot,limit:40}]);
  if(!Array.isArray(rows)||rows.length>40)fail();
  for(const row of rows){
   if(typeof row?.signature!=='string'||row.signature.length>88||bs58.decode(row.signature).length!==64||bs58.encode(bs58.decode(row.signature))!==row.signature||!Number.isSafeInteger(row.slot)||row.slot<0
    ||!Number.isSafeInteger(row.blockTime)||row.blockTime<0||row.confirmationStatus!=='finalized'||!Object.hasOwn(row,'err'))fail();
   if(seen.has(row.signature)||row.err!==null||row.slot<=receipt.slot||row.slot>account.observedSlot)continue;
   if(++reads>12)fail();seen.add(row.signature);
   const day=new Date(row.blockTime*1000).toISOString().slice(0,10);
   const transaction=await readServerPerpsTradeTransaction({walletAddress:record.wallet,signature:row.signature,day},{request,now,requireTradeEvent:false});
   if(transaction.slot!==row.slot||transaction.blockTime!==row.blockTime||transaction.failed)fail();inspect(transaction,await readJournalledPerpsCancellation(transaction,{journal}));
  }
 }
 if(!matched)return null;
 // A sibling SL/TP that can still fire must not be forgotten when recycling a
 // logical trade slot. No cancellation is performed by this read-only reader.
 const {transaction,event,address}=matched;
 const value=Object.freeze({stage:'FINALIZED_INDIVIDUAL_ENTRY_CLOSED',walletAddress:record.wallet,signature:record.signature,wireHash:record.wire_hash,
  reservationId:record.reservation,positionAddress:record.position_address,observedSlot:account.observedSlot,observedAt:account.observedAt,day:account.day,
  lossTodayUsdcUnits:account.lossTodayUsdcUnits,entryExitPlan:encoded,exitRequestAddress:address,exitSignature:transaction.signature,
  exitInstructionIndex:event.instructionIndex,exitInnerInstructionIndex:event.innerInstructionIndex,readyForSigning:false});
 return finishClosure(value,{receipt,account,now,entryTransaction,exitTransaction:transaction},{plan,account,request,cleanupOnly,positionIdentity,executedExitAddress:address});
}
async function finishClosure(value,evidence,{plan,account,request,cleanupOnly,positionIdentity,executedExitAddress}){
 if(!plan.exits.length){if(cleanupOnly)return null;proofs.set(value,evidence);return requireVerifiedServerPerpsPositionClosure(value);}
 const requests=await request('getMultipleAccounts',[plan.exits.map(exit=>exit.address),{commitment:'finalized',encoding:'base64',minContextSlot:account.observedSlot}]);
 if(!Number.isSafeInteger(requests?.context?.slot)||requests.context.slot<account.observedSlot||!Array.isArray(requests.value)||requests.value.length!==plan.exits.length)fail();
 if(requests.value.every(item=>item===null)){if(cleanupOnly)return null;proofs.set(value,evidence);return requireVerifiedServerPerpsPositionClosure(value);}
 if(!cleanupOnly)throw Error('PERPS_EXIT_CLEANUP_REQUIRED');
 const pending=[];
 for(const [index,exit]of plan.exits.entries()){
  const native=requests.value[index];if(native===null)continue;
  if(exit.address===executedExitAddress)fail();
  const inspected=await decodeRecordedServerPerpsExit(exit,native,positionIdentity);
  pending.push(Object.freeze({...inspected}));
 }
 const cleanup=Object.freeze({...value,stage:'FINALIZED_ENTRY_EXIT_CLEANUP_REQUIRED',closureStage:value.stage,
  requestObservedSlot:requests.context.slot,pendingExits:Object.freeze(pending),readyForSigning:false});
 cleanupProofs.set(cleanup,evidence);return requireVerifiedServerPerpsExitCleanup(cleanup);
}
export async function reconcileClosedServerPerpsPositions(journal,walletAddress,{request,readFinalizedAccount,now=Date.now,limit=20}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail();
 const rows=journal.openPositions(walletAddress),result={checked:0,closed:0,stillOpen:0,unresolved:0,legacyReview:0,deferred:0,cleanupRequired:0};
 for(const row of rows){
  if(!row.position_address||!row.entry_exit_plan){result.legacyReview++;continue;}
  if(result.checked>=limit){result.deferred++;continue;}result.checked++;
  try{
   const proof=await readServerPerpsPositionClosure(row,{request,readFinalizedAccount,now,journal});
   if(proof===null){result.stillOpen++;continue;}
   journal.reconcileClosedPosition(row.reservation,proof);result.closed++;
  }catch(error){if(error?.message==='PERPS_EXIT_CLEANUP_REQUIRED')result.cleanupRequired++;else result.unresolved++;}
 }
 return Object.freeze(result);
}
