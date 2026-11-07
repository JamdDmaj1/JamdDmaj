// Durable audit intent only, not custody authorization or a send capability.
// Existing wallet-swap exclusion remains held until explicit recovery resolves.
import {planEntryRecoveryAttempt,readEntryRecoveryAttempts} from './perps-entry-recovery-attempts.js';
import {requireBotSwapJournal,requireBotSwapClaim} from './perps-bot-swap-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {readPreparedPerpsEntryCollateralRecovery} from './perps-entry-collateral-recovery-preparation.js';
function fail(){throw Error('PERPS_ENTRY_COLLATERAL_RECOVERY_INTENT_REQUIRED');}
const intents=new WeakMap();
export function readPerpsEntryCollateralRecoveryIntent(value,{signed=false}={}){
 const p=intents.get(value);if(!p)fail();readPreparedPerpsEntryCollateralRecovery(p.prepared);
 const row=requireBotSwapClaim(p.claim,p.journal);
 const chain=readEntryRecoveryAttempts(id=>p.journal.read(id),{walletAddress:row.wallet,reservationId:value.reservationId,conversionSignature:JSON.parse(row.review).conversionSignature});
 if(chain.current?.id!==row.id||JSON.stringify(chain.rows.filter(previous=>previous.id!==row.id))!==p.ancestors)fail();
 const original=JSON.parse(p.record);
 if(signed){
  if(row.signed===null||row.signature===null||row.updated<original.updated)fail();
  if(JSON.stringify({...row,signed:null,signature:null,updated:original.updated})!==p.record)fail();
 }else if(JSON.stringify(row)!==p.record)fail();return p;
}
export function recordPerpsEntryCollateralRecoveryIntent(prepared,{journal,executionJournal,ownerAccountHash,controlRevision,explicitApproval,previousRecoveryId=null}={}){
 requireBotSwapJournal(journal);requirePerpsExecutionJournal(executionJournal);
 if(explicitApproval!==true||typeof controlRevision!=='string'||!controlRevision.length||controlRevision.length>200)fail();
 const {binding,wire}=readPreparedPerpsEntryCollateralRecovery(prepared);
 const hold=executionJournal.entryConversionHold(binding.reservationId),parent=executionJournal.read(binding.reservationId);
 const source=hold&&journal.read(hold.conversion_id);
 if(!source||source.owner!==ownerAccountHash||source.wallet!==binding.walletAddress||source.signature!==binding.conversionSignature
  ||source.state!=='FINALIZED'||parent?.wallet!==binding.walletAddress||hold.state!=='FINALIZED'
  ||journal.pending(binding.walletAddress).length)fail();
 const attempt=planEntryRecoveryAttempt(id=>journal.read(id),binding,{previousRecoveryId}),{id}=attempt;
 // Two journal rows must never share a signed signature, even if the previous
 // row was never broadcast. Wait for a genuinely different reviewed message.
 const history=readEntryRecoveryAttempts(id=>journal.read(id),binding).rows;
 if(history.some(row=>row.owner!==ownerAccountHash||row.signed!==null&&row.message===wire.messageBase64))fail();
 const review={stage:'ENTRY_COLLATERAL_RECOVERY_INTENT',...attempt,walletAddress:binding.walletAddress,controlRevision,
  reservationId:binding.reservationId,conversionId:source.id,conversionSignature:binding.conversionSignature,
  openingSignature:binding.openingSignature,asset:binding.asset,amountUnits:binding.amountUnits,
  minimumUsdcUnits:prepared.minimumUsdcUnits,maxSlippageBps:50,source:wire.source,destination:wire.destination,
  lastValidBlockHeight:wire.lastValidBlockHeight,networkFeeLamports:prepared.networkFeeLamports,
  requiresFreshSigningRevalidation:true,requiresExplicitRecoveryConfirmation:true};
 const claim=executionJournal.claimEntryRecoverySwap(prepared,{swapJournal:journal,ownerAccountHash,review});
 const result=Object.freeze({stage:'ENTRY_COLLATERAL_RECOVERY_INTENT_RECORDED',id,reservationId:binding.reservationId,walletAddress:binding.walletAddress,
  state:'SIGNING',readyForSigning:false,tradingEnabled:false,readyForRetry:false});
 intents.set(result,Object.freeze({claim,journal,executionJournal,prepared,ownerAccountHash,controlRevision,record:JSON.stringify(journal.read(id)),ancestors:JSON.stringify(history)}));return result;
}
