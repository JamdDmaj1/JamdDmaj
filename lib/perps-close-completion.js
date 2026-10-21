// Read-only terminal close evidence. A missing position alone is insufficient:
// both recorded financial legs, full current-day risk and all sibling exits
// must be reconciled before the journal may release the original reservations.
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {readFinalizedPerpsClosePayout,requireVerifiedPerpsClosePayout} from './perps-close-payout-receipt.js';
import {storeVerifiedPerpsClosePayout} from './perps-close-execution-record.js';
import {readRecordedPerpsCloseConversionPayout} from './perps-close-conversion-recovery.js';
import {storeVerifiedPerpsConversionReceipt} from './perps-close-conversion-record.js';
import {requireVerifiedPerpsCloseConversionReceipt} from './perps-close-conversion-receipt.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
import {decodeServerPerpsPosition} from './perps-server-position.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_COMPLETION_UNRECONCILED');}
export function requireVerifiedPerpsCloseCompletion(value,{journal}={}){
 const p=proofs.get(value);if(!p||journal!==p.journal)fail();
 if(JSON.stringify(journal.readPositionCloseCompletionSnapshot(value.closeId))!==p.encoded)fail();
 requireVerifiedPerpsClosePayout(p.payout);if(p.conversion)requireVerifiedPerpsCloseConversionReceipt(p.conversion);
 requireFreshServerPerpsDailyAccount(p.account,{walletAddress:value.walletAddress,minimumSlot:value.financialSlot,journal});
 const age=p.monotonicNow()-p.started;if(!Number.isFinite(age)||age<0||age>10000||new Date(p.now()).toISOString().slice(0,10)!==value.day)fail();
 return value;
}
export async function readFinalizedPerpsCloseCompletion(journal,id,{request,readFinalizedAccount,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof readFinalizedAccount!=='function'||typeof journal?.readPositionCloseCompletionSnapshot!=='function')fail();
 const started=monotonicNow(),snapshot=journal.readPositionCloseCompletionSnapshot(id),encoded=JSON.stringify(snapshot);
 if(!Number.isFinite(started)||snapshot.pendingEntries.length||snapshot.pendingCancellations.length)fail();
 const {close,execution,conversion:record}=snapshot;
 if(!['PREPARED','COMPLETED'].includes(close.state)||execution.state!=='FIRST_LEG_FINALIZED')fail();
 const current=()=>{if(JSON.stringify(journal.readPositionCloseCompletionSnapshot(id))!==encoded)fail();};
 const guarded=async(m,p)=>{current();const v=await request(m,p);current();return v;};
 const payout=await readFinalizedPerpsClosePayout(close,{signature:execution.signature,wireHash:execution.wire_hash},{request:guarded,now,monotonicNow});current();
 if(!payout||storeVerifiedPerpsClosePayout(payout,close)!==execution.payout_json)fail();
 let conversion,receivedUsdcUnits=payout.requiresConversion?'0':payout.receiveAsset==='USDC'?payout.receivedTokenUnits:'0',financialSlot=payout.slot;
 if(payout.requiresConversion){
  if(record?.state!=='FINALIZED')fail();
  ({payout:conversion}=await readRecordedPerpsCloseConversionPayout(journal,id,{request:guarded,now,monotonicNow}));current();
  if(!conversion||storeVerifiedPerpsConversionReceipt(conversion,record,close,execution)!==record.receipt_json)fail();
  receivedUsdcUnits=conversion.receivedUsdcUnits;financialSlot=conversion.slot;
 }else if(record!==null)fail();
 const account=await readFinalizedAccount({walletAddress:close.wallet,minimumSlot:financialSlot});current();
 requireFreshServerPerpsDailyAccount(account,{walletAddress:close.wallet,minimumSlot:financialSlot,journal});
 if(account.commitment!=='finalized'||account.requiresExclusiveCustodyJournal===true||account.networkFeesIncludedInUsdLoss!==true
  ||account.positions.some(p=>p.address===close.position))fail();
 const exits=new Set();
 for(const entry of snapshot.entries){
  const plan=JSON.parse(entry.entry_exit_plan);if(canonicalServerPerpsEntryExitPlan(plan)!==entry.entry_exit_plan)fail();
  for(const exit of plan.exits){if(exits.has(exit.address))fail();exits.add(exit.address);}
 }
 const reply=await guarded('getMultipleAccounts',[[close.position,...exits],{encoding:'base64',commitment:'finalized',minContextSlot:account.observedSlot}]);
 if(!Number.isSafeInteger(reply?.context?.slot)||reply.context.slot<account.observedSlot||!Array.isArray(reply.value)||reply.value.length!==exits.size+1)fail();
 const vacant=a=>a===null||a.owner==='11111111111111111111111111111111'&&a.executable===false&&(a.lamports===0||a.lamports==='0')&&a.data?.[0]===''&&a.data?.[1]==='base64';
 if(reply.value.slice(1).some(a=>!vacant(a)))throw Error('PERPS_CLOSE_SIBLING_EXITS_REMAIN');
 if(!vacant(reply.value[0])){
  const s=JSON.parse(close.settlement),position=await decodeServerPerpsPosition(close.position,reply.value[0],{walletAddress:close.wallet,asset:s.asset,side:s.side});current();
  if(position.openTimeSeconds!==s.positionOpenTimeSeconds||['sizeUsdUnits','collateralUsdUnits','lockedTokenUnits','realisedPnlUsdUnits'].some(k=>position[k]!=='0'))fail();
 }
 const value=Object.freeze({stage:'FINALIZED_CLOSE_FINANCIALLY_RECONCILED',readyForSigning:false,closeId:id,walletAddress:close.wallet,positionAddress:close.position,
  firstLegSignature:payout.signature,conversionSignature:conversion?.signature??null,financialSlot,observedSlot:reply.context.slot,
  observedAt:account.observedAt,day:account.day,lossTodayUsdUnits:account.lossTodayUsdcUnits,receivedUsdcUnits,
  reservationIds:Object.freeze(snapshot.entries.map(e=>e.reservation).sort()),siblingExitAddresses:Object.freeze([...exits].sort())});
 proofs.set(value,{journal,encoded,payout,conversion,account,started,monotonicNow,now});return requireVerifiedPerpsCloseCompletion(value,{journal});
}

