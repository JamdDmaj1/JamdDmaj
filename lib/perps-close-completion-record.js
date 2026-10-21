// Canonical durable terminal facts, not fresh chain evidence or authorization.
import {perpsCloseExecutionParentBinding,validateStoredPerpsCloseExecution} from './perps-close-execution-record.js';
import {validateStoredPerpsCloseConversion} from './perps-close-conversion-record.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
const names=['closeId','walletAddress','positionAddress','firstLegSignature','conversionSignature','financialSlot','observedSlot','observedAt','day','lossTodayUsdUnits','receivedUsdcUnits','reservationIds','siblingExitAddresses'];
function fail(){throw Error('INVALID_STORED_PERPS_CLOSE_COMPLETION');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function units(v){if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(v)||BigInt(v)>18446744073709551615n)fail();return v;}
export function storedPerpsCloseCompletion(value){return JSON.stringify(Object.fromEntries(names.map(k=>[k,value[k]])));}
export function validateStoredPerpsCloseCompletion(row,close,execution,conversion,entries){
 if(!row||close?.state!=='COMPLETED'||row.close_id!==close.id||row.parent_binding!==perpsCloseExecutionParentBinding(close)
  ||integer(row.completed_at)<close.created||close.updated!==row.completed_at)fail();
 validateStoredPerpsCloseExecution(execution,close);if(execution.state!=='FIRST_LEG_FINALIZED')fail();
 if(row.completed_at<execution.updated||conversion!==null&&row.completed_at<conversion.updated)fail();
 if(typeof row.record_json!=='string'||row.record_json.length>262144)fail();const v=JSON.parse(row.record_json),payout=JSON.parse(execution.payout_json);
 if(storedPerpsCloseCompletion(v)!==row.record_json||Object.keys(v).sort().join(',')!==[...names].sort().join(','))fail();
 let received=payout.receiveAsset==='USDC'?payout.receivedTokenUnits:'0',slot=payout.slot,sig=null;
 if(payout.requiresConversion){
  validateStoredPerpsCloseConversion(conversion,close,execution);if(conversion.state!=='FINALIZED')fail();
  const receipt=JSON.parse(conversion.receipt_json);received=receipt.receivedUsdcUnits;slot=receipt.slot;sig=receipt.signature;
 }else if(conversion!==null)fail();
 if(v.closeId!==close.id||v.walletAddress!==close.wallet||v.positionAddress!==close.position||v.firstLegSignature!==execution.signature
  ||v.conversionSignature!==sig||v.financialSlot!==slot||integer(v.observedSlot)<slot||row.observed_slot!==v.observedSlot
  ||integer(v.observedAt)>row.completed_at+2000||row.completed_at-v.observedAt>10000||new Date(v.observedAt).toISOString().slice(0,10)!==v.day
  ||new Date(row.completed_at).toISOString().slice(0,10)!==v.day||units(v.receivedUsdcUnits)!==received)fail();
 units(v.lossTodayUsdUnits);
 const original=JSON.parse(close.entries),reservations=[],exits=[];
 if(!Array.isArray(entries)||entries.length!==original.length)fail();
 for(const e of original){
  const parent=entries.find(r=>r.reservation===e.reservation);
  if(!parent||parent.state!=='CLOSED'||parent.wallet!==close.wallet||parent.position_address!==close.position||parent.closed_slot!==v.observedSlot
   ||parent.updated!==row.completed_at||['signature','wire_hash','confirmed_slot','entry_exit_plan'].some(k=>parent[k]!==e[k]))fail();
  reservations.push(e.reservation);const plan=JSON.parse(e.entry_exit_plan);if(canonicalServerPerpsEntryExitPlan(plan)!==e.entry_exit_plan)fail();
  for(const exit of plan.exits)exits.push(exit.address);
 }
 if(new Set(reservations).size!==reservations.length||new Set(exits).size!==exits.length||JSON.stringify(v.reservationIds)!==JSON.stringify(reservations.sort())
  ||JSON.stringify(v.siblingExitAddresses)!==JSON.stringify(exits.sort()))fail();return row;
}
