// One bounded automation cycle. No timers, provisioning or implicit transport.
// Production starts in observation mode; execute mode still requires the
// account's explicit stored activation, exact custody identity and every gate.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {requireFreshServerPerpsSignalFeed} from './perps-server-signal-feed.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {prepareInspectedServerAutomation} from './perps-server-preparation.js';
import {reservePreparedServerPerpsAutomation} from './perps-server-reservation.js';
import {authorizeServerPerpsSigning} from './perps-server-signing-authorization.js';
import {createServerPerpsBroadcaster} from './perps-server-broadcast.js';
import {reconcilePendingPerps} from './perps-pending-recovery.js';
import {readPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {reconcileClosedServerPerpsPositions} from './perps-position-closure.js';
function fail(){throw Error('PERPS_EXECUTOR_REVALIDATION_REQUIRED');}
function identity(signal){return JSON.stringify(['id','pair','side','entry','sl','tp1','createdAt','telegramMessageId','telegramSentAt'].map(k=>signal[k]));}
export function createServerPerpsExecutor({mode='observe',readFeed,readAccount,readFinalizedAccount,controls,journal,vault,rpcRequest,builderRequest,fetchImpl,maxSlippageBps=50,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(!['observe','execute'].includes(mode)||typeof readFeed!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'
  ||!Number.isSafeInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100)fail();
 let broadcast;
 if(mode==='execute'){
  if(typeof readAccount!=='function'||typeof readFinalizedAccount!=='function'||typeof controls?.read!=='function'||typeof controls?.pauseForRisk!=='function'||typeof journal?.readSignal!=='function'
   ||typeof journal?.pending!=='function'||typeof vault?.describe!=='function'||typeof vault?.signPrepared!=='function'||typeof rpcRequest!=='function'||typeof builderRequest!=='function')fail();
  broadcast=createServerPerpsBroadcaster({controls,journal,readAccount,fetchImpl});
 }
 const running=new Set();
 async function run({walletAddress,ownerAccountHash}={},reconcileOnly=false){
   const result=(stage,extra={})=>Object.freeze({stage,mode:reconcileOnly?'reconcile-only':mode,...extra});
   if(reconcileOnly&&mode!=='execute')fail();
   if(mode==='observe'){
    const feed=requireFreshServerPerpsSignalFeed(await readFeed());
    return result('OBSERVATION_ONLY',{remotePaused:feed.remotePaused,tradingEnabled:false,signals:Object.freeze(feed.candidates.map(s=>Object.freeze({id:s.id,pair:s.pair,side:s.side,score:s.score})))});
   }
   if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash))fail();
   if(running.has(walletAddress))return result('CYCLE_ALREADY_RUNNING',{tradingEnabled:false});
   running.add(walletAddress);let reservationId,signal;
   try{
    const original=controls.read({ownerAccountHash,walletAddress});
    const custody=vault.describe({ownerAccountHash,walletAddress});
    if(custody.exclusive!==true||custody.walletAddress!==walletAddress||custody.ownerAccountHash!==ownerAccountHash||custody.purpose!=='jamddmaj-perps-automation')fail();
    let pendingReview=false,positionReview=false,cleanupRequired=false;
    // Pausing stops NEW risk, not read-only reconciliation of already recorded
    // transactions. Otherwise a closed entry can keep consuming a slot while
    // paused, preventing the fresh risk check needed to reactivate automation.
    if(journal.pending(walletAddress).length){
     await reconcilePendingPerps(journal,walletAddress,{readReceipt:record=>readPerpsBroadcastReceipt(record,rpcRequest,{now})});
     pendingReview=journal.pending(walletAddress).length>0;
    }
    if(journal.openPositions(walletAddress).length){
     const recovery=await reconcileClosedServerPerpsPositions(journal,walletAddress,{request:rpcRequest,readFinalizedAccount,now});
     cleanupRequired=recovery.cleanupRequired>0;
     positionReview=!!(recovery.unresolved||recovery.legacyReview||recovery.deferred);
    }
    if(cleanupRequired)return result('EXIT_CLEANUP_REQUIRED',{tradingEnabled:false});
    if(pendingReview||positionReview)return result('RECONCILIATION_REQUIRED',{tradingEnabled:false});
    if(reconcileOnly)return result('RECONCILIATION_ONLY',{tradingEnabled:false});
    // A concurrent activation cannot turn an originally paused maintenance
    // cycle into an entry cycle. Only a later cycle may use that activation.
    if(original.enabled!==true||original.paused!==false)return result('AUTOMATION_INACTIVE',{tradingEnabled:false});
    const checkControls=()=>{
     const current=controls.read({ownerAccountHash,walletAddress});
     if(current.enabled!==true||current.paused!==false||current.revision!==original.revision)fail();return current;
    };
    checkControls();
    const account=requireFreshServerPerpsDailyAccount(await readAccount({walletAddress,ownerAccountHash}),{walletAddress,journal});
    const afterRisk=controls.pauseForRisk({walletAddress,expectedRevision:original.revision,dailyAccount:account});
    if(afterRisk.enabled!==true||afterRisk.paused!==false)return result('DAILY_LOSS_PAUSED',{tradingEnabled:false});
    checkControls();
    const first=requireFreshServerPerpsSignalFeed(await readFeed());
    if(first.remotePaused)return result('REMOTE_PAUSED',{tradingEnabled:false});
    signal=first.candidates.find(s=>!journal.readSignal(walletAddress,s.id));
    if(!signal)return result('NO_NEW_PUBLISHED_SIGNAL',{tradingEnabled:false});
    const expected=identity(signal);
    const refreshSignal=async()=>{
     checkControls();const feed=requireFreshServerPerpsSignalFeed(await readFeed()),current=feed.candidates.find(s=>s.id===signal.id),time=now();
     if(feed.remotePaused||!current||identity(current)!==expected||time-Date.parse(current.createdAt)>300000||time-Date.parse(current.telegramSentAt)>300000)fail();
     checkControls();
    };
    const input={walletAddress,settings:original.settings,signal,decision:signal.decision,enabled:true,paused:false,maxSlippageBps,now:now(),
     snapshot:{walletAddress,updatedAt:account.observedAt,availableUsd:Number(account.availableUsdcUnits)/1e6,allocatedUsd:Number(account.allocatedUsdcUnits)/1e6,
      lossTodayUsd:Number(account.lossTodayUsdcUnits)/1e6,openPositions:account.openPositions,tradesToday:account.tradesToday}};
    const prepared=await prepareInspectedServerAutomation(input,{rpcRequest,builderRequest,minimumSlot:account.observedSlot,nowSeconds:Math.floor(now()/1000),monotonicNow});
    await refreshSignal();reservationId=randomUUID();
    // Bind owner on every risk read, including the exclusive-custody overlay.
    const riskReader=args=>readAccount({...args,ownerAccountHash});
    const args={controls,journal,walletAddress,ownerAccountHash,signalId:signal.id,reservationId,controlRevision:original.revision,readAccount:riskReader,monotonicNow};
    await reservePreparedServerPerpsAutomation(prepared,{...args,readControls:async()=>checkControls()});
    await refreshSignal();journal.beginSigning(reservationId);
    const permission=await authorizeServerPerpsSigning(prepared,args),signed=vault.signPrepared(permission);
    await refreshSignal();
    const submission=await broadcast(signed,{ownerAccountHash,controlRevision:original.revision});
    return result(submission.stage,{signalId:signal.id,signature:submission.signature,reservationId,state:'UNCERTAIN',requiresChainReconciliation:true,readyForRetry:false});
   }catch{
    // Only a known unsigned reservation may be released. SIGNING/UNCERTAIN
    // survives any exception, pause, process crash or restart for reconciliation.
    if(reservationId)try{if(journal.read(reservationId)?.state==='RESERVED')journal.cancelUnsigned(reservationId);}catch{}
    let state;if(reservationId)try{state=journal.read(reservationId)?.state;}catch{state='RECONCILIATION_REQUIRED';}
    return result('EXECUTION_BLOCKED',{tradingEnabled:false,...signal?{signalId:signal.id}:{},...reservationId?{reservationId,state}:{}});
   }finally{running.delete(walletAddress);}
 }
 return Object.freeze({runOnce:args=>run(args),reconcileOnly:args=>run(args,true)});
}
