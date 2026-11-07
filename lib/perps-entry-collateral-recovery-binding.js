// Eligibility evidence only. Never releases risk, constructs a signing grant,
// sends a conversion or treats missing transaction history as a failed opening.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {readBoundPerpsEntryCollateral} from './perps-entry-conversion-binding.js';
import {isVerifiedPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_ENTRY_COLLATERAL_RECOVERY_BINDING_REQUIRED');}
export function bindRecoverablePerpsEntryCollateral({journal,reservationId,entryBinding,failedOpeningReceipt=null,allowRecovered=false},{now=Date.now}={}){
 requirePerpsExecutionJournal(journal);readBoundPerpsEntryCollateral(entryBinding);
 const row=journal.read(reservationId),hold=journal.entryConversionHold(reservationId),at=now();
 if(!Number.isSafeInteger(at)||at<0||!row||!hold||row.signal!=='manual:'+reservationId
  ||row.wallet!==entryBinding.walletAddress||hold.state!=='FINALIZED'||hold.conversion_id!==entryBinding.id
  ||hold.asset!==entryBinding.asset||hold.signature!==entryBinding.signature||hold.wire_hash!==entryBinding.wireHash
  ||hold.input_units!==entryBinding.spentUsdcUnits||String(row.margin)!==hold.input_units)fail();
 if(row.state==='CANCELLED'&&allowRecovered===true){
  if(row.signature!==null||row.wire_hash!==null||row.confirmed_slot!==null||!Number.isSafeInteger(row.closed_slot)||row.closed_slot<entryBinding.slot||failedOpeningReceipt!==null)fail();
 }else if(row.state==='RESERVED'){
  if(row.signature!=null||row.wire_hash!=null||failedOpeningReceipt!==null)fail();
 }else if(row.state==='UNCERTAIN'||row.state==='CLOSED'&&allowRecovered===true){
  const receipt=failedOpeningReceipt;
  if(!isVerifiedPerpsBroadcastReceipt(receipt)||receipt.state!=='FAILED'||receipt.confirmationStatus!=='finalized'
   ||receipt.walletAddress!==row.wallet||receipt.signature!==row.signature||receipt.wireHash!==row.wire_hash
   ||receipt.slot<entryBinding.slot||receipt.observedAt>at+2000||at-receipt.observedAt>10000)fail();
  if(row.state==='CLOSED'&&(!Number.isSafeInteger(row.closed_slot)||row.closed_slot<receipt.slot||row.confirmed_slot!==receipt.slot))fail();
 }else fail();
 const result=Object.freeze({stage:'RECOVERABLE_ENTRY_COLLATERAL_ONLY',reservationId,walletAddress:row.wallet,
  asset:entryBinding.asset,collateralMint:entryBinding.collateralMint,source:entryBinding.collateralAccount,
  amountUnits:entryBinding.receivedCollateralUnits,conversionSignature:entryBinding.signature,
  openingSignature:row.signature??null,minimumSlot:Math.max(entryBinding.slot,failedOpeningReceipt?.slot??0),
  maxSlippageBps:50,recoveryAlreadyCompleted:['CLOSED','CANCELLED'].includes(row.state),readyForSigning:false,tradingEnabled:false,requiresExplicitRecoveryConfirmation:true,
  requiresDurableRecoveryReservation:true,requiresFreshSimulation:true});
 proofs.set(result,{journal,reservationId,entryBinding,failedOpeningReceipt,allowRecovered,now,parent:JSON.stringify(row),hold:JSON.stringify(hold)});return result;
}
export function readRecoverablePerpsEntryCollateral(value){
 const p=proofs.get(value);if(!p||JSON.stringify(p.journal.read(p.reservationId))!==p.parent
  ||JSON.stringify(p.journal.entryConversionHold(p.reservationId))!==p.hold)fail();
 const current=bindRecoverablePerpsEntryCollateral(p,{now:p.now});
 if(JSON.stringify(current)!==JSON.stringify(value))fail();return value;
}
