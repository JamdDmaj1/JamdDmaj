// Owner-bound service composition. No default network sender and no runtime
// activation. Native entry remains gated until onboarding/fee collection ship.
import {randomBytes} from 'node:crypto';
import {requirePhoenixExecutionJournal} from './phoenix-execution-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {readPhoenixChainAccount} from './phoenix-chain-account.js';
import {preparePhoenixCloseReview,refreshPhoenixCloseReview,preparePhoenixOrderReview,refreshPhoenixEntryReview} from './phoenix-order-review.js';
import {readPhoenixNativeMarket} from './phoenix-native-market.js';
import {buildPhoenixOrderWire} from './phoenix-order-wire.js';
import {simulatePhoenixOrder} from './phoenix-order-simulation.js';
import {authorizePhoenixOrderSigning} from './phoenix-order-signing.js';
import {reconcilePhoenixOrder} from './phoenix-order-receipt.js';
import {readPhoenixCollateralContext,preparePhoenixCollateral} from './phoenix-collateral.js';
import {buildPhoenixCollateralWire,simulatePhoenixCollateral} from './phoenix-collateral-simulation.js';
import {authorizePhoenixCollateralSigning} from './phoenix-collateral-signing.js';
import {reconcilePhoenixCollateral} from './phoenix-collateral-receipt.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
import {assessPhoenixPlatformFee} from './phoenix-platform-fee-assessment.js';
import {preparePhoenixPlatformFeePayment,requirePerpsPlatformFeeRecipient} from './perps-platform-fee-payment.js';
import {authorizePhoenixFeeSigning,revalidatePhoenixFeeDispatch} from './phoenix-platform-fee-signing.js';
import {buildPhoenixIsolatedSetup} from './phoenix-isolated-setup.js';
import {buildPhoenixChildSetupWire,simulatePhoenixChildSetup} from './phoenix-child-setup-simulation.js';
import {authorizePhoenixChildSetupSigning,inspectPhoenixChildSetupDispatch} from './phoenix-child-setup-signing.js';
const fail=code=>{throw Error('PHOENIX_SERVICE_'+code);};
// One release switch. While set, the venue advertises closed entries and the
// production runtime refuses to prepare or confirm one. Clearing it is an
// explicit release decision that must land together with its tests.
export const PHOENIX_ENTRY_GATE=null;
const freshId=()=>randomBytes(32).toString('hex');
const id=v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail('INPUT');return v;};
export function createPhoenixManualService({controls,vault,journal,riskJournal,swapJournal,backupRegistry,publicClient,client,
 readExchangeKeys,rpcRequest,sendRequest,assertUncontended,isRunning,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePhoenixExecutionJournal(journal);requirePerpsExecutionJournal(riskJournal);requireBotSwapJournal(swapJournal);
 if([readExchangeKeys,rpcRequest,sendRequest,assertUncontended,isRunning,now,monotonicNow].some(f=>typeof f!=='function')||
    typeof controls?.readForOwner!=='function'||typeof vault?.signPhoenixOrder!=='function'||typeof vault?.signPhoenixCollateral!=='function'||
    typeof backupRegistry?.readVerified!=='function'||typeof publicClient?.catalog!=='function'||typeof publicClient?.quote!=='function'||!client?.ixs)fail('CONFIGURATION');
 const reviews=new Map(),busy=new Set(),nativeOptions={request:rpcRequest,now,monotonicNow};
 const readAccount=args=>readPhoenixChainAccount(args,nativeOptions);
 function owned(who){
  id(who?.ownerAccountHash);const state=controls.readForOwner({ownerAccountHash:who.ownerAccountHash});
  if(!state||state.walletAddress!==who.walletAddress)fail('OWNERSHIP');return state;
 }
 function gate(who,allowedAttempt){
  const state=owned(who),identity=vault.describe(who);
  if(!isRunning()||identity.exclusive!==true||identity.ownerAccountHash!==who.ownerAccountHash||identity.walletAddress!==who.walletAddress||identity.restoreReviewRequired)fail('CUSTODY');
  if(state.enabled!==false||state.paused!==true)fail('PAUSE_REQUIRED');
  const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(!backup.phoenixStateIncluded||!backup.botSwapStateIncluded||!backup.platformFeeStateIncluded)fail('BACKUP_REQUIRED');
  if(journal.pending(who.walletAddress).some(a=>a.id!==allowedAttempt)||swapJournal.pending(who.walletAddress).length||riskJournal.pending(who.walletAddress).length||
     riskJournal.pendingPositionCloses(who.walletAddress).length||riskJournal.pendingExitCancellations(who.walletAddress).length||riskJournal.pendingPlatformFeePayments(who.walletAddress).length)fail('PENDING');
  assertUncontended(who);return state;
 }
 async function exclusive(wallet,fn){if(busy.has(wallet))fail('BUSY');busy.add(wallet);try{return await fn();}finally{busy.delete(wallet);}}
 function flow(who,workflowId){owned(who);const f=journal.readWorkflow(id(workflowId),who.ownerAccountHash);if(!f||f.wallet!==who.walletAddress)fail('NOT_FOUND');return f;}
 function operation(who,workflowId){
  const f=flow(who,workflowId),attempts=journal.workflowAttempts(f.id,who.ownerAccountHash),last=attempts.at(-1);
  return {stage:'PHOENIX_MANUAL_OPERATION',venue:'phoenix',walletAddress:f.wallet,workflowId:f.id,symbol:f.symbol,state:f.state,
   attemptId:last?.id??null,attemptState:last?.state??null,phase:last?.kind??null,signature:last?.signature??null,
   submitted:!!last?.signature,walletCredited:f.state==='COMPLETE',readyForRetry:false,
   requiresPolling:['SIGNED','UNKNOWN'].includes(last?.state),requiresQueueReconciliation:f.state==='PAYOUT_PENDING'};
 }
 function consent(who,workflowId,nextCost=0n){
  const f=flow(who,workflowId),c=journal.closeConsent(f.id,who.ownerAccountHash),state=gate(who);
  if(!c||c.expires<=now()||c.accepted>now()||c.revision!==state.revision)fail('CONSENT_REQUIRED');
  const attempts=journal.workflowAttempts(f.id,who.ownerAccountHash),start=attempts.find(a=>a.id===c.attempt);
  if(!start)fail('CONSENT_REQUIRED');
  const spent=attempts.filter(a=>a.sequence>=start.sequence&&a.state==='FINALIZED').reduce((sum,a)=>{
   const r=JSON.parse(a.receipt);return sum+BigInt(r.networkFeeLamports)+BigInt(r.rentLockedLamports??'0');
  },0n);
  if(spent+nextCost>BigInt(c.maximum_lamports))fail('COST_CHANGED');return c;
 }
 async function latest(minimumSlot){
  const r=await rpcRequest('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:minimumSlot}]);
  if(!Number.isSafeInteger(r?.context?.slot)||r.context.slot<minimumSlot||!r.value)fail('NETWORK');return r.value;
 }
 async function reconcile(who,row){
  if(row.kind==='FEE'){
   const result=await journal.feeReceipt(row.id,who.ownerAccountHash,{request:rpcRequest,now});
   if(result.state==='UNKNOWN')return false;journal.recordFinalizedFee(row.id,who.ownerAccountHash,result);return true;
  }
  const p=await journal.recoveryEvidence(row.id,who.ownerAccountHash),native=['OPEN','CLOSE'].includes(row.kind);
  const result=await(native?reconcilePhoenixOrder(p,{request:rpcRequest}):reconcilePhoenixCollateral(p,{request:rpcRequest}));
  if(result.state==='UNKNOWN')return false;
  if(native)journal.recordFinalized(row.id,who.ownerAccountHash,result);else journal.recordFinalizedCollateral(row.id,who.ownerAccountHash,result);return true;
 }
 async function submit(who,row){
  gate(who,row.id);journal.markBroadcast(row.id,who.ownerAccountHash);
  // Mark UNKNOWN durably BEFORE the sole send attempt. A timeout, wrong
  // response or lost reply is reconciled by signature, never sent again.
  try{await sendRequest('sendTransaction',[row.signed,{encoding:'base64',skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed'}]);}catch{}
 }
 async function advance(who,workflowId){
  for(let step=0;step<4;step++){
   const f=flow(who,workflowId),pending=journal.pending(f.wallet).find(a=>a.workflow===f.id);
   if(pending){
    if(pending.state!=='UNKNOWN'||!await reconcile(who,pending))return operation(who,f.id);
    const last=journal.readAttempt(pending.id,who.ownerAccountHash),r=JSON.parse(last.receipt);
    if(r.state==='FAILED'||r.state==='NO_FILL')return {...operation(who,f.id),requiresNewReview:true};
    continue;
   }
   const last=journal.workflowAttempts(f.id,who.ownerAccountHash).at(-1);
   if(last?.state==='FINALIZED'&&['FAILED','NO_FILL'].includes(JSON.parse(last.receipt).state))return {...operation(who,f.id),requiresNewReview:true};
   if(f.state==='OPEN'&&last?.kind==='OPEN'&&last.state==='FINALIZED'&&journal.feeConsent(f.id,who.ownerAccountHash)){
    const state=gate(who),assessment=assessPhoenixPlatformFee({journal,workflowId:f.id,ownerAccountHash:who.ownerAccountHash});
    const review=await preparePhoenixPlatformFeePayment(assessment,{request:rpcRequest,now,monotonicNow});
    const feeId=freshId(),claim=journal.prepareFee({id:feeId,ownerAccountHash:who.ownerAccountHash,controlRevision:state.revision,review});
    try{
     const grant=authorizePhoenixFeeSigning({...who,journal,claim,review,controls,backupRegistry,riskJournal,swapJournal,now,assertUncontended:()=>gate(who,feeId)});
     const signed=vault.signPhoenixFee(grant);await journal.revalidateFeeBeforeBroadcast(claim,{request:rpcRequest});revalidatePhoenixFeeDispatch(grant);
     await submit(who,journal.readAttempt(signed.id,who.ownerAccountHash));
    }catch(error){const row=journal.readAttempt(feeId,who.ownerAccountHash);if(row?.state==='PREPARED')journal.recoverUnsignedOrder(feeId,who.ownerAccountHash);
     if(row&&['SIGNED','UNKNOWN'].includes(row.state))return {...operation(who,f.id),requiresPolling:true};throw error;}
    continue;
   }
   if(!['SETTLING','CANONICAL_READY'].includes(f.state))return operation(who,f.id);
   consent(who,f.id);
   const account=await readAccount({walletAddress:f.wallet,subaccountIndices:[f.child]});
   const context=await readPhoenixCollateralContext({walletAddress:f.wallet,minimumSlot:account.observedSlot,commitment:'confirmed'},nativeOptions);
   const phase=f.state==='SETTLING'?'WITHDRAW':'UNWRAP';let payout,amountUnits;
   if(phase==='UNWRAP'){
    const source=journal.workflowAttempts(f.id,who.ownerAccountHash).findLast(a=>a.kind==='WITHDRAW'&&a.state==='FINALIZED'&&JSON.parse(a.receipt).state==='CANONICAL_RECEIVED');
    if(!source)fail('PAYOUT_REQUIRED');
    payout=await reconcilePhoenixCollateral(await journal.recoveryEvidence(source.id,who.ownerAccountHash),{request:rpcRequest});
    if(payout.state!=='CANONICAL_RECEIVED')return operation(who,f.id);amountUnits=payout.receivedUnits;
   }
   const preparation=await preparePhoenixCollateral({context,account,subaccountIndex:f.child,phase,amountUnits},{request:rpcRequest});
   if(preparation.phase==='WAIT')return {...operation(who,f.id),requiresQueueReconciliation:true};
   const life=await latest(preparation.observedSlot),wire=buildPhoenixCollateralWire(preparation,life),simulation=await simulatePhoenixCollateral(wire,{request:rpcRequest});
   const c=consent(who,f.id,BigInt(simulation.networkFeeLamports)+BigInt(simulation.rentLockedLamports));
   const attemptId=freshId(),claim=journal.prepareCollateral({id:attemptId,workflowId:f.id,ownerAccountHash:who.ownerAccountHash,controlRevision:c.revision,wire,simulation,request:rpcRequest,payout});
   try{
    const grant=authorizePhoenixCollateralSigning({...who,journal,claim,wire,simulation,request:rpcRequest,controls,backupRegistry,riskJournal,swapJournal,explicitApproval:true,
     assertUncontended(){gate(who,attemptId);const current=journal.closeConsent(f.id,who.ownerAccountHash);if(!current||current.attempt!==c.attempt||current.expires<=now())fail('CONSENT_REQUIRED');}});
    const signed=vault.signPhoenixCollateral(grant);await submit(who,journal.readAttempt(signed.id,who.ownerAccountHash));
   }catch(error){const a=journal.readAttempt(attemptId,who.ownerAccountHash);if(a?.state==='PREPARED')journal.recoverUnsignedOrder(attemptId,who.ownerAccountHash);
    if(a&&['SIGNED','UNKNOWN'].includes(a.state))return {...operation(who,f.id),requiresPolling:true};throw error;}
  }
  return operation(who,workflowId);
 }
 return Object.freeze({
  async prepareEntry({ownerAccountHash,walletAddress,symbol,side,marginUsdcUnits,leverageTenths}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},state=gate(who);
   if(typeof vault.signPhoenixFee!=='function')fail('CONFIGURATION');
   const terms=quotePerpsPlatformFee(marginUsdcUnits);
   // No caller-selected child or raw packet. Unprepared accounts are routed to
   // the separate onboarding flow, never silently registered or funded here.
   const account=await readAccount({walletAddress,subaccountIndices:Array.from({length:32},(_,i)=>i+1)});
   const held=new Set(journal.heldWorkflows(walletAddress).map(f=>f.child));
   const child=account.subaccounts.find(a=>a.subaccountIndex>0&&!held.has(a.subaccountIndex)&&a.exists&&a.authorityIsWallet&&a.disableCollateralSweep&&
    !a.withdrawalQueued&&!a.hasLockedDeposit&&!a.hasSplineLiquidity&&!a.spotCollateralCount&&!a.conditionalOrderCount&&a.quoteCollateralUnits==='0'&&
    a.positions.every(p=>p.baseLots==='0'&&p.virtualQuoteLots==='0'));
   if(!child)fail('ONBOARDING_REQUIRED');
   if(!account.usdc.spendable||BigInt(account.usdc.amountUnits)<BigInt(terms.totalMarginAndPlatformFeeUnits))fail('INSUFFICIENT_USDC');
   await requirePerpsPlatformFeeRecipient({request:rpcRequest});
   const review=await preparePhoenixOrderReview({walletAddress,symbol,side,marginUsdcUnits,leverageTenths,isolatedSubaccountIndex:child.subaccountIndex,
    clientOrderId:(BigInt('0x'+randomBytes(16).toString('hex'))|1n).toString()},{publicClient,readSlot:()=>rpcRequest('getSlot',[{commitment:'confirmed'}]),now});
   const native=await readPhoenixNativeMarket(review.plan,{...nativeOptions,exchangeKeys:await readExchangeKeys()});
   const freshAccount=await readAccount({walletAddress,subaccountIndices:[child.subaccountIndex],minimumSlot:review.plan.observedSlot});
   const wire=await buildPhoenixOrderWire(review,{client,exchangeKeys:native.exchangeKeys,...await latest(review.plan.observedSlot),now});
   const simulation=await simulatePhoenixOrder({wire,native,account:freshAccount},nativeOptions);
   const maximumNetworkAndRentLamports=(BigInt(simulation.networkFeeLamports)+BigInt(simulation.rentLockedLamports)+10000n).toString();
   if(BigInt(freshAccount.payerLamports)<BigInt(maximumNetworkAndRentLamports))fail('INSUFFICIENT_SOL');
   if(gate(who).revision!==state.revision)fail('REVIEW_CHANGED');
   for(const [key,p]of reviews)if(p.public.expiresAt<=now())reviews.delete(key);if(reviews.size>=100)fail('BUSY');
   const result=Object.freeze({stage:'PHOENIX_MANUAL_ENTRY_REVIEW',venue:'phoenix',walletAddress,id:freshId(),workflowId:freshId(),symbol,side,marginUsdcUnits,
    leverageTenths,baseLots:review.plan.baseLots,referencePrice:review.plan.referencePrice,priceLimitUsd:review.plan.priceLimitUsd,maxSlippageBps:50,
    maximumProtocolTakerFeeMicro:review.plan.market.feeMicro,protocolFeeUsdcUnits:simulation.protocolFeeUnits,platformFeeUsdcUnits:terms.feeUnits,
    platformFeeTermsVersion:terms.version,platformFeeRecipient:terms.recipient,maximumFeeNetworkLamports:'10000',maximumNetworkAndRentLamports,
    authorizationDurationMs:300000,expiresAt:now()+15000,submitted:false,withdrawalMayQueue:true});
   reviews.set(result.id,{public:result,review,who,revision:state.revision,entry:true});return result;
  });},
  async confirmEntry({ownerAccountHash,walletAddress,id:reviewId,explicitApproval}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},p=reviews.get(id(reviewId));owned(who);
   if(!p?.entry||p.who.ownerAccountHash!==ownerAccountHash||p.who.walletAddress!==walletAddress||p.public.expiresAt<=now()||explicitApproval!==true)fail('REVIEW_REQUIRED');
   if(gate(who).revision!==p.revision)fail('REVIEW_CHANGED');reviews.delete(reviewId);
   try{
    const fresh=await refreshPhoenixEntryReview(p.review,{publicClient,readSlot:()=>rpcRequest('getSlot',[{commitment:'confirmed'}]),now});
    const account=await readAccount({walletAddress,subaccountIndices:[fresh.plan.isolatedSubaccountIndex],minimumSlot:fresh.plan.observedSlot});
    const native=await readPhoenixNativeMarket(fresh.plan,{...nativeOptions,exchangeKeys:await readExchangeKeys()});
    const wire=await buildPhoenixOrderWire(fresh,{client,exchangeKeys:native.exchangeKeys,...await latest(fresh.plan.observedSlot),now});
    const simulation=await simulatePhoenixOrder({wire,native,account},nativeOptions),terms=quotePerpsPlatformFee(fresh.plan.marginUsdcUnits);
    if(BigInt(simulation.networkFeeLamports)+BigInt(simulation.rentLockedLamports)+BigInt(p.public.maximumFeeNetworkLamports)>BigInt(p.public.maximumNetworkAndRentLamports)||
       BigInt(account.payerLamports)<BigInt(p.public.maximumNetworkAndRentLamports))fail('COST_CHANGED');
    await requirePerpsPlatformFeeRecipient({request:rpcRequest});
    const claim=journal.prepareOrder({id:reviewId,workflowId:p.public.workflowId,ownerAccountHash,controlRevision:p.revision,wire,simulation,request:rpcRequest});
    journal.recordFeeConsent({id:reviewId,ownerAccountHash,termsVersion:terms.version,maximumLamports:p.public.maximumFeeNetworkLamports,expiresAt:now()+p.public.authorizationDurationMs,explicitApproval:true});
    const grant=authorizePhoenixOrderSigning({...who,journal,claim,wire,simulation,request:rpcRequest,controls,backupRegistry,riskJournal,swapJournal,
     platformFeeTerms:terms,explicitApproval:true,assertUncontended(){gate(who,reviewId);const c=journal.feeConsent(p.public.workflowId,ownerAccountHash);if(!c||c.expires<=now())fail('CONSENT_REQUIRED');}});
    const signed=vault.signPhoenixOrder(grant);await submit(who,journal.readAttempt(signed.id,ownerAccountHash));return await advance(who,p.public.workflowId);
   }catch(error){const row=journal.readAttempt(reviewId,ownerAccountHash);if(row?.state==='PREPARED')journal.recoverUnsignedOrder(reviewId,ownerAccountHash);
    // An opening may already be final even if the subsequent commission step
    // fails. Never report that as a failed entry or encourage another order.
    if(row?.signature)return {...operation(who,p.public.workflowId),entryNeedsAttention:true};throw error;}
  });},
  async recoverEntry({ownerAccountHash,walletAddress,workflowId}){return exclusive(walletAddress,async()=>{const who={ownerAccountHash,walletAddress};flow(who,workflowId);return advance(who,workflowId);});},
  async status(who){owned(who);let closeAvailable=true,closeReason=null;try{gate(who);}catch(error){closeAvailable=false;closeReason=error.message?.startsWith('PHOENIX_SERVICE_')?error.message:'PHOENIX_SERVICE_CUSTODY';}
   return {stage:'PHOENIX_MANUAL_STATUS',walletAddress:who.walletAddress,venue:'phoenix',entryAvailable:PHOENIX_ENTRY_GATE===null,
   entryReason:PHOENIX_ENTRY_GATE,closeAvailable,closeReason,operations:journal.heldWorkflows(who.walletAddress).map(f=>operation(who,f.id))};},
  async prepareClose({ownerAccountHash,walletAddress,workflowId}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},state=gate(who),f=flow(who,workflowId);if(f.state!=='OPEN')fail('POSITION_NOT_OPEN');
   for(const [id,p]of reviews)if(p.public.expiresAt<=now())reviews.delete(id);if(reviews.size>=100)fail('BUSY');
   const review=await preparePhoenixCloseReview({walletAddress,symbol:f.symbol,isolatedSubaccountIndex:f.child,clientOrderId:(BigInt('0x'+randomBytes(16).toString('hex'))|1n).toString()},
    {publicClient,readAccount,readSlot:()=>rpcRequest('getSlot',[{commitment:'confirmed'}]),now});
   const native=await readPhoenixNativeMarket(review.plan,{...nativeOptions,exchangeKeys:await readExchangeKeys()});
   const wire=await buildPhoenixOrderWire(review,{client,exchangeKeys:native.exchangeKeys,...await latest(review.plan.observedSlot),now});
   const simulation=await simulatePhoenixOrder({wire,native,account:review.account},nativeOptions);
   if(gate(who).revision!==state.revision)fail('REVIEW_CHANGED');
   const id=freshId(),maximumLamports=(BigInt(simulation.networkFeeLamports)+BigInt(simulation.rentLockedLamports)+20000n).toString();
   const result=Object.freeze({stage:'PHOENIX_MANUAL_CLOSE_REVIEW',venue:'phoenix',walletAddress,workflowId:f.id,id,symbol:f.symbol,
    expiresAt:now()+15000,submitted:false,maxSlippageBps:50,closePercent:100,returnsToUsdc:true,withdrawalMayQueue:true,
    referencePrice:review.plan.referencePrice,priceLimitUsd:review.plan.priceLimitUsd,side:review.plan.side,baseLots:review.plan.baseLots,
    protocolCloseFeeUsdcUnits:simulation.protocolFeeUnits,maximumProtocolTakerFeeMicro:review.plan.market.feeMicro,
    estimatedReceivedCollateralUnits:simulation.postQuoteCollateralUnits,estimatesAreGuaranteed:false,
    platformCloseFeeUnits:'0',networkFeeLamports:simulation.networkFeeLamports,maximumNetworkAndRentLamports:maximumLamports,authorizationDurationMs:300000});
   reviews.set(id,{who,revision:state.revision,workflowId:f.id,review,wire,simulation,public:result});return result;
  });},
  async confirmClose({ownerAccountHash,walletAddress,id:reviewId,explicitApproval}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress};owned(who);const p=reviews.get(id(reviewId));
   if(!p||p.entry||p.who.ownerAccountHash!==ownerAccountHash||p.who.walletAddress!==walletAddress||p.public.expiresAt<=now()||explicitApproval!==true)fail('REVIEW_REQUIRED');
   if(gate(who).revision!==p.revision)fail('REVIEW_CHANGED');reviews.delete(reviewId);
   let claim;
   try{
    const fresh=await refreshPhoenixCloseReview(p.review,{publicClient,readAccount,readSlot:()=>rpcRequest('getSlot',[{commitment:'confirmed'}]),now});
    const native=await readPhoenixNativeMarket(fresh.plan,{...nativeOptions,exchangeKeys:await readExchangeKeys()});
    p.wire=await buildPhoenixOrderWire(fresh,{client,exchangeKeys:native.exchangeKeys,...await latest(fresh.plan.observedSlot),now});
    p.simulation=await simulatePhoenixOrder({wire:p.wire,native,account:fresh.account},nativeOptions);
    if(BigInt(p.simulation.networkFeeLamports)+BigInt(p.simulation.rentLockedLamports)>BigInt(p.public.maximumNetworkAndRentLamports))fail('COST_CHANGED');
    claim=journal.prepareOrder({id:reviewId,workflowId:p.workflowId,ownerAccountHash,controlRevision:p.revision,wire:p.wire,simulation:p.simulation,request:rpcRequest});
    journal.recordCloseConsent({id:reviewId,ownerAccountHash,maximumLamports:p.public.maximumNetworkAndRentLamports,expiresAt:now()+p.public.authorizationDurationMs,explicitApproval:true});
    const grant=authorizePhoenixOrderSigning({...who,journal,claim,wire:p.wire,simulation:p.simulation,request:rpcRequest,controls,backupRegistry,riskJournal,swapJournal,explicitApproval:true,assertUncontended:()=>gate(who,reviewId)});
    const signed=vault.signPhoenixOrder(grant);await submit(who,journal.readAttempt(signed.id,ownerAccountHash));
    return await advance(who,p.workflowId);
   }catch(error){
    const row=journal.readAttempt(reviewId,ownerAccountHash);
    if(row?.state==='PREPARED')journal.recoverUnsignedOrder(reviewId,ownerAccountHash);
    if(row&&['SIGNED','UNKNOWN'].includes(row.state))return {...operation(who,p.workflowId),requiresPolling:true};
    if(error.message==='PHOENIX_CLOSE_CHANGED')fail('REVIEW_CHANGED');throw error;
   }
  });},
  async recoverClose({ownerAccountHash,walletAddress,workflowId}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress};flow(who,workflowId);return advance(who,workflowId);
  });},
  // One-time isolated subaccount setup for the next entry. It is bound to the
  // exact order plan (market, side, margin, leverage) because the subaccount is
  // configured for that market. Explicit consent is required; the caller sends
  // nothing else and no order is created here.
  async setupAccount({ownerAccountHash,walletAddress,symbol,side,marginUsdcUnits,leverageTenths,explicitApproval}){return exclusive(walletAddress,async()=>{
   if(explicitApproval!==true)fail('CONSENT_REQUIRED');
   const who={ownerAccountHash,walletAddress},state=gate(who);
   if(typeof symbol!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(symbol)||!['LONG','SHORT'].includes(side)||typeof marginUsdcUnits!=='string'||
      !/^(0|[1-9][0-9]{0,19})$/.test(marginUsdcUnits)||!Number.isInteger(leverageTenths)||leverageTenths<11||leverageTenths>500)fail('INPUT');
   const account=await readAccount({walletAddress,subaccountIndices:Array.from({length:32},(_,i)=>i+1)});
   const held=new Set(journal.heldWorkflows(walletAddress).map(f=>f.child));
   const usable=a=>a.subaccountIndex>0&&!held.has(a.subaccountIndex)&&(!a.exists||(a.authorityIsWallet&&!a.hasSplineLiquidity&&!a.spotCollateralCount&&
    !a.hasLockedDeposit&&!a.withdrawalQueued&&!a.conditionalOrderCount&&a.quoteCollateralUnits==='0'&&
    a.positions.every(p=>p.baseLots==='0'&&p.virtualQuoteLots==='0')));
   const free=[...account.subaccounts].filter(usable).sort((a,b)=>a.subaccountIndex-b.subaccountIndex)[0];
   if(!free)fail('NO_SUBACCOUNT');
   const index=free.subaccountIndex,id=randomBytes(32).toString('hex');
   const review=await preparePhoenixOrderReview({walletAddress,symbol,side,marginUsdcUnits,leverageTenths,isolatedSubaccountIndex:index,
    clientOrderId:(BigInt('0x'+randomBytes(16).toString('hex'))|1n).toString()},{publicClient,readSlot:()=>rpcRequest('getSlot',[{commitment:'confirmed'}]),now});
   const native=await readPhoenixNativeMarket(review.plan,{...nativeOptions,exchangeKeys:await readExchangeKeys()});
   const setup=await buildPhoenixIsolatedSetup({plan:review.plan,native,account},{request:rpcRequest,now});
   const latest=await rpcRequest('getLatestBlockhash',[{commitment:'confirmed'}]);
   if(!latest?.value?.blockhash)fail('BLOCKHASH_UNAVAILABLE');
   const wire=buildPhoenixChildSetupWire(setup,{blockhash:latest.value.blockhash,lastValidBlockHeight:latest.value.lastValidBlockHeight});
   const simulation=await simulatePhoenixChildSetup(wire,{request:rpcRequest});
   try{
    const claim=journal.prepareChildSetup({id,ownerAccountHash,controlRevision:state.revision,wire,simulation,request:rpcRequest,
     maximumLamports:simulation.maximumLamports,expiresAt:now()+300000,explicitApproval:true});
    const grant=authorizePhoenixChildSetupSigning({ownerAccountHash,journal,claim,wire,simulation,request:rpcRequest,controls,backupRegistry,riskJournal,swapJournal,assertUncontended,now});
    const signed=vault.signPhoenixChildSetup(grant);
    inspectPhoenixChildSetupDispatch(grant,{journal,request:rpcRequest});
    journal.markChildSetupBroadcast(id,ownerAccountHash);
    const signature=await sendRequest('sendTransaction',[signed.serializedTxBase64,{encoding:'base64',maxRetries:0}]);
    return Object.freeze({stage:'PHOENIX_CHILD_SETUP_OPERATION',venue:'phoenix',id,walletAddress,subaccountIndex:index,
     traderAddress:setup.traderAddress,createsAccount:setup.createsAccount,signature,state:'UNKNOWN'});
   }catch(error){const row=journal.readChildSetup(id,ownerAccountHash);
    if(row?.state==='PREPARED')journal.recoverUnsignedChildSetup(id,ownerAccountHash);throw error;}
  });},
  // Advances a broadcast child setup to FINALIZED once the receipt verifies.
  async recoverChildSetup({ownerAccountHash,walletAddress,id}){return exclusive(walletAddress,async()=>{
   owned({ownerAccountHash,walletAddress});
   if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))fail('INPUT');
   const row=journal.readChildSetup(id,ownerAccountHash);
   if(!row||row.wallet!==walletAddress)fail('NOT_FOUND');
   if(['FINALIZED','CANCELLED'].includes(row.state))return {stage:'PHOENIX_CHILD_SETUP_OPERATION',state:row.state,signature:row.signature??null};
   if(row.state!=='UNKNOWN')fail('NOT_BROADCAST');
   const result=await journal.childSetupReceipt(id,ownerAccountHash,{request:rpcRequest,now});
   journal.recordFinalizedChildSetup(id,ownerAccountHash,result);
   return {stage:'PHOENIX_CHILD_SETUP_OPERATION',state:'FINALIZED',signature:result.signature,subaccountIndex:row.child};
  });},
  async positions(who){owned(who);const flows=journal.heldWorkflows(who.walletAddress).filter(f=>f.state==='OPEN');
   const account=await readAccount({walletAddress:who.walletAddress,subaccountIndices:flows.length?[...new Set(flows.map(f=>f.child))]:[1]});
   return {stage:'PHOENIX_MANUAL_POSITIONS',venue:'phoenix',walletAddress:who.walletAddress,observedSlot:account.observedSlot,cashUsdcUnits:account.usdc.amountUnits,
    items:flows.map(f=>({workflowId:f.id,symbol:f.symbol,subaccountIndex:f.child,trader:account.subaccounts.find(a=>a.subaccountIndex===f.child)??null}))};},
  async history(who){owned(who);const items=journal.workflows(who.ownerAccountHash,who.walletAddress).filter(f=>f.state==='COMPLETE').map(f=>{
   const rows=journal.workflowAttempts(f.id,who.ownerAccountHash),paid=rows.findLast(a=>a.kind==='UNWRAP'&&a.state==='FINALIZED'&&JSON.parse(a.receipt).state==='USDC_RECEIVED');
   return {workflowId:f.id,symbol:f.symbol,state:f.state,openedAt:f.created,closedAt:f.updated,marginUsdcUnits:f.margin,receivedUsdcUnits:paid?JSON.parse(paid.receipt).receivedUnits:null,
    platformFeeStatus:'NOT_YET_COMPOSED',netPnlUsdcUnits:null,signature:paid?.signature??null};});return {stage:'PHOENIX_MANUAL_HISTORY',venue:'phoenix',walletAddress:who.walletAddress,items};}
 });
}
