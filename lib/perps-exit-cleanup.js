// Bounded orphan-only coordinator. Observation/maintenance cannot use financial
// capabilities. Each execution cycle handles at most one recorded exit request.
import {randomUUID} from 'node:crypto';
import {readServerPerpsExitCleanup,requireVerifiedServerPerpsExitCleanup} from './perps-position-closure.js';
import {inspectServerPerpsExitCancellation} from './perps-exit-cancellation.js';
import {simulateServerPerpsExitCancellation} from './perps-exit-cancellation-simulation.js';
import {authorizeServerPerpsExitCancellation} from './perps-exit-cancellation-signing.js';
import {createServerPerpsExitCancellationBroadcaster} from './perps-exit-cancellation-broadcast.js';
import {reconcilePendingPerpsExitCancellations} from './perps-exit-cancellation-recovery.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
function fail(){throw Error('PERPS_EXIT_CLEANUP_NOT_AUTHORIZED');}
async function prepare(cleanup,exitAddress,fetchImpl){
 requireVerifiedServerPerpsExitCleanup(cleanup);
 if(!cleanup.pendingExits.some(exit=>exit.address===exitAddress))fail();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader;
 try{
  const response=await fetchImpl('https://perps-api.jup.ag/v2/tpsl',{method:'DELETE',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({positionRequestPubkey:exitAddress})});
  if(response?.status!==200||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
  const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>8192))fail();
  reader=response.body.getReader();const chunks=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8192)fail();chunks.push(Buffer.from(part.value));}
  if(controller.signal.aborted)fail();const body=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
  if(body?.requireKeeperSignature!==true||body.transactionType!==undefined&&!['legacy','v0'].includes(body.transactionType)
   ||body.positionRequestPubkey!==undefined&&body.positionRequestPubkey!==exitAddress||body.positionPubkey!==undefined&&body.positionPubkey!==cleanup.positionAddress)fail();
  requireVerifiedServerPerpsExitCleanup(cleanup);return body;
 }catch{fail();}finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
}
export function createServerPerpsExitCleanupCoordinator({controls,journal,vault,backupRegistry,rpcRequest,readFinalizedAccount,readAccount,
 builderRequest,fetchImpl,isExecutionRunning,now=Date.now,monotonicNow=()=>performance.now(),limit=20}={}){
 if(typeof controls?.read!=='function'||typeof journal?.pending!=='function'||typeof journal?.pendingExitCancellations!=='function'||typeof journal?.openPositions!=='function'
  ||typeof journal?.beginExitCancellation!=='function'||typeof journal?.cancelPreparedExitCancellation!=='function'||typeof vault?.describe!=='function'||typeof vault?.signExitCancellation!=='function'
  ||typeof backupRegistry?.readVerified!=='function'||typeof rpcRequest!=='function'||typeof readFinalizedAccount!=='function'||typeof readAccount!=='function'
  ||typeof builderRequest!=='function'||typeof isExecutionRunning!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>20)fail();
 const broadcast=createServerPerpsExitCancellationBroadcaster({journal,fetchImpl}),running=new Set();
 return Object.freeze({async runOnce({ownerAccountHash,walletAddress}={}){
  const result=(stage,extra={})=>Object.freeze({stage,tradingEnabled:false,...extra});
  if(isExecutionRunning()!==true)return result('EXIT_CLEANUP_REQUIRED');
  if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash))fail();
  if(running.has(walletAddress))return result('CYCLE_ALREADY_RUNNING');running.add(walletAddress);let cancellationId;
  try{
   const original=controls.read({ownerAccountHash,walletAddress}),identity=vault.describe({ownerAccountHash,walletAddress});
   if(identity.exclusive!==true||identity.walletAddress!==walletAddress||identity.ownerAccountHash!==ownerAccountHash||identity.purpose!=='jamddmaj-perps-automation')fail();
   await reconcilePendingPerpsExitCancellations(journal,walletAddress,{request:rpcRequest,now});
   if(journal.pending(walletAddress).length||journal.pendingExitCancellations(walletAddress).length)return result('RECONCILIATION_REQUIRED');
   function check(){
    if(isExecutionRunning()!==true)fail();const current=controls.read({ownerAccountHash,walletAddress});
    if(current.walletAddress!==walletAddress||current.revision!==original.revision||typeof current.enabled!=='boolean'||current.paused!==!current.enabled||journal.pending(walletAddress).length)fail();
    const pending=journal.pendingExitCancellations(walletAddress);if(pending.some(row=>row.id!==cancellationId))fail();
    requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified({ownerAccountHash,walletAddress}),{ownerAccountHash,walletAddress});
   }
   check();const rows=journal.openPositions(walletAddress);if(rows.length>limit)return result('RECONCILIATION_REQUIRED');let cleanup;
   for(const row of rows){cleanup=await readServerPerpsExitCleanup(row,{request:rpcRequest,readFinalizedAccount,now});if(cleanup)break;}
   if(!cleanup)return result('RECONCILIATION_REQUIRED');check();
   const exitAddress=cleanup.pendingExits[0].address,preparation=await prepare(cleanup,exitAddress,builderRequest);check();
   const inspection=await inspectServerPerpsExitCancellation(preparation,cleanup,{exitAddress,request:rpcRequest});
   if(preparation.transactionType!==undefined&&preparation.transactionType!==(inspection.envelope.version===-1?'legacy':'v0'))fail();
   const simulation=await simulateServerPerpsExitCancellation(inspection,{request:rpcRequest,monotonicNow});check();
   cancellationId=randomUUID();journal.beginExitCancellation(cancellationId,simulation);check();
   const grant=await authorizeServerPerpsExitCancellation(simulation,{controls,journal,backupRegistry,readAccount,request:rpcRequest,isExecutionRunning,
    ownerAccountHash,walletAddress,cancellationId,controlRevision:original.revision,monotonicNow});
   const signed=vault.signExitCancellation(grant),sent=await broadcast(signed,{ownerAccountHash,controlRevision:original.revision});
   return result(sent.stage,{cancellationId,signature:sent.signature,state:'UNCERTAIN',requiresChainReconciliation:true,readyForRetry:false});
  }catch{
   // PREPARED never issued a grant and is safe to discard. SIGNING/UNCERTAIN
   // may already have used a key or reached the service and must stay held.
   if(cancellationId)try{if(journal.readExitCancellation(cancellationId)?.state==='PREPARED')journal.cancelPreparedExitCancellation(cancellationId);}catch{}
   let state;if(cancellationId)try{state=journal.readExitCancellation(cancellationId)?.state;}catch{state='RECONCILIATION_REQUIRED';}
   return result('EXIT_CLEANUP_BLOCKED',{...cancellationId?{cancellationId,state}:{}});
  }finally{running.delete(walletAddress);}
 }});
}
