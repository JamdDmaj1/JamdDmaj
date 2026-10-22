// Explicit native two-stage close lifecycle. No activation, entry, implicit
// network transport, auto-retry or conversion of unfinalized estimated proceeds.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {authorizeNativePerpsFullClose} from './perps-close-signing.js';
import {createNativePerpsCloseBroadcaster} from './perps-close-broadcast.js';
import {readFinalizedPerpsClosePayout} from './perps-close-payout-receipt.js';
import {createPerpsCloseConversionExecutor} from './perps-close-conversion-executor.js';
function fail(){throw Error('PERPS_NATIVE_CLOSE_EXECUTOR_UNAVAILABLE');}
export function createNativePerpsCloseExecutor({journal,vault,fetchImpl}={}){
 requirePerpsExecutionJournal(journal);if(typeof vault?.signNativeClose!=='function')fail();
 const broadcast=createNativePerpsCloseBroadcaster({journal,fetchImpl}),conversion=createPerpsCloseConversionExecutor({journal,vault,fetchImpl});
 return Object.freeze({
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
   const prepared=await journal.preparePositionCloseConversion(closeId,options);
   if(prepared.stage==='JOURNALED_CLOSE_CONVERSION_PREPARED')journal.preparePositionCloseConversionRecord(closeId,prepared);
   return prepared;
  },
  convert:conversion.execute,
  recoverConversion:conversion.recover,
  complete:conversion.complete
 });
}
