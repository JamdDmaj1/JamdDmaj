// Authenticated manual full close reuses the proven native two-leg executor.
// Initial close protects PRICE; finalized collateral is converted with a
// separately enforced on-chain USDC minimum. No absolute initial payout promise.
import {randomUUID} from 'node:crypto';
import {readServerPerpsAccount} from './perps-server-account.js';
import {prepareSimulatedServerPerpsFullClose} from './perps-server-close-preparation.js';
import {checkSimulatedPerpsCloseReturn} from './perps-close-return-policy.js';
import {describeNativePerpsCloseProtection,NATIVE_CLOSE_PROTECTION} from './perps-close-signing.js';
import {createNativePerpsCloseExecutor} from './perps-close-executor.js';
const fail=code=>{throw Error(code||'BOT_MANUAL_CLOSE_UNAVAILABLE');};
export function createBotManualClose({journal,vault,controls,backupRegistry,rpcRequest,builderRequest,fetchImpl,readFinalizedAccount,cleanupCoordinator,
 owned,assertCustody,exclusive,hasPendingSwap,isRunning,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if([rpcRequest,builderRequest,fetchImpl,readFinalizedAccount,owned,assertCustody,exclusive,hasPendingSwap,isRunning].some(v=>typeof v!=='function'))fail();
 const executor=createNativePerpsCloseExecutor({journal,vault,fetchImpl,...cleanupCoordinator?{cleanupCoordinator}:{}}),reviews=new Map();
 function gate(who,revision){
  const state=owned(who);assertCustody(who);
  if(!isRunning()||state.enabled!==false||state.paused!==true)fail('BOT_MANUAL_PAUSE_REQUIRED');
  if(revision!==undefined&&state.revision!==revision)fail('BOT_MANUAL_REVIEW_CHANGED');
  if(hasPendingSwap(who.walletAddress)||journal.pending(who.walletAddress).length||journal.pendingExitCancellations(who.walletAddress).length
   ||journal.pendingPlatformFeePayments(who.walletAddress).length)fail('BOT_MANUAL_PENDING');
  return state;
 }
 function result(who,id){
  owned(who);const row=journal.readPositionClose(id);
  if(!row||row.wallet!==who.walletAddress||!id.startsWith('manual-close:'))fail('BOT_MANUAL_NOT_FOUND');
  const execution=journal.readPositionCloseExecution(id),conversion=journal.readPositionCloseConversion(id);
  return {walletAddress:who.walletAddress,id,positionAddress:row.position,state:row.state,
   phase:conversion?.state?('CONVERSION_'+conversion.state):execution?.state||'REVIEW_REQUIRED',
   signature:conversion?.signature||execution?.signature||null,readyForRetry:false};
 }
 return Object.freeze({
  async positions(who){
   const state=owned(who);assertCustody(who);
   const account=await readServerPerpsAccount({walletAddress:who.walletAddress},{request:rpcRequest,now,monotonicNow});owned(who);assertCustody(who);
   const tracked=new Set(journal.openPositions(who.walletAddress).map(row=>row.position_address));
   return {stage:'BOT_MANUAL_POSITIONS',walletAddress:who.walletAddress,paused:state.paused,observedAt:account.observedAt,
    positions:account.positions.map(p=>({address:p.address,asset:p.asset,side:p.side,sizeUsdUnits:p.sizeUsdUnits,collateralUsdUnits:p.collateralUsdUnits,tracked:tracked.has(p.address)})),
    closes:journal.pendingPositionCloses(who.walletAddress).filter(row=>row.id.startsWith('manual-close:')).map(row=>result(who,row.id))};
  },
  history(who){
   owned(who);assertCustody(who);
   const history=journal.finalizedPositionCloseHistory(who.walletAddress);
   const items=history.snapshots.map(({close,execution,conversion,completion})=>{
    if(close.wallet!==who.walletAddress)fail('BOT_MANUAL_OWNERSHIP_REQUIRED');
    const s=JSON.parse(close.settlement),p=JSON.parse(execution.payout_json);
    const converted=conversion?.state==='FINALIZED'?JSON.parse(conversion.receipt_json):null;
    const final=completion?JSON.parse(completion.record_json):null;
    const receivedUsdcUnits=final?.receivedUsdcUnits??converted?.receivedUsdcUnits??(p.receiveAsset==='USDC'?p.receivedTokenUnits:null);
    // lossTodayUsdUnits is account-wide, NEVER this order's PnL. Historical
    // returned funds are not profit; opening costs are not fully projected.
    return {id:close.id,positionAddress:close.position,asset:s.asset,side:s.side,
     openedAt:Number(s.positionOpenTimeSeconds)*1000,closedAt:p.blockTime*1000,
     state:close.state==='COMPLETED'?'COMPLETED':'CLOSED_PENDING_ACCOUNTING',
     receivedUsdcUnits,netPnlUsdcUnits:null,firstLegNetworkFeeLamports:p.networkFeeLamports,
     firstLegSignature:execution.signature,conversionSignature:converted?.signature??null};
   });
   owned(who);return {stage:'BOT_MANUAL_CLOSED_HISTORY',walletAddress:who.walletAddress,items,hasMore:history.hasMore};
  },
  async prepare({ownerAccountHash,walletAddress,positionAddress,referencePrice}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},state=gate(who);
   if(journal.pendingPositionCloses(walletAddress).length)fail('BOT_MANUAL_PENDING');
   if(!journal.openPositions(walletAddress).some(row=>row.position_address===positionAddress))fail('BOT_MANUAL_POSITION_UNTRACKED');
   for(const [id,r]of reviews)if(now()>=r.review.expiresAt)reviews.delete(id);
   if(reviews.size>=100)fail('BOT_MANUAL_BUSY');
   const at=now(),prepared=await prepareSimulatedServerPerpsFullClose({walletAddress,positionAddress,referencePrice,maxSlippageBps:50,settlement:'COLLATERAL_THEN_USDC'},
    {request:rpcRequest,fetchImpl:builderRequest,now,monotonicNow});gate(who,state.revision);
   const returnPolicy=checkSimulatedPerpsCloseReturn(prepared.oracleEffects,{minimumReturnUnits:'0',maximumNetworkFeeLamports:prepared.funding.networkFeeLamports});
   const protection=describeNativePerpsCloseProtection(prepared.oracleEffects,returnPolicy),id='manual-close:'+randomUUID();
   const review=Object.freeze({stage:'BOT_MANUAL_CLOSE_REVIEW',id,walletAddress,positionAddress,referencePrice,
    asset:prepared.plan.asset,side:prepared.plan.side,expiresAt:at+15000,controlRevision:state.revision,protection,submitted:false});
   if(now()>=review.expiresAt)fail('BOT_MANUAL_REVIEW_REQUIRED');reviews.set(id,{who,prepared,returnPolicy,review});return review;
  });},
  async confirm({ownerAccountHash,walletAddress,id,explicitApproval}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},p=reviews.get(id);owned(who);
   if(!p||p.who.ownerAccountHash!==ownerAccountHash||p.who.walletAddress!==walletAddress||explicitApproval!==true||now()>=p.review.expiresAt)fail('BOT_MANUAL_REVIEW_REQUIRED');
   reviews.delete(id);gate(who,p.review.controlRevision);
   if(journal.pendingPositionCloses(walletAddress).length)fail('BOT_MANUAL_PENDING');
   journal.preparePositionClose(id,p.prepared.oracleEffects,{returnPolicy:p.returnPolicy});
   try{
    await executor.execute(p.prepared.oracleEffects,{ownerAccountHash,walletAddress,closeId:id,controlRevision:p.review.controlRevision,
     controls,backupRegistry,request:rpcRequest,readFinalizedAccount,isClosingAllowed:()=>{try{gate(who,p.review.controlRevision);return true;}catch{return false;}},
     returnPolicy:p.returnPolicy,settlementProtection:NATIVE_CLOSE_PROTECTION,maxSlippageBps:50,now,monotonicNow});
   }catch(error){
    if(!journal.readPositionCloseExecution(id)){journal.cancelPreparedPositionClose(id);throw error;}
    // A durable signing/send attempt is held for reconciliation, never retried.
   }
   return result(who,id);
  });},
  async recover({ownerAccountHash,walletAddress,id}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},original=result(who,id);
   if(['CANCELLED','COMPLETED'].includes(original.state))return original;
   await executor.runOnce(id,{mode:'maintenance',request:rpcRequest,readFinalizedAccount,maxSlippageBps:50,now,monotonicNow});
   return result(who,id);
  });}
 });
}
