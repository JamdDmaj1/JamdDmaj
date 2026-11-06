// Server-only orchestration. A review cannot sign; confirm consumes it once.
import {randomUUID} from 'node:crypto';
import {prepareInspectedPerpsManualOrder,readInspectedPerpsManualReview} from './perps-manual-preparation.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireManualPerpsPolicyStore} from './perps-manual-policy-store.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {authorizeBotManualSigning} from './perps-bot-manual-signing.js';
import {quotePerpsPlatformFee,PERPS_PLATFORM_FEE} from './perps-platform-fee.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
import {createBotManualClose} from './perps-bot-manual-close.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {recoverHeldPerpsEntryCollateral,recoverNeverBroadcastHeldPerpsEntryConversion} from './perps-entry-conversion-recovery.js';
import {perpsNavigationDraft} from './perps-navigation.js';
import {createBotManualEntryFunding} from './perps-bot-manual-entry-funding.js';
const fail=(code='BOT_MANUAL_UNAVAILABLE')=>{throw Error(code);};
export function createBotManualPerpsService({controls,vault,journal,policyStore,backupRegistry,readAccount,rpcRequest,builderRequest,
 feeJournal,platformFees,hasPendingSwap,isRunning,fetchImpl,readFinalizedAccount,cleanupCoordinator,swapJournal,sendRequest,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePerpsExecutionJournal(journal);requireManualPerpsPolicyStore(policyStore);
 if(swapJournal!==undefined)requireBotSwapJournal(swapJournal);
 if(sendRequest!==undefined&&(typeof sendRequest!=='function'||!swapJournal||typeof vault?.signBotSwap!=='function'))fail();
 if([readAccount,rpcRequest,builderRequest,hasPendingSwap,isRunning,fetchImpl,now,monotonicNow].some(v=>typeof v!=='function')
  ||typeof controls?.readForOwner!=='function'||typeof vault?.signManualEntry!=='function'||typeof feeJournal?.recordConsent!=='function'
  ||typeof platformFees?.assertActivationReadiness!=='function'||typeof platformFees?.status!=='function')fail();
 const reviews=new Map(),busy=new Set();
 function owned(who){
  if(typeof who.ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(who.ownerAccountHash))fail('BOT_MANUAL_OWNERSHIP_REQUIRED');
  const state=controls.readForOwner({ownerAccountHash:who.ownerAccountHash});
  if(!state||state.walletAddress!==who.walletAddress)fail('BOT_MANUAL_OWNERSHIP_REQUIRED');return state;
 }
 function assertCustody(who){
  owned(who);const identity=vault.describe(who);
  if(identity.exclusive!==true||identity.walletAddress!==who.walletAddress||identity.ownerAccountHash!==who.ownerAccountHash||identity.restoreReviewRequired===true)fail();
  const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(backup.platformFeeStateIncluded!==true)fail('BOT_MANUAL_BACKUP_REQUIRED');
 }
 function gate(who,entryReservationId){
  const state=owned(who);assertCustody(who);
  if(!isRunning())fail();
  if(state.enabled!==false||state.paused!==true)fail('BOT_MANUAL_PAUSE_REQUIRED');
  if(entryReservationId!==undefined){
   const row=journal.read(entryReservationId),hold=journal.entryConversionHold(entryReservationId);
   if(row?.wallet!==who.walletAddress||row.signal!=='manual:'+entryReservationId||row.state!=='RESERVED'||hold?.state!=='FINALIZED')fail('BOT_MANUAL_PENDING');
  }
  if(hasPendingSwap(who.walletAddress)||journal.pending(who.walletAddress).some(row=>row.reservation!==entryReservationId)||journal.pendingExitCancellations(who.walletAddress).length
   ||journal.pendingPositionCloses(who.walletAddress).length||journal.pendingPlatformFeePayments(who.walletAddress).length)fail('BOT_MANUAL_PENDING');
  const fees=platformFees.status(who);
  if(fees.dueUnits!=='0'||fees.pendingCount!==0||fees.failedCount!==0)fail('BOT_MANUAL_FEE_PENDING');
  return state;
 }
 function current(p){
  const state=owned(p.who);if(!isRunning()||state.enabled!==false||state.paused!==true||state.revision!==p.revision
   ||JSON.stringify(policyStore.readLimits(p.who))!==p.policyText||hasPendingSwap(p.who.walletAddress))fail('BOT_MANUAL_REVIEW_CHANGED');
  assertCustody(p.who);
 }
 async function exclusive(wallet,fn){if(busy.has(wallet))fail('BOT_MANUAL_BUSY');busy.add(wallet);try{return await fn();}finally{busy.delete(wallet);}}
 function operation(who,id){
  owned(who);const row=journal.read(id);if(!row||row.wallet!==who.walletAddress||row.signal!=='manual:'+id)fail('BOT_MANUAL_NOT_FOUND');
  const hold=journal.entryConversionHold(id),conversion=hold&&swapJournal?swapJournal.read(hold.conversion_id):null;
  return {id,walletAddress:row.wallet,state:row.state,signature:row.signature??null,readyForRetry:false,
   ...(hold?{fundingStage:conversion?.state??hold.state,conversionSignature:conversion?.signature??null,requiresOpeningReview:row.state==='RESERVED'}:{})};
 }
 const closes=typeof readFinalizedAccount==='function'?createBotManualClose({journal,vault,controls,backupRegistry,rpcRequest,builderRequest,fetchImpl,
  readFinalizedAccount,cleanupCoordinator,owned,assertCustody,exclusive,hasPendingSwap,isRunning,now,monotonicNow}):null;
 const funding=sendRequest?createBotManualEntryFunding({controls,vault,journal,swapJournal,policyStore,backupRegistry,readAccount,rpcRequest,sendRequest,
  feeJournal,platformFees,owned,assertCustody,gate,operation,isRunning,now,monotonicNow}):null;
 return Object.freeze({
  async status(who){
   const state=owned(who);let available=true,reason=null;
   try{gate(who);policyStore.readLimits(who);}catch(error){available=false;reason=error.message;}
   if(!closes){available=false;reason='BOT_MANUAL_CLOSE_UNAVAILABLE';}
   return {stage:'BOT_MANUAL_STATUS',walletAddress:state.walletAddress,available,reason,paused:state.paused,closeAvailable:!!closes,
    operations:journal.pending(who.walletAddress).filter(r=>r.signal==='manual:'+r.reservation).map(r=>operation(who,r.reservation))};
  },
  async prepareEntryConversion({ownerAccountHash,walletAddress,draft}){return exclusive(walletAddress,async()=>{
   if(!closes||!funding)fail('BOT_MANUAL_CONVERSION_UNAVAILABLE');
   return funding.prepare({who:{ownerAccountHash,walletAddress},draft:perpsNavigationDraft(draft)});
  });},
  async prepare({ownerAccountHash,walletAddress,draft,entryReservationId}){return exclusive(walletAddress,async()=>{
   if(!closes)fail('BOT_MANUAL_CLOSE_UNAVAILABLE');
   const who={ownerAccountHash,walletAddress};let entryBinding;
   if(entryReservationId!==undefined){
    const state=owned(who);assertCustody(who);
    const parent=journal.read(entryReservationId),hold=journal.entryConversionHold(entryReservationId);
    if(!swapJournal||!isRunning()||state.enabled!==false||state.paused!==true||parent?.wallet!==walletAddress
      ||parent.signal!=='manual:'+entryReservationId||parent.state!=='RESERVED'||!hold
      ||hold.draft_json!==JSON.stringify(perpsNavigationDraft(draft)))fail('BOT_MANUAL_REVIEW_REQUIRED');
    entryBinding=await recoverHeldPerpsEntryCollateral({executionJournal:journal,journal:swapJournal,reservationId:entryReservationId,ownerAccountHash},
      {request:rpcRequest,now,monotonicNow});
    if(entryBinding.stage==='RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY')fail('BOT_MANUAL_CONVERSION_PENDING');
   }
   const state=gate(who,entryReservationId),policy=policyStore.readLimits(who);
   for(const [id,p]of reviews)if(now()>=p.review.expiresAt)reviews.delete(id);
   if(reviews.size>=100)fail('BOT_MANUAL_BUSY');
   await platformFees.assertActivationReadiness(who);gate(who,entryReservationId);
   let native;
   try{native=await prepareInspectedPerpsManualOrder(draft,walletAddress,{rpcRequest,builderRequest,now,monotonicNow,entryBinding});}
   catch(error){
    if(funding&&!entryBinding&&draft?.side==='LONG'&&error.message==='PERPS_PRESWAP_INTENT_MISMATCH_MINIMUM_OUTPUT')
     return funding.prepare({who,draft:perpsNavigationDraft(draft)});
    throw error;
   }
   const fee=quotePerpsPlatformFee(native.marginUsdcUnits);
   const account=await readAccount({...who,minimumSlot:native.observedSlot});
   requireFreshServerPerpsDailyAccount(account,{walletAddress,minimumSlot:native.observedSlot,journal});
   // The durable reserve repeats ALL daily/capital/position checks at confirm.
   if((entryBinding?0n:BigInt(native.marginUsdcUnits))+BigInt(fee.feeUnits)>BigInt(account.availableUsdcUnits))fail('BOT_MANUAL_INSUFFICIENT_USDC');
   if(entryBinding&&String(journal.read(entryReservationId).platform_fee_units)!==fee.feeUnits)fail('BOT_MANUAL_REVIEW_CHANGED');
   if(BigInt(native.marginUsdcUnits)+BigInt(fee.feeUnits)>BigInt(exactUsdUnits(policy.limits.capitalUsd)))fail('BOT_MANUAL_CAPITAL_LIMIT');
   const id=randomUUID(),review=Object.freeze({stage:'BOT_MANUAL_REVIEW',id,walletAddress,draft:native.draft,expiresAt:native.expiresAt,
    marginUsdcUnits:native.marginUsdcUnits,networkFeeLamports:native.networkFeeLamports,rentLockedLamports:native.rentLockedLamports,
    fee,limits:policy.limits,controlRevision:state.revision,manualRevision:policy.revision,submitted:false,
    ...(entryBinding?{entryReservationId,fundingMode:'FINALIZED_ENTRY_COLLATERAL'}:{})});
   const p={who,native,review,entryReservationId,revision:state.revision,policyText:JSON.stringify(policy),used:false};current(p);readInspectedPerpsManualReview(native);
   reviews.set(id,p);return review;
  });},
  async confirm({ownerAccountHash,walletAddress,id,explicitApproval,explicitFeeApproval,feeTermsVersion}){return exclusive(walletAddress,async()=>{
   if(funding?.hasReview(id))return funding.confirm({ownerAccountHash,walletAddress,id,explicitApproval,explicitFeeApproval,feeTermsVersion});
   const p=reviews.get(id),who={ownerAccountHash,walletAddress};owned(who);
   if(!p||p.used||p.who.ownerAccountHash!==ownerAccountHash||p.who.walletAddress!==walletAddress||now()>=p.review.expiresAt
    ||explicitApproval!==true||explicitFeeApproval!==true||feeTermsVersion!==PERPS_PLATFORM_FEE.version)fail('BOT_MANUAL_REVIEW_REQUIRED');
   p.used=true;reviews.delete(id);gate(who,p.entryReservationId);current(p);
   const proof=readInspectedPerpsManualReview(p.native),snapshot=await readAccount({...who,minimumSlot:p.native.observedSlot});
   requireFreshServerPerpsDailyAccount(snapshot,{walletAddress,minimumSlot:p.native.observedSlot,journal});current(p);
   const policy=policyStore.readLimits(who);
   const reservationId=p.entryReservationId??id;
   let reserved=false;
   try{
    if(p.entryReservationId)journal.bindEntryOpeningReview(reservationId,p.native);
    else journal.reserve({walletAddress,signalId:'manual:'+id,reservationId,marginUsd:p.native.draft.margin,limits:policy.limits,snapshot,
     positionAddress:proof.material.positionPubkey,entryExitPlan:proof.entryExitPlan,platformFeeUnits:p.review.fee.feeUnits});reserved=true;
    feeJournal.recordConsent({reservationId,walletAddress,termsVersion:feeTermsVersion,explicitConsent:true});
    current(p);journal.beginSigning(reservationId,{entryBinding:proof.entryBinding});
    const grant=await authorizeBotManualSigning(p.native,{...who,journal,reservationId,readAccount,backupRegistry,
     readLimits:v=>policyStore.readLimits(v),assertCurrent:()=>current(p),explicitApproval:true});
    const signed=vault.signManualEntry(grant);current(p);
    journal.recordBroadcastIntent(reservationId,signed);
    current(p);
    // Uncertainty is durable BEFORE the single external attempt. Never retry.
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{await fetchImpl('https://perps-api.jup.ag/v2/transaction/execute',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
     headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'increase-position',serializedTxBase64:signed.signedBase64})});}
    catch{}finally{clearTimeout(timer);controller.abort();}
    return operation(who,reservationId);
   }catch(error){
    if(reserved&&!p.entryReservationId&&journal.read(reservationId)?.state==='RESERVED')journal.cancelUnsigned(reservationId);
    if(reserved&&['SIGNING','UNCERTAIN'].includes(journal.read(reservationId)?.state))return operation(who,reservationId);
    throw error;
   }
  });},
  recover({ownerAccountHash,walletAddress,id}){
   const who={ownerAccountHash,walletAddress};owned(who);
   const row=journal.read(id),hold=journal.entryConversionHold(id);
   if(row?.wallet!==walletAddress||row.signal!=='manual:'+id)fail('BOT_MANUAL_NOT_FOUND');
   const swap=hold&&swapJournal?swapJournal.read(hold.conversion_id):null;
   if(hold?.state==='HELD'&&['SIGNING','ABORTED'].includes(swap?.state))
    recoverNeverBroadcastHeldPerpsEntryConversion({executionJournal:journal,journal:swapJournal,reservationId:id,ownerAccountHash});
   return operation(who,id);
  },
  positions:args=>{if(!closes)fail('BOT_MANUAL_CLOSE_UNAVAILABLE');return closes.positions(args);},
  prepareClose:args=>{if(!closes)fail('BOT_MANUAL_CLOSE_UNAVAILABLE');return closes.prepare(args);},
  confirmClose:args=>{if(!closes)fail('BOT_MANUAL_CLOSE_UNAVAILABLE');return closes.confirm(args);},
  recoverClose:args=>{if(!closes)fail('BOT_MANUAL_CLOSE_UNAVAILABLE');return closes.recover(args);}
 });
}