// Bounded restart/maintenance work. It can observe only previously recorded
// signatures and complete accounting; it cannot build, sign, send or retry one.
export async function reconcileRecordedPerpsCloses(journal,walletAddress,{request,readFinalizedAccount,now=Date.now,monotonicNow=()=>performance.now(),limit=10}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>20)fail();
 const rows=journal.pendingPositionCloses(walletAddress),result={checked:0,completed:0,pending:0,conversionRequired:0,cleanupRequired:0,unresolved:0,deferred:0};
 for(const row of rows){
  if(result.checked>=limit){result.deferred++;continue;}result.checked++;
  try{
   let s=journal.readPositionCloseCompletionSnapshot(row.id);
   if(s.close.wallet!==walletAddress)fail();
   if(s.execution.state==='SIGNING'){result.unresolved++;continue;}
   if(s.execution.state==='UNCERTAIN'){
    const payout=await readFinalizedPerpsClosePayout(s.close,{signature:s.execution.signature,wireHash:s.execution.wire_hash},{request,now,monotonicNow});
    if(!payout){result.pending++;continue;}journal.reconcilePositionClosePayout(row.id,payout);s=journal.readPositionCloseCompletionSnapshot(row.id);
   }
   if(JSON.parse(s.execution.payout_json).requiresConversion){
    if(!s.conversion||['PREPARED','SIGNING'].includes(s.conversion.state)){result.conversionRequired++;continue;}
    if(s.conversion.state==='UNCERTAIN'){
     await journal.recoverPositionCloseConversion(row.id,{request,now,monotonicNow});
     if(journal.readPositionCloseConversion(row.id).state!=='FINALIZED'){result.pending++;continue;}
    }
   }
   const proof=await readFinalizedPerpsCloseCompletion(journal,row.id,{request,readFinalizedAccount,now,monotonicNow});
   journal.reconcilePositionCloseCompletion(row.id,proof);result.completed++;
  }catch(e){if(e?.message==='PERPS_CLOSE_SIBLING_EXITS_REMAIN')result.cleanupRequired++;else result.unresolved++;}
 }
 return Object.freeze(result);
}
