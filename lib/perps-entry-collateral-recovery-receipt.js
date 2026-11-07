// Restart-safe read-only recovery evidence. No sends or risk release.
import {createHash} from 'node:crypto';
import {readEntryRecoveryAttempts} from './perps-entry-recovery-attempts.js';
import bs58 from 'bs58';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {recoverHeldPerpsEntryCollateral} from './perps-entry-conversion-recovery.js';
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {bindRecoverablePerpsEntryCollateral} from './perps-entry-collateral-recovery-binding.js';
import {PERPS_CUSTODIES,decodeServerPerpsCustody} from './perps-server-custody.js';
import {buildUnsignedPerpsCloseConversionWire} from './perps-close-conversion-wire.js';
import {readFinalizedPerpsCloseConversionReceipt,requireVerifiedPerpsCloseConversionReceipt} from './perps-close-conversion-receipt.js';
function fail(){throw Error('PERPS_ENTRY_RECOVERY_RECEIPT_REQUIRED');}
export async function readRecordedPerpsEntryRecoveryMaterial({journal,executionJournal,id,ownerAccountHash},{request,now=Date.now,monotonicNow=()=>performance.now(),failedReturnMode=false}={}){
 requireBotSwapJournal(journal);requirePerpsExecutionJournal(executionJournal);
 const row=journal.read(id),review=row&&JSON.parse(row.review);
 if(typeof request!=='function'||typeof failedReturnMode!=='boolean'||!row||row.owner!==ownerAccountHash||!(failedReturnMode?['UNKNOWN','FAILED']:['UNKNOWN','FINALIZED']).includes(row.state)
  ||review.stage!=='ENTRY_COLLATERAL_RECOVERY_INTENT'||review.maxSlippageBps!==50)fail();
 const parent=executionJournal.read(review.reservationId),hold=executionJournal.entryConversionHold(review.reservationId);
 if(!parent||!hold||hold.conversion_id!==review.conversionId||parent.wallet!==row.wallet)fail();
 const attempts=()=>readEntryRecoveryAttempts(key=>journal.read(key),{walletAddress:row.wallet,reservationId:parent.reservation,conversionSignature:hold.signature});
 if(attempts().current?.id!==id)fail();
 const saved=JSON.stringify({row,parent,hold,conversion:journal.read(hold.conversion_id),attempts:attempts().rows});
 const current=()=>{if(JSON.stringify({row:journal.read(id),parent:executionJournal.read(review.reservationId),hold:executionJournal.entryConversionHold(review.reservationId),conversion:journal.read(hold.conversion_id),attempts:attempts().rows})!==saved)fail();};
 const guarded=async(m,p)=>{current();const reply=await request(m,p);current();return reply;};
 const entry=await recoverHeldPerpsEntryCollateral({executionJournal,journal,reservationId:review.reservationId,ownerAccountHash},{request:guarded,now,monotonicNow});
 if(entry.stage==='RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY')fail();
 const failure=['UNCERTAIN','CLOSED'].includes(parent.state)?await readPerpsBroadcastReceipt({walletAddress:row.wallet,signature:parent.signature,wireHash:parent.wire_hash},guarded,{now,requireFinalized:true}):null;
 if(['CLOSED','CANCELLED'].includes(parent.state)&&row.state!=='FINALIZED')fail();
 const binding=bindRecoverablePerpsEntryCollateral({journal:executionJournal,reservationId:review.reservationId,entryBinding:entry,failedOpeningReceipt:failure,allowRecovered:row.state==='FINALIZED'},{now});
 if(binding.amountUnits!==review.amountUnits||binding.source!==review.source||binding.conversionSignature!==review.conversionSignature
  ||binding.openingSignature!==review.openingSignature||binding.asset!==review.asset)fail();
 const keys=[PERPS_CUSTODIES[binding.asset].address,PERPS_CUSTODIES.USDC.address];
 const native=await guarded('getMultipleAccounts',[keys,{encoding:'base64',commitment:'finalized',minContextSlot:binding.minimumSlot}]);
 if(!Number.isSafeInteger(native?.context?.slot)||native.context.slot<binding.minimumSlot||!Array.isArray(native.value)||native.value.length!==2)fail();
 const collateral=decodeServerPerpsCustody(binding.asset,keys[0],native.value[0]),usdc=decodeServerPerpsCustody('USDC',keys[1],native.value[1]);
 const message=Buffer.from(row.message,'base64'),count=message[3],blockAt=4+count*32;
 if(message[0]!==1||message[1]!==0||count<1||count>=128||message.length<blockAt+33)fail();
 const wire=await buildUnsignedPerpsCloseConversionWire({walletAddress:row.wallet,asset:binding.asset,amountUnits:binding.amountUnits,
  minimumUsdcUnits:review.minimumUsdcUnits,nativeSolInput:false,closeWrappedAccount:false,blockhash:bs58.encode(message.subarray(blockAt,blockAt+32)),lastValidBlockHeight:row.last_height},collateral,usdc);
 if(wire.messageBase64!==row.message||wire.destination!==review.destination||row.last_height!==review.lastValidBlockHeight)fail();
 return Object.freeze({wire,row,binding,parent,guarded,current});
}
export async function readRecordedPerpsEntryRecoveryReceipt(input,options={}){
 const {wire,row,binding,parent,guarded,current}=await readRecordedPerpsEntryRecoveryMaterial(input,{...options,failedReturnMode:false});
 const {now=Date.now,monotonicNow=()=>performance.now()}=options;
 const receipt=await readFinalizedPerpsCloseConversionReceipt(wire,{signature:row.signature,wireHash:createHash('sha256').update(Buffer.from(row.signed,'base64')).digest('hex'),
  createdAt:row.created,minimumSlot:binding.minimumSlot},{request:guarded,now,monotonicNow});current();
 if(receipt&&['CLOSED','CANCELLED'].includes(parent.state)&&parent.closed_slot!==receipt.slot)fail();
 return receipt;
}

