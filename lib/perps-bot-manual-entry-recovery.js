// Explicit review -> one-use confirmation -> exact recovery submission.
// No API caller can supply transaction bytes, amounts or a replacement wallet.
import {randomUUID} from 'node:crypto';
import {readEntryRecoveryAttempts} from './perps-entry-recovery-attempts.js';
import {recoverHeldPerpsEntryCollateral} from './perps-entry-conversion-recovery.js';
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {bindRecoverablePerpsEntryCollateral} from './perps-entry-collateral-recovery-binding.js';
import {preparePerpsEntryCollateralRecovery,readPreparedPerpsEntryCollateralRecovery} from './perps-entry-collateral-recovery-preparation.js';
import {recordPerpsEntryCollateralRecoveryIntent} from './perps-entry-collateral-recovery-intent.js';
import {authorizeBotEntryCollateralRecoveryCustody} from './perps-bot-swap-signing.js';
import {submitPerpsEntryCollateralRecovery} from './perps-entry-collateral-recovery-submit.js';
import {reconcileRecordedPerpsEntryRecovery} from './perps-entry-collateral-recovery-receipt.js';
import {proveAccountedPerpsEntryRecovery} from './perps-entry-recovery-completion.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {readHistoricalPerpsEntryRecoveryCosts} from './perps-entry-recovery-historical-costs.js';
import {readFailedPerpsEntryRecovery,reconcileAccountedFailedPerpsEntryRecovery,proveAccountedEntryRecoveryFailures,requireAccountedEntryRecoveryFailures} from './perps-entry-recovery-failure.js';
function fail(){throw Error('BOT_MANUAL_RECOVERY_REVIEW_REQUIRED');}
export function createBotManualEntryRecovery({journal,swapJournal,vault,controls,backupRegistry,rpcRequest,sendRequest,readFinalizedAccount,
 owned,assertCustody,exclusive,isRunning,now,monotonicNow,fetchImpl}){
 const reviews=new Map();
 function context(who){const state=owned(who);assertCustody(who);if(!isRunning()||state.enabled!==false||state.paused!==true)fail();return state;}
 function original(who,id){const parent=journal.read(id),hold=journal.entryConversionHold(id);
  if(!parent||!hold||parent.wallet!==who.walletAddress||parent.signal!=='manual:'+id)fail();return {parent,hold};}
 const attempts=(who,id,signature)=>readEntryRecoveryAttempts(key=>swapJournal.read(key),{walletAddress:who.walletAddress,reservationId:id,conversionSignature:signature});
 return Object.freeze({
  prepare(args){return exclusive(args.walletAddress,async()=>{
   const who={ownerAccountHash:args.ownerAccountHash,walletAddress:args.walletAddress},state=context(who),{parent,hold}=original(who,args.id);
   if(!['RESERVED','UNCERTAIN'].includes(parent.state)||swapJournal.pending(who.walletAddress).length)fail();
   const chain=hold.signature?attempts(who,args.id,hold.signature):null,prior=chain?.current??null;
   if(chain&&!chain.canReview&&!chain.failedReviewCandidate)fail();
   if(prior&&(prior.owner!==who.ownerAccountHash||!['ABORTED','FAILED'].includes(prior.state)))fail();
   let failureEvidence=null;
   const rejected=chain?.rows.filter(row=>row.state==='FAILED')??[];
   if(rejected.length){
    const failures=[];
    for(const row of rejected){
     const proof=await readFailedPerpsEntryRecovery({journal:swapJournal,executionJournal:journal,id:row.id,ownerAccountHash:who.ownerAccountHash},{request:rpcRequest,now,monotonicNow});
     if(!proof)fail();failures.push(proof);
    }
    const account=await readFinalizedAccount({...who,minimumSlot:Math.max(...failures.map(proof=>proof.slot))});
    failureEvidence=proveAccountedEntryRecoveryFailures(failures,{journal:swapJournal,executionJournal:journal,account,ownerAccountHash:who.ownerAccountHash});
   }
   for(const [id,p]of reviews)if(now()>=p.review.expiresAt)reviews.delete(id);if(reviews.size>=100)fail();
   const entry=await recoverHeldPerpsEntryCollateral({executionJournal:journal,journal:swapJournal,reservationId:args.id,ownerAccountHash:who.ownerAccountHash},{request:rpcRequest,now,monotonicNow});
   if(entry.stage==='RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY')fail();
   const failure=parent.state==='UNCERTAIN'?await readPerpsBroadcastReceipt({walletAddress:who.walletAddress,signature:parent.signature,wireHash:parent.wire_hash},rpcRequest,{now,requireFinalized:true}):null;
   const binding=bindRecoverablePerpsEntryCollateral({journal,reservationId:args.id,entryBinding:entry,failedOpeningReceipt:failure},{now});
   const prepared=await preparePerpsEntryCollateralRecovery(binding,{request:rpcRequest,now,monotonicNow,minimumSlot:Math.max(binding.minimumSlot,failureEvidence?.minimumSlot??0)});
   const message=readPreparedPerpsEntryCollateralRecovery(prepared).wire.messageBase64;
   if(chain?.rows.some(row=>row.signed!==null&&row.message===message))fail();
   if(context(who).revision!==state.revision)fail();
   if(failureEvidence)requireAccountedEntryRecoveryFailures(failureEvidence);
   const expiresAt=Math.min(now()+9000,failureEvidence?.expiresAt??Infinity);if(expiresAt<=now())fail();
   const review=Object.freeze({...prepared,stage:'BOT_MANUAL_ENTRY_RECOVERY_REVIEW',id:randomUUID(),expiresAt,submitted:false,platformFeeUsdcUnits:'0'});
   reviews.set(review.id,{who,prepared,review,revision:state.revision,previousRecoveryId:prior?.id??null,failureEvidence});return review;
  });},
  confirm(args){return exclusive(args.walletAddress,async()=>{
   const who={ownerAccountHash:args.ownerAccountHash,walletAddress:args.walletAddress},state=context(who),p=reviews.get(args.id);
   if(!p||p.who.ownerAccountHash!==who.ownerAccountHash||p.who.walletAddress!==who.walletAddress||args.explicitApproval!==true||now()>=p.review.expiresAt||state.revision!==p.revision)fail();
   reviews.delete(args.id);
   const intent=recordPerpsEntryCollateralRecoveryIntent(p.prepared,{journal:swapJournal,executionJournal:journal,ownerAccountHash:who.ownerAccountHash,controlRevision:p.revision,explicitApproval:true,previousRecoveryId:p.previousRecoveryId,failureEvidence:p.failureEvidence});
   try{
    const authority=authorizeBotEntryCollateralRecoveryCustody({intent,...who,controls,backupRegistry,explicitApproval:true,assertCurrent:()=>{if(context(who).revision!==p.revision)fail();}});
    swapJournal.signed(authority.claim,vault.signBotSwap(authority.grant));
    return await submitPerpsEntryCollateralRecovery(intent,{request:rpcRequest,sendRequest,now,monotonicNow});
   }catch(error){if(swapJournal.read(intent.id).state==='SIGNING')swapJournal.recoverNeverBroadcast(intent.id,who.ownerAccountHash);throw error;}
  });},
  recover(args){return exclusive(args.walletAddress,async()=>{
   const who={ownerAccountHash:args.ownerAccountHash,walletAddress:args.walletAddress};context(who);
   const {parent,hold}=original(who,args.id),row=attempts(who,args.id,hold.signature).current,id=row?.id;
   if(!row||row.owner!==who.ownerAccountHash||row.wallet!==who.walletAddress)fail();
   if(['SIGNING','ABORTED'].includes(row.state)){
    if(row.state==='SIGNING')swapJournal.recoverNeverBroadcast(id,who.ownerAccountHash);
    return {walletAddress:who.walletAddress,id,reservationId:args.id,state:'ABORTED',originalRiskReleased:false,readyForRetry:false,requiresNewReview:true};
   }
   if(['UNKNOWN','FAILED'].includes(row.state)){
    const failure=await readFailedPerpsEntryRecovery({journal:swapJournal,executionJournal:journal,id,ownerAccountHash:who.ownerAccountHash},{request:rpcRequest,now,monotonicNow});context(who);
    if(failure){
     const account=await readFinalizedAccount({...who,minimumSlot:failure.slot});context(who);
     const result=reconcileAccountedFailedPerpsEntryRecovery(failure,{journal:swapJournal,executionJournal:journal,account});
     return {...result,requiresNewReview:attempts(who,args.id,hold.signature).failedReviewCandidate};
    }
   }
   const value=await reconcileRecordedPerpsEntryRecovery({journal:swapJournal,executionJournal:journal,id,ownerAccountHash:who.ownerAccountHash},{request:rpcRequest,now,monotonicNow});context(who);
   if(value.state!=='FINALIZED')return value;
   const account=await readFinalizedAccount({...who,minimumSlot:value.slot});context(who);
   requireFreshServerPerpsDailyAccount(account,{walletAddress:who.walletAddress,minimumSlot:value.slot,journal});
   if(!['CLOSED','CANCELLED'].includes(parent.state)){
    let historicalCosts=null;
    if(!account.entryRecoveries.some(row=>row.signature===value.signature&&row.reservationId===args.id)
     ||!account.entryConversions.some(row=>row.signature===hold.signature&&row.reservationId===args.id)
     ||parent.state==='UNCERTAIN'&&!account.transactions.some(row=>row.signature===parent.signature&&row.failed)){
     historicalCosts=await readHistoricalPerpsEntryRecoveryCosts({journal,swapJournal,reservationId:args.id,signature:value.signature,ownerAccountHash:who.ownerAccountHash,account},
      {request:rpcRequest,fetchImpl,now,monotonicNow});context(who);
    }
    journal.completeEntryRecovery(proveAccountedPerpsEntryRecovery({journal,swapJournal,reservationId:args.id,signature:value.signature,account,historicalCosts}));
   }
   return {...value,stage:'BOT_MANUAL_ENTRY_RECOVERY_COMPLETED',state:journal.read(args.id).state,originalRiskReleased:true,requiresCompleteRecoveryAccounting:false};
  });}
 });
}
