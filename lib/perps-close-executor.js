// Explicit native two-stage close lifecycle. No activation, entry, implicit
// network transport, auto-retry or conversion of unfinalized estimated proceeds.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {authorizeNativePerpsFullClose} from './perps-close-signing.js';
import {createNativePerpsCloseBroadcaster} from './perps-close-broadcast.js';
import {readFinalizedPerpsClosePayout} from './perps-close-payout-receipt.js';
import {createPerpsCloseConversionExecutor} from './perps-close-conversion-executor.js';
import {reconcilePendingPerpsExitCancellations} from './perps-exit-cancellation-recovery.js';
function fail(){throw Error('PERPS_NATIVE_CLOSE_EXECUTOR_UNAVAILABLE');}
export function createNativePerpsCloseExecutor({journal,vault,fetchImpl,cleanupCoordinator}={}){
 requirePerpsExecutionJournal(journal);if(typeof vault?.signNativeClose!=='function')fail();
 if(cleanupCoordinator!==undefined&&typeof cleanupCoordinator?.runOnce!=='function')fail();
 const broadcast=createNativePerpsCloseBroadcaster({journal,fetchImpl}),conversion=createPerpsCloseConversionExecutor({journal,vault,fetchImpl});
 const api={
  async runOnce(closeId,options={}){
   const approved={...options},mode=approved.mode??'maintenance';if(!['maintenance','execute'].includes(mode))fail();
   const result=(stage,extra={})=>Object.freeze({stage,closeId,readyForRetry:false,...extra});
   const row=journal.readPositionClose(closeId);if(!row)fail();
   if(row.state==='COMPLETED')return result('NATIVE_CLOSE_COMPLETED',{completion:journal.readPositionCloseCompletionSnapshot(closeId).completion});
   if(row.state!=='PREPARED')fail();
   let execution=journal.readPositionCloseExecution(closeId);
   if(!execution){
    if(mode!=='execute'||!approved.oracleEffects)return result('NATIVE_CLOSE_REVIEW_REQUIRED');
    return api.execute(approved.oracleEffects,{...approved,closeId});
   }
   if(execution.state==='SIGNING')return result('NATIVE_CLOSE_SIGNING_REQUIRES_RECONCILIATION');
   if(execution.state==='UNCERTAIN'){
    const observed=await api.recoverFirstLeg(closeId,approved);if(observed.stage==='NATIVE_CLOSE_AWAITING_FINALITY')return observed;
    execution=journal.readPositionCloseExecution(closeId);
   }
   if(journal.pendingExitCancellations(row.wallet).length){
    if(typeof approved.request!=='function')return result('NATIVE_CLOSE_SIBLING_EXIT_RECONCILIATION_REQUIRED');
    await reconcilePendingPerpsExitCancellations(journal,row.wallet,{request:approved.request,now:approved.now});
    if(journal.pendingExitCancellations(row.wallet).length)return result('NATIVE_CLOSE_SIBLING_EXIT_RECONCILIATION_REQUIRED');
   }
   const cleanup=async()=>{
    if(mode!=='execute'||!cleanupCoordinator||typeof approved.isClosingAllowed!=='function'||approved.isClosingAllowed()!==true)
     return result('NATIVE_CLOSE_SIBLING_EXIT_CLEANUP_REQUIRED',{requiresRecordedExitCleanup:true});
    // Existing cleanup independently proves every native orphan and controls
    // its own one-use cancellation authority. Its result never skips our next
    // rooted absence check or the separate terminal accounting gate.
    const observed=await cleanupCoordinator.runOnce({ownerAccountHash:approved.ownerAccountHash,walletAddress:row.wallet});
    return result('NATIVE_CLOSE_SIBLING_EXIT_CLEANUP_PENDING',{cleanup:observed});
   };
   if(JSON.parse(execution.payout_json).requiresConversion){
    let conversionRow=journal.readPositionCloseConversion(closeId);
    if(!conversionRow){
     if(mode!=='execute')return result('NATIVE_CLOSE_CONVERSION_REQUIRED');
     const prepared=await api.prepareConversion(closeId,approved);
     if(prepared.stage==='NATIVE_CLOSE_SIBLING_EXIT_CLEANUP_REQUIRED')return cleanup();
     const sent=await api.convert(prepared,{...approved,closeId});return Object.freeze({...sent,conversionReview:prepared});
    }
    if(['PREPARED','SIGNING'].includes(conversionRow.state))return result('NATIVE_CLOSE_CONVERSION_REVIEW_REQUIRED');
    if(conversionRow.state==='UNCERTAIN'){
     await api.recoverConversion(closeId,approved);conversionRow=journal.readPositionCloseConversion(closeId);
     if(conversionRow.state!=='FINALIZED')return result('NATIVE_CLOSE_CONVERSION_AWAITING_FINALITY');
    }
   }
   if(typeof approved.readFinalizedAccount!=='function')return result('NATIVE_CLOSE_ACCOUNTING_REQUIRED');
   try{return result('NATIVE_CLOSE_COMPLETED',{completion:await api.complete(closeId,approved)});}
   catch(error){if(error?.message==='PERPS_CLOSE_SIBLING_EXITS_REMAIN')return cleanup();throw error;}
  },
  async execute(oracleEffects,options={}){
   const approved={...options,journal},grant=await authorizeNativePerpsFullClose(oracleEffects,approved),signed=vault.signNativeClose(grant);
   return broadcast(signed,{ownerAccountHash:approved.ownerAccountHash,controlRevision:approved.controlRevision});
  },
  async recoverFirstLeg(closeId,options={}){
   const approved={...options};
   const snapshot=journal.readPositionCloseSettlement(closeId),encoded=JSON.stringify(snapshot),{close,execution}=snapshot;
   if(!['UNCERTAIN','FIRST_LEG_FINALIZED'].includes(execution.state)||typeof approved.request!=='function')fail();
   const current=()=>{if(JSON.stringify(journal.readPositionCloseSettlement(closeId))!==encoded)fail();};
   const request=async(m,p)=>{current();const v=await approved.request(m,p);current();return v;};
   const payout=await readFinalizedPerpsClosePayout(close,{signature:execution.signature,wireHash:execution.wire_hash},{...approved,request});current();
   if(!payout)return Object.freeze({stage:'NATIVE_CLOSE_AWAITING_FINALITY',closeId,readyForRetry:false});
   journal.reconcilePositionClosePayout(closeId,payout);
   return Object.freeze({stage:'NATIVE_CLOSE_FIRST_LEG_FINALIZED',closeId,signature:payout.signature,receivedTokenUnits:payout.receivedTokenUnits,
    receiveAsset:payout.receiveAsset,requiresConversion:payout.requiresConversion,requiresCompleteDailyAccounting:true,readyForRetry:false});
  },
  async prepareConversion(closeId,options={}){
   const approved={...options},snapshot=journal.readPositionCloseCompletionSnapshot(closeId),encoded=JSON.stringify(snapshot),request=approved.request;
   if(snapshot.execution.state!=='FIRST_LEG_FINALIZED'||snapshot.conversion!==null||typeof request!=='function')fail();
   const exits=[...new Set(snapshot.entries.flatMap(e=>JSON.parse(e.entry_exit_plan).exits.map(x=>x.address)))];
   if(exits.length>20)fail();
   if(exits.length){
    const bank=await request('getMultipleAccounts',[exits,{encoding:'base64',commitment:'finalized',minContextSlot:snapshot.execution.confirmed_slot}]);
    if(JSON.stringify(journal.readPositionCloseCompletionSnapshot(closeId))!==encoded||!Number.isSafeInteger(bank?.context?.slot)
     ||bank.context.slot<snapshot.execution.confirmed_slot||!Array.isArray(bank.value)||bank.value.length!==exits.length)fail();
    const vacant=a=>a===null||a.owner==='11111111111111111111111111111111'&&a.executable===false
     &&(a.lamports===0||a.lamports==='0')&&a.data?.[0]===''&&a.data?.[1]==='base64';
    if(bank.value.some(a=>!vacant(a)))return Object.freeze({stage:'NATIVE_CLOSE_SIBLING_EXIT_CLEANUP_REQUIRED',closeId,
     readyForSigning:false,requiresRecordedExitCleanup:true,requiresCompleteDailyAccounting:true});
   }
   const prepared=await journal.preparePositionCloseConversion(closeId,approved);
   if(prepared.stage==='JOURNALED_CLOSE_CONVERSION_PREPARED')journal.preparePositionCloseConversionRecord(closeId,prepared);
   return prepared;
  },
  convert:conversion.execute,
  recoverConversion:conversion.recover,
  complete:conversion.complete
 };return Object.freeze(api);
}
