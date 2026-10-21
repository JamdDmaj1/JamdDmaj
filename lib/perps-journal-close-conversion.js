// Read-only recovery coordinator. Rebuild a fresh conversion from a recorded
// finalized first leg, never from a stored quote, cached proof or full balance.
// This does not claim a conversion, use custody keys, send or release risk.
import {readFinalizedPerpsClosePayout} from './perps-close-payout-receipt.js';
import {storeVerifiedPerpsClosePayout,validateStoredPerpsCloseExecution} from './perps-close-execution-record.js';
import {prepareFinalizedPerpsCloseConversion,readPreparedPerpsCloseConversion} from './perps-close-conversion-preparation.js';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_JOURNALED_PERPS_CLOSE_CONVERSION');}
function snapshot(journal,id){
 const state=journal.readPositionCloseSettlement(id);
 if(state?.execution?.state!=='FIRST_LEG_FINALIZED')fail();
 validateStoredPerpsCloseExecution(state.execution,state.close);return state;
}
export function readJournaledPerpsCloseConversion(value,journal){
 const p=proofs.get(value);if(!p||p.journal!==journal)fail();
 if(JSON.stringify(snapshot(journal,p.id))!==p.encoded)fail();
 readPreparedPerpsCloseConversion(p.prepared,p.close);return p;
}
export async function prepareJournaledPerpsCloseConversion(journal,id,options={}){
 const state=snapshot(journal,id),encoded=JSON.stringify(state),{close,execution}=state;
 const current=()=>{if(JSON.stringify(snapshot(journal,id))!==encoded)fail();};
 const {request,...policy}=options;if(typeof request!=='function')fail();
 // Recheck durable identity around every asynchronous read. A cancellation,
 // altered financial fact or changed entry cannot ride an old in-flight result.
 const guarded=async(method,params)=>{current();const reply=await request(method,params);current();return reply;};
 const payout=await readFinalizedPerpsClosePayout(close,{signature:execution.signature,wireHash:execution.wire_hash},{...policy,request:guarded});current();
 if(payout===null)return Object.freeze({stage:'JOURNALED_CLOSE_PAYOUT_NOT_CURRENTLY_VERIFIABLE',readyForSigning:false,tradingEnabled:false,closeId:id});
 if(storeVerifiedPerpsClosePayout(payout,close)!==execution.payout_json)fail();
 const prepared=await prepareFinalizedPerpsCloseConversion(payout,close,{...policy,request:guarded});current();
 if(prepared.stage==='NO_CLOSE_CONVERSION_REQUIRED'){
  // USDC collateral/zero proceeds require no second transaction. This is not
  // permission to release parent risk before complete fees/exit accounting.
  return Object.freeze({...prepared,stage:'JOURNALED_CLOSE_REQUIRES_NO_CONVERSION',closeId:id,requiresSignedCloseJournalBinding:false,requiresCompleteDailyAccounting:true});
 }
 readPreparedPerpsCloseConversion(prepared,close);
 const value=Object.freeze({stage:'JOURNALED_CLOSE_CONVERSION_PREPARED',readyForSigning:false,tradingEnabled:false,closeId:id,
  walletAddress:close.wallet,closeSignature:execution.signature,recordBinding:execution.parent_binding,
  amountUnits:prepared.amountUnits,minimumUsdcUnits:prepared.minimumUsdcUnits,
  requiresSignedCloseJournalBinding:false,requiresConversionJournalBinding:true,requiresFreshSigningRevalidation:true,requiresExplicitAuthorization:true});
 proofs.set(value,Object.freeze({journal,id,encoded,close,execution,payout,prepared}));return value;
}