// This settles only the wallet-swap exclusion. Original execution collateral
// stays reserved until complete recovery costs/history are independently proved.
export async function reconcileRecordedPerpsEntryRecovery(input,options={}){
 requireBotSwapJournal(input.journal);requirePerpsExecutionJournal(input.executionJournal);
 const before=input.journal.read(input.id),review=before&&JSON.parse(before.review);
 if(!before||review.stage!=='ENTRY_COLLATERAL_RECOVERY_INTENT')fail();
 const parent=input.executionJournal.read(review.reservationId),hold=input.executionJournal.entryConversionHold(review.reservationId);
 const snapshot=JSON.stringify({before,parent,hold});
 const receipt=await readRecordedPerpsEntryRecoveryReceipt(input,options);
 if(receipt===null)return Object.freeze({stage:'ENTRY_RECOVERY_AWAITING_FINALITY',id:input.id,walletAddress:before.wallet,state:before.state,readyForRetry:false});
 requireVerifiedPerpsCloseConversionReceipt(receipt);
 if(JSON.stringify({before:input.journal.read(input.id),parent:input.executionJournal.read(review.reservationId),hold:input.executionJournal.entryConversionHold(review.reservationId)})!==snapshot)fail();
 if(before.state==='UNKNOWN')input.journal.settle(input.id,receipt.signature,'FINALIZED');
 else if(before.state!=='FINALIZED')fail();
 return Object.freeze({stage:'ENTRY_RECOVERY_RETURN_VERIFIED_ACCOUNTING_REQUIRED',id:input.id,reservationId:review.reservationId,walletAddress:before.wallet,
  state:'FINALIZED',signature:receipt.signature,slot:receipt.slot,receivedUsdcUnits:receipt.receivedUsdcUnits,
  readyForRetry:false,readyForSigning:false,tradingEnabled:false,originalRiskReleased:false,requiresCompleteRecoveryAccounting:true});
}
