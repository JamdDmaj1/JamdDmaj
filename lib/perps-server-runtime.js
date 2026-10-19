// Single-host durable worker composition. Startup never creates custody keys,
// wallets or databases and never activates an account. Maintenance is default.
import {existsSync,renameSync,unlinkSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write,syncPrivateRecoveryDirectory as sync} from './perps-recovery-private-files.js';
import {openPerpsAutomationControls} from './perps-automation-controls.js';
import {openPerpsExecutionJournal} from './perps-execution-journal.js';
import {openPerpsCustodyVault} from './perps-custody-vault.js';
import {openPerpsBackupRegistry} from './perps-backup-registry.js';
import {createServerPerpsReadOnlyRpc} from './perps-server-rpc.js';
import {readServerPerpsSignalFeed} from './perps-server-signal-feed.js';
import {createServerPerpsDailyAccountReader,createServerPerpsCustodyRiskReader} from './perps-server-daily-account.js';
import {createServerPerpsExecutor} from './perps-server-executor.js';
import {createServerPerpsWorker} from './perps-server-worker.js';
import {inspectExistingPerpsRuntimeDatabases} from './perps-runtime-recovery.js';
import {createServerPerpsActivationAuthorizer} from './perps-server-activation.js';
import {createPerpsAutomationApi} from './perps-automation-api.js';
import {createPerpsServiceAuthenticator} from './perps-service-auth.js';
import {createPerpsControlHttpServer} from './perps-control-http.js';
import {createBoundedPerpsCustodyProvisioner} from './perps-custody-provisioning.js';
import {PERPS_RUNTIME_INITIALIZATION_MARKER} from './perps-runtime-initialization.js';
function fail(){throw Error('PERPS_RUNTIME_UNAVAILABLE');}
function blocked(){throw Error('PERPS_RUNTIME_MAINTENANCE_ONLY');}
export function startServerPerpsControlBoundary(runtime,{port=8788,trustLoopbackProxy=false}={}){
 if(typeof runtime?.handleControlRequest!=='function'||typeof runtime?.capabilities!=='function'||!Number.isSafeInteger(port)||port<1024||port>65535)fail();
 const server=createPerpsControlHttpServer({handler:request=>runtime.handleControlRequest(request),readCapabilities:()=>runtime.capabilities(),trustLoopbackProxy});
 let closing;server.listen(port,'127.0.0.1');
 return Object.freeze({server,close:()=>closing??=new Promise((done,reject)=>{
  server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(Error('PERPS_RUNTIME_UNAVAILABLE')):done());server.closeIdleConnections();
 })});
}
export function perpsWorkerEnvironment(env){
 // systemd DynamicUser exposes this service's StateDirectory through a
 // root-owned compatibility symlink. Select only its known canonical private
 // target; do not relax filesystem validation or resolve arbitrary symlinks.
 const directory=env.JAMDDMAJ_PERPS_RUNTIME_DIRECTORY||(env.STATE_DIRECTORY==='/var/lib/jamddmaj-perps-runtime'
  ?'/var/lib/private/jamddmaj-perps-runtime':env.STATE_DIRECTORY);
 const mode=env.JAMDDMAJ_PERPS_WORKER_MODE||'maintenance';
 const pollMs=Number(env.JAMDDMAJ_PERPS_WORKER_POLL_MS??15000),batchSize=Number(env.JAMDDMAJ_PERPS_WORKER_BATCH_SIZE??20);
 if(typeof directory!=='string'||!directory||!['maintenance','execute'].includes(mode)
  ||!Number.isSafeInteger(pollMs)||pollMs<1000||pollMs>60000||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>50
  ||env.JAMDDMAJ_PERPS_EXECUTION_APPROVED!==undefined&&!['true','false'].includes(env.JAMDDMAJ_PERPS_EXECUTION_APPROVED))fail();
 return {directory,controlsDirectory:env.JAMDDMAJ_PERPS_CONTROLS_DIRECTORY,lockDirectory:env.RUNTIME_DIRECTORY,mode,pollMs,batchSize,explicitExecutionApproval:env.JAMDDMAJ_PERPS_EXECUTION_APPROVED==='true',
  feedToken:env.JAMDDMAJ_CLIENT_FEED_TOKEN,rpcUrl:env.JAMDDMAJ_PERPS_RPC_URL};
}
export function openServerPerpsRuntime({directory,controlsDirectory,lockDirectory,mode='maintenance',explicitExecutionApproval=false,feedToken,rpcUrl,
 pollMs=15000,batchSize=20,custodyProvisioning=false,custodyWalletLimit=20,fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now(),wait,
 allowNonPosixForTests=false}={}){
 if(process.platform==='win32'&&!allowNonPosixForTests||!['maintenance','execute'].includes(mode)||typeof explicitExecutionApproval!=='boolean'||typeof custodyProvisioning!=='boolean'
  ||mode==='execute'&&(explicitExecutionApproval!==true||typeof feedToken!=='string'||feedToken.length<16||feedToken.length>4096||/[\x00-\x20\x7f]/.test(feedToken))
  ||typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 // Existing private canonical stores only. Supplying an empty folder must not
 // silently manufacture a new financial identity or lose the previous journal.
 directory=check(directory,true,allowNonPosixForTests).path;
 if(existsSync(join(directory,PERPS_RUNTIME_INITIALIZATION_MARKER)))fail();
 lockDirectory=lockDirectory===undefined?directory:check(lockDirectory,true,allowNonPosixForTests).path;
 // Reuse the existing reviewed controls in place during cutover. The operator
 // may supply a private directory, never arbitrary SQL or a client-selected
 // file. Its database must pass the same no-migration schema preflight.
 const controlRoot=controlsDirectory===undefined?directory:check(controlsDirectory,true,allowNonPosixForTests).path;
 const paths={controls:join(controlRoot,'controls.sqlite'),journal:join(directory,'journal.sqlite'),backup:join(directory,'backup.sqlite')};
 const wallets=join(directory,'wallets'),keyFile=join(directory,'keys','master.key');
 check(wallets,true,allowNonPosixForTests);check(join(directory,'keys'),true,allowNonPosixForTests);
 const stores=[keyFile,...Object.values(paths)],seen=new Set();
 for(const path of stores){
  check(path,false,allowNonPosixForTests);
  // NTFS inode identifiers can exceed Number's exact integer range. Compare
  // their full integer identities, not rounded values that may falsely alias.
  const stat=lstatSync(path,{bigint:true}),id=stat.dev+':'+stat.ino;
  if(seen.has(id))fail();seen.add(id);
  if(path.endsWith('.sqlite'))for(const suffix of ['-wal','-shm'])if(existsSync(path+suffix))check(path+suffix,false,allowNonPosixForTests);
 }
 const statusFile=join(directory,'worker-status.json'),lockFile=join(lockDirectory,'worker.lock');
 if(existsSync(statusFile))check(statusFile,false,allowNonPosixForTests);
 // An abandoned lock is NOT a license to replay or replace an uncertain order.
 // A persistent abandoned lock requires review; no age-based lock stealing.
 // systemd may instead own a private RuntimeDirectory, removed on unit stop so
 // crash restarts resume the durable journal without retaining an obsolete PID.
 write(lockFile,JSON.stringify({version:1,pid:process.pid,instance:randomUUID()}),allowNonPosixForTests);
 const lock=check(lockFile,false,allowNonPosixForTests).stat;
 let controls,journal,backupRegistry,worker,api,active=null,closed=false,closing=null;
 const requests=new Set(),executionRunning=()=>mode==='execute'&&!closed&&active!==null;
 const abort=new AbortController();
 function sameLock(){const current=check(lockFile,false,allowNonPosixForTests).stat;if(current.dev!==lock.dev||current.ino!==lock.ino)fail();}
 function saveStatus(report){
  sameLock();check(directory,true,allowNonPosixForTests);
  if(existsSync(statusFile))check(statusFile,false,allowNonPosixForTests);
  const temporary=join(directory,'.worker-status-'+randomUUID()+'.tmp');
  write(temporary,JSON.stringify(report),allowNonPosixForTests);
  try{renameSync(temporary,statusFile);sync(directory);}catch{try{unlinkSync(temporary);}catch{}fail();}
 }
 function release(){
  let error;
  for(const store of [backupRegistry,journal,controls])try{store?.close();}catch{error=true;}
  try{sameLock();unlinkSync(lockFile);sync(lockDirectory);}catch{error=true;}
  if(error)fail();
 }
 try{
  inspectExistingPerpsRuntimeDatabases({controlsPath:paths.controls,journalPath:paths.journal,allowNonPosixForTests});
  let authorizeActivation=blocked;
  controls=openPerpsAutomationControls(paths.controls,{now,monotonicNow,authorizeActivation:input=>authorizeActivation(input)});
  journal=openPerpsExecutionJournal(paths.journal,{now});
  backupRegistry=openPerpsBackupRegistry(paths.backup,{now,monotonicNow,allowNonPosixForTests});
  const vault=openPerpsCustodyVault({directory:wallets,keyFile,allowNonPosixForTests});
  const rpcRequest=createServerPerpsReadOnlyRpc({url:rpcUrl,fetchImpl});
  const readFinalizedAccount=createServerPerpsDailyAccountReader({request:rpcRequest,now,monotonicNow});
  const readAccount=createServerPerpsCustodyRiskReader({request:rpcRequest,journal,verifyExclusiveCustody:identity=>vault.describe(identity),now,monotonicNow});
  authorizeActivation=createServerPerpsActivationAuthorizer({controls,vault,backupRegistry,journal,readAccount,isExecutionRunning:executionRunning});
  const executor=createServerPerpsExecutor({mode:'execute',controls,journal,backupRegistry,rpcRequest,readFinalizedAccount,
   vault:mode==='execute'?vault:Object.freeze({describe:identity=>vault.describe(identity),signPrepared:blocked}),
   readAccount:mode==='execute'?readAccount:blocked,
   readFeed:mode==='execute'?()=>readServerPerpsSignalFeed({feedToken},{fetchImpl,now,monotonicNow}):blocked,
   builderRequest:mode==='execute'?fetchImpl:blocked,fetchImpl:mode==='execute'?fetchImpl:blocked,now,monotonicNow});
  worker=createServerPerpsWorker({mode,controls,executor,pollMs,batchSize,now,saveStatus,...wait?{wait}:{}});
  // Same durable controls as the worker, verified through the existing fixed
  // production session ledger. No second state directory or public readiness.
  const apiControls=Object.fromEntries(['read','readForOwner','save','pause','issueActivationChallenge','activate'].map(name=>[name,args=>{
   if(closed)fail();return controls[name](args);
  }]));
  // Setup and execution are independent. An authenticated, consented request
  // may create a paused exclusive wallet; it cannot manufacture backup proof,
  // import the main wallet or activate the worker. Closed runtimes cannot write.
  const provisioner=custodyProvisioning?createBoundedPerpsCustodyProvisioner({directory:wallets,vault,controls,maximumWalletFiles:custodyWalletLimit,allowNonPosixForTests}):null;
  api=createPerpsAutomationApi({controls:apiControls,authenticate:createPerpsServiceAuthenticator({fetchImpl,now}),
   provisionCustody:provisioner?input=>{if(closed)fail();return provisioner.provision(input);}:null,rateLimit:args=>{
   if(closed)fail();return controls.consumeRequestQuota(args);
  }});
 }catch{
  try{release();}catch{}fail();
 }
 return Object.freeze({
  handleControlRequest(request){
   if(closed)return Promise.resolve(new Response(JSON.stringify({error:{code:'controls-unavailable'}}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
   const pending=Promise.resolve().then(()=>api(request));requests.add(pending);pending.finally(()=>requests.delete(pending)).catch(()=>{});return pending;
  },
  capabilities(){return Object.freeze({mode:executionRunning()?'execute':'controls-only',executionAvailable:executionRunning(),tradingEnabled:false,custodyProvisioningAvailable:!closed&&custodyProvisioning});},
  run({once=false}={}){
   if(closed||typeof once!=='boolean')fail();sameLock();
   if(active)return active;
   active=worker.run({signal:abort.signal,once}).finally(()=>{active=null;});return active;
  },
  close(){
   if(closing)return closing;
   closed=true;abort.abort();
   closing=(async()=>{try{await Promise.allSettled([...requests]);if(active)await active;}finally{release();}})();return closing;
  }
 });
}
