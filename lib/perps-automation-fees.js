// Worker composition of prior consent -> finalized assessment -> exact custody
// payment -> reconciliation. No default key, network, activation or provisioning.
import {readServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import {preparePerpsPlatformFeePayment,requirePerpsPlatformFeeRecipient} from './perps-platform-fee-payment.js';
import {collectReviewedPerpsPlatformFee,reconcilePerpsPlatformFeePayment} from './perps-platform-fee-collection.js';
import {authorizePerpsPlatformFeeCustody} from './perps-platform-fee-signing.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requirePerpsPlatformFeePaymentJournal} from './perps-platform-fee-payment-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {PERPS_PLATFORM_FEE} from './perps-platform-fee.js';
function fail(){throw Error('AUTOMATION_PLATFORM_FEES_UNAVAILABLE');}
export function createPerpsAutomationFees({feeJournal,paymentJournal,riskJournal,controls,vault,backupRegistry,request,isExecutionRunning,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePerpsExecutionJournal(riskJournal);requirePerpsPlatformFeePaymentJournal(paymentJournal);
 if(['consentedEntries','walletAssessments','recordAutomationEntryConsent','recordAutomationConsent','automationDisclosure','assessFinalizedOpen','requireAutomationPaymentConsent','requireAutomationMandate'].some(k=>typeof feeJournal?.[k]!=='function')
   ||typeof controls?.read!=='function'||typeof vault?.signPlatformFee!=='function'||typeof request!=='function'||typeof isExecutionRunning!=='function')fail();
 const running=new Set();
 const identity=who=>{const state=controls.read(who);if(state.walletAddress!==who.walletAddress)fail();return state;};
 return Object.freeze({
  async assertActivationReadiness(who){
   const original=identity(who);
   if(requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who).platformFeeStateIncluded!==true)fail();
   await requirePerpsPlatformFeeRecipient({request});
   if(identity(who).revision!==original.revision||requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who).platformFeeStateIncluded!==true)fail();
  },
  async assertEntryReadiness(who){
   const original=identity(who),revision=feeJournal.requireAutomationMandate({...who,controlRevision:original.revision});
   if(requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who).platformFeeStateIncluded!==true)fail();
   await requirePerpsPlatformFeeRecipient({request});feeJournal.requireAutomationMandate({...who,controlRevision:revision});
  },
  status(who){
   identity(who);let due=0n,paid=0n,pendingCount=0,failedCount=0;
   for(const assessment of feeJournal.walletAssessments(who.walletAddress)){
    const payment=paymentJournal.read(assessment.id);
    if(payment?.state==='PAID')paid+=BigInt(assessment.fee);else due+=BigInt(assessment.fee);
    if(payment&&['SIGNING','UNKNOWN'].includes(payment.state))pendingCount++;
    if(payment?.state==='FAILED')failedCount++;
   }
   return Object.freeze({stage:'PLATFORM_FEE_STATUS',walletAddress:who.walletAddress,termsVersion:PERPS_PLATFORM_FEE.version,
    dueUnits:due.toString(),paidUnits:paid.toString(),pendingCount,failedCount});
  },
  automationDisclosure:state=>feeJournal.automationDisclosure(state),
  recordAutomationConsent:args=>feeJournal.recordAutomationConsent(args),
  recordAutomationEntryConsent:args=>{
   const who={ownerAccountHash:args.ownerAccountHash,walletAddress:args.walletAddress};
   if(requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who).platformFeeStateIncluded!==true)fail();
   return feeJournal.recordAutomationEntryConsent(args);
  },
  async reconcileWallet(who,{allowCollection=false}={}){
   if(typeof allowCollection!=='boolean')fail();const original=identity(who),wallet=who.walletAddress;
   if(running.has(wallet))return {stage:'PLATFORM_FEE_CYCLE_ALREADY_RUNNING',pending:true};running.add(wallet);
   try{
    for(const entry of feeJournal.consentedEntries(wallet)){
     if(feeJournal.read(entry.reservation))continue;
     // Derive the actual finalized landing day, not the reservation's UTC day.
     const params=[entry.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}],tx=await request('getTransaction',params);
     if(tx===null)return {stage:'PLATFORM_FEE_OPEN_RECONCILIATION_REQUIRED',pending:false,due:true};
     if(!Number.isSafeInteger(tx.blockTime)||tx.blockTime<0)fail();
     const day=new Date(tx.blockTime*1000).toISOString().slice(0,10);
     const receipt=await readServerPerpsTradeTransaction({walletAddress:wallet,signature:entry.signature,day},{request:(method,p)=>method==='getTransaction'&&JSON.stringify(p)===JSON.stringify(params)?Promise.resolve(structuredClone(tx)):request(method,p),now,monotonicNow});
     feeJournal.assessFinalizedOpen(entry.reservation,receipt);
    }
    for(const assessment of feeJournal.walletAssessments(wallet)){
     const payment=paymentJournal.read(assessment.id),lock=riskJournal.readPlatformFeeLock(assessment.id);
     if(payment){
      if(['PAID','FAILED'].includes(payment.state)&&lock?.state===payment.state){if(payment.state==='FAILED')return {stage:'PLATFORM_FEE_PAYMENT_FAILED',pending:true};continue;}
      const result=await reconcilePerpsPlatformFeePayment(assessment.id,{journal:paymentJournal,riskJournal,request,now});
      if(result.state!=='PAID')return {stage:'PLATFORM_FEE_RECONCILIATION_REQUIRED',pending:true};continue;
     }
     const current=identity(who);
     if(!allowCollection||original.enabled!==true||original.paused!==false||current.enabled!==true||current.paused!==false||current.revision!==original.revision)
      return {stage:'PLATFORM_FEE_PAYMENT_REVIEW_REQUIRED',pending:false,due:true};
     feeJournal.requireAutomationPaymentConsent({...who,review:{assessmentId:assessment.id,reservationId:assessment.reservation,feeUnits:assessment.fee,marginUnits:assessment.margin},controlRevision:original.revision});
     // Do not start payment ahead of a recorded financial operation or close.
     if(riskJournal.pending(wallet).length||riskJournal.pendingPositionCloses(wallet).length||riskJournal.pendingExitCancellations(wallet).length)
      return {stage:'PLATFORM_FEE_DEFERRED_FOR_OPERATION',pending:false,due:true};
     const review=await preparePerpsPlatformFeePayment(assessment,{request,now,monotonicNow});
     if(identity(who).revision!==original.revision)fail();
     const result=await collectReviewedPerpsPlatformFee(review,{journal:paymentJournal,riskJournal,request,explicitApproval:true,
      signReviewed:(review,claim)=>vault.signPlatformFee(authorizePerpsPlatformFeeCustody(review,claim,{...who,feeJournal,paymentJournal,riskJournal,backupRegistry,isExecutionRunning}))});
     return {stage:result.stage,pending:true,paid:false,readyForRetry:false};
    }
    return {stage:'PLATFORM_FEES_RECONCILED',pending:false,due:false};
   }finally{running.delete(wallet);}
  }
 });
}
