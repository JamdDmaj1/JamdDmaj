// Worker adapter for ALREADY RECORDED closes only. Never prepares an initial
// close from a signal, invents an owner review, or retries a signing/send claim.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {createNativePerpsCloseExecutor} from './perps-close-executor.js';
function fail(){throw Error('PERPS_WORKER_CLOSE_UNAVAILABLE');}
export function createServerPerpsCloseCoordinator({journal,controls,vault,backupRegistry,rpcRequest,readFinalizedAccount,fetchImpl,
 cleanupCoordinator,isExecutionRunning,maxSlippageBps=50,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePerpsExecutionJournal(journal);
 if(typeof controls?.read!=='function'||typeof vault?.describe!=='function'||typeof backupRegistry?.readVerified!=='function'
  ||typeof rpcRequest!=='function'||typeof readFinalizedAccount!=='function'||typeof isExecutionRunning!=='function'
  ||!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const executor=createNativePerpsCloseExecutor({journal,vault,fetchImpl,cleanupCoordinator}),running=new Set();
 return Object.freeze({async runOnce({walletAddress,ownerAccountHash}={}){
  const result=(stage,extra={})=>Object.freeze({stage,tradingEnabled:false,readyForRetry:false,...extra});
  if(isExecutionRunning()!==true)return result('AUTOMATED_CLOSE_EXECUTION_UNAVAILABLE');
  if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash))fail();
  if(running.has(walletAddress))return result('CYCLE_ALREADY_RUNNING');running.add(walletAddress);
  try{
   const control=controls.read({ownerAccountHash,walletAddress}),custody=vault.describe({ownerAccountHash,walletAddress});
   if(control.walletAddress!==walletAddress||custody.walletAddress!==walletAddress||custody.ownerAccountHash!==ownerAccountHash
    ||custody.exclusive!==true||custody.purpose!=='jamddmaj-perps-automation')fail();
   const rows=journal.pendingPositionCloses(walletAddress);if(!rows.length)return result('AUTOMATED_CLOSE_NOT_REQUIRED');
   // One financial close per cycle. A pending close blocks entries separately.
   const row=rows[0],execution=journal.readPositionCloseExecution(row.id);
   if(row.wallet!==walletAddress||row.state!=='PREPARED')fail();
   if(!execution)return result('AUTOMATED_CLOSE_OWNER_REVIEW_REQUIRED');
   const allowed=()=>isExecutionRunning()===true&&controls.read({ownerAccountHash,walletAddress}).revision===control.revision;
   const observed=await executor.runOnce(row.id,{mode:'execute',ownerAccountHash,walletAddress,controlRevision:control.revision,
    controls,backupRegistry,request:rpcRequest,readFinalizedAccount,isClosingAllowed:allowed,maxSlippageBps,now,monotonicNow});
   // Return only bounded phase information. The original executor/journal is
   // authoritative; no full wire, owner identity or private proof escapes here.
   return result('AUTOMATED_CLOSE_CYCLE',{closeStage:observed.stage,closeId:row.id});
  }finally{running.delete(walletAddress);}
 }});
}
