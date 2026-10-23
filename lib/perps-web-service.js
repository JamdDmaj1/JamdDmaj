// Single-host manual web composition. NO custody vault, seed or server signer.
// Existing reviewed databases only; financial execution is separately opt-in.
import {join} from 'node:path';
import {existsSync,unlinkSync,lstatSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write,syncPrivateRecoveryDirectory as sync} from './perps-recovery-private-files.js';
import {inspectExistingPerpsRuntimeDatabases} from './perps-runtime-recovery.js';
import {openPerpsAutomationControls} from './perps-automation-controls.js';
import {openPerpsExecutionJournal} from './perps-execution-journal.js';
import {openWebPerpsSubmissionJournal} from './perps-web-submission-journal.js';
import {openManualPerpsPolicyStore} from './perps-manual-policy-store.js';
import {openWebPerpsReviewDb} from './perps-web-review-db.js';
import {createOwnerBoundWebPerpsReviewStore} from './perps-web-review-store.js';
import {createPerpsServiceAuthenticator} from './perps-service-auth.js';
import {createServerPerpsReadOnlyRpc} from './perps-server-rpc.js';
import {createServerPerpsDailyAccountReader} from './perps-server-daily-account.js';
import {createPerpsNetworkFeeValuationReader} from './perps-network-fee-valuation.js';
import {createPerpsConversionUsdValuationReader} from './perps-conversion-usd-valuation.js';
import {createManualPerpsPolicyHandler} from './perps-manual-policy-http.js';
import {createWebPerpsPreparationHandler} from './perps-web-preparation-http.js';
import {createWebPerpsSubmissionHandler} from './perps-web-submission-http.js';
import {createWebPerpsOperationStatusHandler} from './perps-web-operation-status-http.js';
import {createWebPerpsRecoveryWorker} from './perps-web-recovery-worker.js';
import {createPerpsControlHttpServer} from './perps-control-http.js';
function fail(){throw Error('WEB_PERPS_SERVICE_UNAVAILABLE');}
export function openWebPerpsService({directory,controlsDirectory,lockDirectory,executionApproved=false,fetchImpl=globalThis.fetch,rpcUrl,now=Date.now,
 monotonicNow=()=>performance.now(),wait,allowNonPosixForTests=false}={}){
 if(typeof executionApproved!=='boolean'||typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 directory=check(directory,true,allowNonPosixForTests).path;controlsDirectory=check(controlsDirectory,true,allowNonPosixForTests).path;
 lockDirectory=check(lockDirectory,true,allowNonPosixForTests).path;
 const paths={controls:join(controlsDirectory,'controls.sqlite'),risk:join(directory,'journal.sqlite'),web:join(directory,'web-submissions.sqlite'),policy:join(directory,'manual-policy.sqlite'),reviews:join(directory,'web-reviews.sqlite')};
 const seen=new Set();for(const path of Object.values(paths)){
  check(path,false,allowNonPosixForTests);const stat=lstatSync(path,{bigint:true}),id=stat.dev+':'+stat.ino;if(seen.has(id))fail();seen.add(id);
  for(const suffix of ['-wal','-shm'])if(existsSync(path+suffix))check(path+suffix,false,allowNonPosixForTests);
 }
 inspectExistingPerpsRuntimeDatabases({controlsPath:paths.controls,journalPath:paths.risk,allowNonPosixForTests});
 const lockFile=join(lockDirectory,'web-service.lock');write(lockFile,JSON.stringify({pid:process.pid,instance:randomUUID()}),allowNonPosixForTests);const lease=lstatSync(lockFile,{bigint:true});
 const stores=[],requests=new Set(),abort=new AbortController();let closed=false,closing=null,active=null,handlers,statusHandler,worker;
 const available=()=>executionApproved&&!closed&&active!==null;
 function release(){let failed=false;for(const store of stores.reverse())try{store.close();}catch{failed=true;}
  try{const current=lstatSync(lockFile,{bigint:true});if(current.dev!==lease.dev||current.ino!==lease.ino)fail();unlinkSync(lockFile);sync(lockDirectory);}catch{failed=true;}if(failed)fail();}
 try{
  const controls=openPerpsAutomationControls(paths.controls,{now,monotonicNow});stores.push(controls);
  const riskJournal=openPerpsExecutionJournal(paths.risk,{now});stores.push(riskJournal);
  const journal=openWebPerpsSubmissionJournal({filename:paths.web,now,requireExisting:true});stores.push(journal);
  const policyStore=openManualPerpsPolicyStore(paths.policy,{now,allowNonPosixForTests});stores.push(policyStore);
  const reviews=openWebPerpsReviewDb(paths.reviews,{now,allowNonPosixForTests});stores.push(reviews);
  const authenticate=createPerpsServiceAuthenticator({fetchImpl,now});
  const limit=args=>{if(closed)fail();return controls.consumeRequestQuota(args);};
  const reviewStoreForOwner=({ownerAccountHash})=>createOwnerBoundWebPerpsReviewStore({ownerAccountHash,command:reviews.command,now});
  const rpcRequest=createServerPerpsReadOnlyRpc({url:rpcUrl,fetchImpl});
  const readAccount=createServerPerpsDailyAccountReader({request:rpcRequest,journal:riskJournal,now,monotonicNow,
   readNetworkFees:createPerpsNetworkFeeValuationReader({fetchImpl,now,monotonicNow}),readConversionLoss:createPerpsConversionUsdValuationReader({fetchImpl,now,monotonicNow})});
  handlers={
   '/api/perps-manual-policy':createManualPerpsPolicyHandler({store:policyStore,authenticate,limit,isExecutionAvailable:available,isOpen:()=>!closed}),
   '/api/perps-signing-review':createWebPerpsPreparationHandler({policyStore,authenticate,limit,reviewStoreForOwner,rpcRequest,builderRequest:fetchImpl,isExecutionAvailable:available,now,monotonicNow}),
   '/api/perps-submit':createWebPerpsSubmissionHandler({journal,riskJournal,authenticate,limit,reviewStoreForOwner,rpcRequest,fetchImpl,readAccount,
    readLimits:who=>{if(closed)fail();return policyStore.readLimits(who);},isExecutionAvailable:available,now,monotonicNow})
  };
  const statusQuota=createHash('sha256').update('web-manual-status-global-v1').digest('hex');
  statusHandler=createWebPerpsOperationStatusHandler({journal,riskJournal,limit:()=>{if(limit({ownerAccountHash:statusQuota})!==true)fail();}});
  worker=createWebPerpsRecoveryWorker({policyStore,journal,riskJournal,rpcRequest,readAccount,now,monotonicNow,...wait?{wait}:{}});
 }catch{try{release();}catch{}fail();}
 function tracked(handler,request){
  if(closed)return Promise.resolve(Response.json({error:'WEB_SERVICE_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}}));
  const promise=Promise.resolve().then(()=>handler(request));requests.add(promise);promise.finally(()=>requests.delete(promise)).catch(()=>{});return promise;
 }
 return Object.freeze({
  manualHandlers:Object.freeze(Object.fromEntries(Object.entries(handlers).map(([path,handler])=>[path,request=>tracked(handler,request)]))),
  statusHandler:request=>tracked(statusHandler,request),
  executionAvailable:available,
  run({once=false}={}){if(closed||typeof once!=='boolean')fail();if(active)return active;active=worker.run({once,signal:abort.signal}).finally(()=>{active=null;});return active;},
  close(){if(closing)return closing;closed=true;abort.abort();closing=(async()=>{try{await Promise.allSettled([...requests]);if(active)await active;}finally{release();}})();return closing;}
 });
}
export function startWebPerpsHttpBoundary(service,{port=8789,trustLoopbackProxy=false}={}){
 if(!Number.isSafeInteger(port)||port<1024||port>65535||!service?.manualHandlers||typeof service?.statusHandler!=='function')fail();
 const server=createPerpsControlHttpServer({handler:async()=>Response.json({error:'NOT_FOUND'},{status:404}),manualHandlers:service.manualHandlers,webOperationStatusHandler:service.statusHandler,trustLoopbackProxy});
 let closing;server.listen(port,'127.0.0.1');return Object.freeze({server,close:()=>closing??=new Promise((resolve,reject)=>{
  server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(Error('WEB_HTTP_SHUTDOWN_FAILED')):resolve());server.closeIdleConnections();
 })});
}
