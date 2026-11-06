// First leg of a manual Long only. It never opens a position. A separate
// finalized collateral review and explicit opening confirmation remain required.
import {randomUUID,randomBytes} from 'node:crypto';
import {createPerpsEntryConversionEngine} from './perps-entry-conversion-engine.js';
import {readPreparedPerpsEntryConversion} from './perps-entry-conversion-preparation.js';
import {authorizeBotEntryConversionCustody} from './perps-bot-swap-signing.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {quotePerpsPlatformFee,PERPS_PLATFORM_FEE} from './perps-platform-fee.js';
import {deriveServerPerpsIdentities} from './perps-server-custody.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const fail=code=>{throw Error(code||'BOT_MANUAL_REVIEW_CHANGED');};
export function createBotManualEntryFunding({controls,vault,journal,swapJournal,policyStore,backupRegistry,readAccount,rpcRequest,sendRequest,
 feeJournal,platformFees,owned,assertCustody,gate,operation,isRunning,now,monotonicNow}){
 const reviews=new Map();
 function check(p){
  const state=owned(p.who);assertCustody(p.who);
  if(!isRunning()||state.enabled!==false||state.paused!==true||state.revision!==p.revision
    ||JSON.stringify(policyStore.readLimits(p.who))!==p.policyText)fail();
  if(p.prepared)readPreparedPerpsEntryConversion(p.prepared);
  if(journal.pending(p.who.walletAddress).some(row=>row.reservation!==p.id)
    ||journal.pendingPositionCloses(p.who.walletAddress).length||journal.pendingExitCancellations(p.who.walletAddress).length
    ||journal.pendingPlatformFeePayments(p.who.walletAddress).length)fail('BOT_MANUAL_PENDING');
  if(swapJournal.pending(p.who.walletAddress).some(row=>row.id!==p.conversionId))fail('BOT_MANUAL_PENDING');
  const fees=platformFees.status(p.who);if(fees.dueUnits!=='0'||fees.pendingCount!==0||fees.failedCount!==0)fail('BOT_MANUAL_FEE_PENDING');
 }
 return Object.freeze({
  hasReview:id=>reviews.has(id),
  async prepare({who,draft}){
   const state=gate(who),policy=policyStore.readLimits(who);
   for(const [id,p]of reviews)if(now()>=p.review.expiresAt){p.engine.invalidate();reviews.delete(id);}
   if(reviews.size>=100)fail('BOT_MANUAL_BUSY');
   if(draft.side!=='LONG')fail('BOT_MANUAL_REVIEW_REQUIRED');
   await platformFees.assertActivationReadiness(who);gate(who);
   const p={who,id:randomUUID(),conversionId:randomBytes(32).toString('hex'),revision:state.revision,policyText:JSON.stringify(policy),used:false};
   let claim;
   const adapter={
    read:async wallet=>swapJournal.pending(wallet).find(row=>row.id!==p.conversionId||row.state!=='SIGNING')??null,
    begin:async row=>swapJournal.beginBroadcast(claim,row),
    resolve:async()=>fail('BOT_MANUAL_CONVERSION_PENDING')
   };
   p.engine=createPerpsEntryConversionEngine({request:rpcRequest,sendRequest:(method,args)=>{check(p);return sendRequest(method,args);},
    journal:adapter,isCurrent:()=>{try{check(p);return true;}catch{return false;}},now,monotonicNow});
   p.prepared=await p.engine.prepare(draft,who.walletAddress);check(p);
   const account=await readAccount({...who,minimumSlot:p.prepared.observedSlot});
   requireFreshServerPerpsDailyAccount(account,{walletAddress:who.walletAddress,minimumSlot:p.prepared.observedSlot,journal});check(p);
   const fee=quotePerpsPlatformFee(p.prepared.usdcUnits);
   if(BigInt(account.availableUsdcUnits)<BigInt(fee.totalMarginAndPlatformFeeUnits))fail('BOT_MANUAL_INSUFFICIENT_USDC');
   if(BigInt(fee.totalMarginAndPlatformFeeUnits)>BigInt(exactUsdUnits(policy.limits.capitalUsd)))fail('BOT_MANUAL_CAPITAL_LIMIT');
   p.position=(await deriveServerPerpsIdentities({walletAddress:who.walletAddress,asset:p.prepared.draft.asset,side:'LONG'})).position;check(p);
   p.conversionReview=Object.freeze({...p.prepared,id:p.conversionId,controlRevision:state.revision,reservationId:p.id});
   p.review=Object.freeze({stage:'BOT_MANUAL_ENTRY_CONVERSION_REVIEW',id:p.id,walletAddress:who.walletAddress,draft:p.prepared.draft,
    expiresAt:p.prepared.expiresAt,marginUsdcUnits:p.prepared.usdcUnits,networkFeeLamports:p.prepared.networkFeeLamports,
    rentLockedLamports:p.prepared.rentLockedLamports,fee,limits:policy.limits,controlRevision:state.revision,manualRevision:policy.revision,
    maxSlippageBps:50,minimumCollateralUnits:p.prepared.minimumCollateralUnits,collateralMint:p.prepared.collateralMint,
    requiresSeparateOpeningConfirmation:true,submitted:false});
   p.setClaim=value=>{claim=value;};reviews.set(p.id,p);return p.review;
  },
  async confirm({ownerAccountHash,walletAddress,id,explicitApproval,explicitFeeApproval,feeTermsVersion}){
   const who={ownerAccountHash,walletAddress},p=reviews.get(id);owned(who);
   if(!p||p.used||p.who.ownerAccountHash!==ownerAccountHash||p.who.walletAddress!==walletAddress
     ||explicitApproval!==true||explicitFeeApproval!==true||feeTermsVersion!==PERPS_PLATFORM_FEE.version||now()>=p.review.expiresAt)fail('BOT_MANUAL_REVIEW_REQUIRED');
   p.used=true;reviews.delete(id);let reserved=false,claim;
   try{
    gate(who);check(p);
    const native=readPreparedPerpsEntryConversion(p.prepared),snapshot=await readAccount({...who,minimumSlot:p.prepared.observedSlot});
    requireFreshServerPerpsDailyAccount(snapshot,{walletAddress,minimumSlot:p.prepared.observedSlot,journal});check(p);
    journal.reserve({walletAddress,signalId:'manual:'+id,reservationId:id,marginUsd:p.prepared.draft.margin,
     limits:policyStore.readLimits(who).limits,snapshot,positionAddress:p.position,platformFeeUnits:p.review.fee.feeUnits});reserved=true;
    journal.holdEntryConversion({reservationId:id,conversionId:p.conversionId,wire:native.wire,draft:p.prepared.draft});
    feeJournal.recordConsent({reservationId:id,walletAddress,termsVersion:feeTermsVersion,explicitConsent:true});check(p);
    const authorized=await authorizeBotEntryConversionCustody({engineGrant:p.engine.authorize(p.prepared,true),prepared:p.prepared,review:p.conversionReview,
     journal:swapJournal,executionJournal:journal,reservationId:id,ownerAccountHash,controls,backupRegistry,readAccount,
     readLimits:v=>policyStore.readLimits(v),assertCurrent:()=>check(p)});
    claim=authorized.claim;p.setClaim(claim);
    const signed=vault.signBotSwap(authorized.grant);swapJournal.signed(claim,signed);check(p);
    await p.engine.submit(p.prepared,signed);return operation(who,id);
   }catch(error){
    if(claim&&swapJournal.read(p.conversionId).state==='SIGNING')swapJournal.abortUnsignedOrUnsent(claim);
    if(reserved&&swapJournal.read(p.conversionId)?.state==='UNKNOWN')return operation(who,id);
    if(reserved&&!journal.entryConversionHold(id))journal.cancelUnsigned(id);
    // A held conversion is never released on a timeout or an unproven failure.
    throw error;
   }finally{p.engine.invalidate();}
  }
 });
}
