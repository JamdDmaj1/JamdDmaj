import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,rmSync,rmdirSync,readFileSync,writeFileSync,existsSync,renameSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {openServerPerpsRuntime,startServerPerpsControlBoundary} from '../lib/perps-server-runtime.js';
import {perpsWorkerEnvironment} from '../lib/perps-server-runtime.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
const allowNonPosixForTests=process.platform==='win32',ownerAccountHash='c'.repeat(64);
function fixture(t,{active=false}={}){
 const directory=mkdtempSync(join(tmpdir(),'jamd-runtime-unfunded-'));chmodSync(directory,0o700);
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const wallets=join(directory,'wallets'),keys=join(directory,'keys'),keyFile=join(keys,'master.key');mkdirSync(wallets,{mode:0o700});mkdirSync(keys,{mode:0o700});
 createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests});
 const vault=openPerpsCustodyVault({directory:wallets,keyFile,allowNonPosixForTests}),identity=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 const controlsPath=join(directory,'controls.sqlite'),journalPath=join(directory,'journal.sqlite'),backupPath=join(directory,'backup.sqlite');
 const controls=openPerpsAutomationControls(controlsPath);controls.provision({...identity,settings:{capital:100,loss:80,positions:2,margin:10,leverage:3,dailyTrades:5}});controls.close();
 const journal=openPerpsExecutionJournal(journalPath);journal.close();const registry=openPerpsBackupRegistry(backupPath,{allowNonPosixForTests});registry.close();
 for(const path of [controlsPath,journalPath,backupPath])chmodSync(path,0o600);
 // Unfunded fixture only: represents consent persisted by a previous process,
 // not a production activation API and never a funded or submitted operation.
 if(active){const db=new DatabaseSync(controlsPath);db.exec('UPDATE perps_automation_controls SET enabled=1,paused=0');db.close();}
 const calls=[];return {directory,controlsPath,journalPath,backupPath,identity,calls,
  options:{directory,allowNonPosixForTests,fetchImpl:async(...args)=>{calls.push(args);throw Error('NO_REAL_NETWORK_IN_FIXTURE');}}};
}
test('the composed default runtime reconciles existing active accounts without feed, risk, signing or submission transports',async t=>{
 const f=fixture(t,{active:true}),runtime=openServerPerpsRuntime(f.options);t.after(()=>runtime.close());
 const report=await runtime.run({once:true});assert.equal(report.mode,'maintenance');assert.equal(report.results.RECONCILIATION_ONLY,1);assert.equal(f.calls.length,0);
 const status=JSON.parse(readFileSync(join(f.directory,'worker-status.json'),'utf8'));assert.deepEqual(status,report);
 assert.equal(JSON.stringify(status).includes(f.identity.walletAddress),false);assert.equal(JSON.stringify(status).includes(ownerAccountHash),false);
 await runtime.close();assert.equal(existsSync(join(f.directory,'worker.lock')),false);
 assert.throws(()=>runtime.run());const again=openServerPerpsRuntime(f.options);await again.close();
});
test('execution requires explicit operator configuration and still cannot bypass paused controls or a real backup proof',async t=>{
 const f=fixture(t);for(const extra of [{mode:'execute'},{mode:'execute',explicitExecutionApproval:true},{mode:'execute',explicitExecutionApproval:true,feedToken:'short'}])assert.throws(()=>openServerPerpsRuntime({...f.options,...extra}));
 const args={...f.options,mode:'execute',explicitExecutionApproval:true,feedToken:'unfunded-fixture-feed-token'};
 let runtime=openServerPerpsRuntime(args);assert.equal((await runtime.run({once:true})).results.AUTOMATION_INACTIVE,1);await runtime.close();
 const db=new DatabaseSync(f.controlsPath);db.exec('UPDATE perps_automation_controls SET enabled=1,paused=0');db.close();
 runtime=openServerPerpsRuntime(args);try{assert.equal((await runtime.run({once:true})).results.BACKUP_VERIFICATION_REQUIRED,1);assert.equal(f.calls.length,0);}finally{await runtime.close();}
});

test('composed authenticated runtime reads the durable restored-backup registry without granting execution',async t=>{
 const f=fixture(t),common={allowNonPosixForTests},operatorDirectory=join(f.directory,'operator');
 const operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 const archive=await createPerpsCustodyRecoveryArchive({directory:join(f.directory,'wallets'),keyFile:join(f.directory,'keys','master.key'),
  recipient:operator.recipient,explicitOperatorApproval:true,requireRestoreProof:true,...common,
  runtimePaths:{controlsPath:f.controlsPath,journalPath:f.journalPath,temporaryDirectory:f.directory}});
 const registry=openPerpsBackupRegistry(f.backupPath,common);
 await registry.registerArchive(archive,{explicitOperatorApproval:true});
 const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory,destinationDirectory:join(f.directory,'restored'),explicitOperatorApproval:true,...common});
 registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
 const runtime=openServerPerpsRuntime({...f.options,fetchImpl:async()=>Response.json({ok:true,accountHash:ownerAccountHash,verifiedAt:Date.now()})});
 const request=()=>runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation',{headers:{Authorization:'Bearer '+'e'.repeat(64)}}));
 try{
  const response=await request(),body=await response.json();assert.equal(response.status,200);assert.equal(body.recovery.backupVerified,true);
  assert.equal(body.recovery.walletAddress,f.identity.walletAddress);assert.equal(body.recovery.readyForSigning,false);assert.equal(body.recovery.fundingAvailable,false);
  assert.equal(body.controls.enabled,false);assert.equal(runtime.capabilities().executionAvailable,false);
  registry.revokeArchive({archiveSha256:archive.sha256,explicitOperatorApproval:true});
  assert.equal((await (await request()).json()).recovery.backupVerified,false);
  assert.equal(f.calls.length,0);
 }finally{await runtime.close();registry.close();}
});
test('runtime never creates missing stores, keys or replacement wallets and does not migrate a foreign database',async t=>{
 const f=fixture(t);renameSync(f.journalPath,f.journalPath+'.saved');assert.throws(()=>openServerPerpsRuntime(f.options));assert.equal(existsSync(f.journalPath),false);
 const wrong=new DatabaseSync(f.journalPath);wrong.exec('CREATE TABLE foreign_data(value TEXT)');wrong.close();chmodSync(f.journalPath,0o600);
 assert.throws(()=>openServerPerpsRuntime(f.options));assert.equal(existsSync(join(f.directory,'worker.lock')),false);
 const unchanged=new DatabaseSync(f.journalPath,{readOnly:true});assert.deepEqual(unchanged.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name),['foreign_data']);unchanged.close();
});
test('a second runtime or an abandoned lock cannot steal the first worker inventory',async t=>{
 const f=fixture(t),runtime=openServerPerpsRuntime(f.options);
 assert.throws(()=>openServerPerpsRuntime(f.options));await runtime.run({once:true});await runtime.close();
 const lockFile=join(f.directory,'worker.lock');writeFileSync(lockFile,'ABANDONED_REQUIRES_OPERATOR_REVIEW',{mode:0o600});
 assert.throws(()=>openServerPerpsRuntime(f.options));assert.equal(readFileSync(lockFile,'utf8'),'ABANDONED_REQUIRES_OPERATOR_REVIEW');
});
test('runtime shutdown drains the paced loop, shares in-flight runs and prevents a restarted cycle',async t=>{
 const f=fixture(t);let entered;const began=new Promise(resolve=>{entered=resolve;});
 const runtime=openServerPerpsRuntime({...f.options,wait:async(_ms,_unused,{signal})=>{entered();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));}});
 const running=runtime.run();assert.equal(runtime.run(),running);await began;await runtime.close();await running;assert.equal(f.calls.length,0);
 assert.equal(JSON.parse(readFileSync(join(f.directory,'worker-status.json'),'utf8')).stage,'WORKER_STOPPED');assert.throws(()=>runtime.run());
});
test('insecure stores or status destinations are refused without signing or removing another lock',async t=>{
 const f=fixture(t),status=join(f.directory,'worker-status.json');mkdirSync(status,{mode:0o700});assert.throws(()=>openServerPerpsRuntime(f.options));
 assert.equal(existsSync(join(f.directory,'worker.lock')),false);rmdirSync(status); // This exact empty test directory only.
 if(process.platform!=='win32'){chmodSync(f.controlsPath,0o644);assert.throws(()=>openServerPerpsRuntime(f.options));chmodSync(f.controlsPath,0o600);}
 const runtime=openServerPerpsRuntime(f.options),lock=join(f.directory,'worker.lock');renameSync(lock,lock+'.original');writeFileSync(lock,'replacement',{mode:0o600});
 await assert.rejects(runtime.close());assert.equal(readFileSync(lock,'utf8'),'replacement');assert.equal(f.calls.length,0);
});
test('worker environment defaults to maintenance and never exposes a non-POSIX permission bypass',()=>{
 const config=perpsWorkerEnvironment({STATE_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_ALLOW_NON_POSIX_FOR_TESTS:'true'});
 assert.equal(config.mode,'maintenance');assert.equal(config.explicitExecutionApproval,false);assert.equal(config.allowNonPosixForTests,undefined);
 assert.equal(perpsWorkerEnvironment({STATE_DIRECTORY:'/var/lib/jamddmaj-perps-runtime'}).directory,'/var/lib/private/jamddmaj-perps-runtime');
 assert.equal(perpsWorkerEnvironment({JAMDDMAJ_PERPS_RUNTIME_DIRECTORY:'/var/lib/jamddmaj-perps-runtime'}).directory,'/var/lib/jamddmaj-perps-runtime');
 const shared=perpsWorkerEnvironment({STATE_DIRECTORY:'/var/lib/runtime:/var/lib/controls',JAMDDMAJ_PERPS_RUNTIME_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_CONTROLS_DIRECTORY:'/private/controls'});
 assert.equal(shared.directory,'/private/runtime');assert.equal(shared.controlsDirectory,'/private/controls');
 for(const env of [{},{STATE_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_WORKER_MODE:'auto'},{STATE_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_EXECUTION_APPROVED:'yes'},{STATE_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_WORKER_BATCH_SIZE:'51'}])assert.throws(()=>perpsWorkerEnvironment(env));
});
test('systemd runtime locks remain separate from durable financial state and disappear on a clean drain',async t=>{
 const f=fixture(t),lockDirectory=join(f.directory,'run');mkdirSync(lockDirectory,{mode:0o700});
 const runtime=openServerPerpsRuntime({...f.options,lockDirectory});assert.equal(existsSync(join(f.directory,'worker.lock')),false);assert.equal(existsSync(join(lockDirectory,'worker.lock')),true);
 await runtime.run({once:true});await runtime.close();assert.equal(existsSync(join(lockDirectory,'worker.lock')),false);assert.equal(existsSync(f.journalPath),true);
 assert.equal(perpsWorkerEnvironment({STATE_DIRECTORY:f.directory,RUNTIME_DIRECTORY:lockDirectory}).lockDirectory,lockDirectory);
});
test('authenticated runtime controls update the exact worker store and reject foreign ownership or client readiness',async t=>{
 const f=fixture(t),token='e'.repeat(64),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const runtime=openServerPerpsRuntime({...f.options,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://www.jamddmaj.com/api/perps-identity');assert.equal(options.headers.Authorization,'Bearer '+token);
  return Response.json({ok:true,accountHash:ownerAccountHash,verifiedAt:Date.now()});
 }});
 const request=body=>runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation',{headers,...body?{method:'POST',body:JSON.stringify(body)}:{}}));
 try{
  assert.equal((await runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation'))).status,401);
  const initial=(await (await request()).json()).controls;assert.equal(initial.walletAddress,f.identity.walletAddress);
  const saved=await request({action:'save',walletAddress:initial.walletAddress,expectedRevision:initial.revision,settings:{...initial.settings,margin:20}});assert.equal(saved.status,200);
  const state=(await saved.json()).controls;assert.equal(state.paused,true);assert.equal(state.settings.margin,20);
  const check=openPerpsAutomationControls(f.controlsPath);try{assert.equal(check.read(f.identity).revision,state.revision);}finally{check.close();}
  assert.equal((await request({action:'pause',walletAddress:initial.walletAddress,ownerAccountHash:'b'.repeat(64)})).status,400);
  const review=(await (await request({action:'activationReview',walletAddress:state.walletAddress,expectedRevision:state.revision})).json()).review;
  assert.equal((await request({action:'activate',walletAddress:state.walletAddress,expectedRevision:state.revision,token:review.token,explicitApproval:true})).status,503);
  assert.equal((await runtime.run({once:true})).results.RECONCILIATION_ONLY,1);
 }finally{await runtime.close();}
 assert.equal((await request()).status,503);
});
test('runtime drains an in-flight authenticated request on shutdown without writing after stores close',async t=>{
 const f=fixture(t);let started,release;const began=new Promise(resolve=>{started=resolve;});
 const runtime=openServerPerpsRuntime({...f.options,fetchImpl:async()=>{started();await new Promise(resolve=>{release=resolve;});return Response.json({ok:true,accountHash:ownerAccountHash,verifiedAt:Date.now()});}});
 const pending=runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation',{headers:{Authorization:'Bearer '+'e'.repeat(64)}}));
 await began;let drained=false;const closing=runtime.close().then(()=>{drained=true;});await Promise.resolve();assert.equal(drained,false);
 release();assert.equal((await pending).status,503);await closing;assert.equal(existsSync(join(f.directory,'worker.lock')),false);
});

test('shared private controls retain existing ownership and exhausted quotas without copying, migrating or replacing the original store',async t=>{
 const f=fixture(t),controlsDirectory=join(f.directory,'original-controls');mkdirSync(controlsDirectory,{mode:0o700});
 const sharedPath=join(controlsDirectory,'controls.sqlite');renameSync(f.controlsPath,sharedPath);
 const now=()=>1800000000000,existing=openPerpsAutomationControls(sharedPath,{now});
 for(let i=0;i<60;i++)assert.equal(existing.consumeRequestQuota({ownerAccountHash}),true);existing.close();
 const runtime=openServerPerpsRuntime({...f.options,controlsDirectory,now,fetchImpl:async()=>Response.json({ok:true,accountHash:ownerAccountHash,verifiedAt:now()})});
 try{
  const response=await runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation',{headers:{Authorization:'Bearer '+'e'.repeat(64)}}));
  assert.equal(response.status,429);assert.equal(existsSync(f.controlsPath),false);
  assert.equal((await runtime.run({once:true})).results.RECONCILIATION_ONLY,1);
  const verify=openPerpsAutomationControls(sharedPath,{now});try{assert.equal(verify.read(f.identity).walletAddress,f.identity.walletAddress);assert.equal(verify.consumeRequestQuota({ownerAccountHash}),false);}finally{verify.close();}
 }finally{await runtime.close();}
 assert.equal(existsSync(f.controlsPath),false);
});

test('opt-in runtime custody setup creates separate paused wallets for verified users, survives restart, and never enables funding or execution',async t=>{
 const f=fixture(t),firstOwner='d'.repeat(64),secondOwner='e'.repeat(64),firstToken='a'.repeat(64),secondToken='b'.repeat(64);
 const settings={capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3};
 const fetchImpl=async(url,options)=>{
  assert.equal(url,'https://www.jamddmaj.com/api/perps-identity');
  const accountHash=new Map([['Bearer '+firstToken,firstOwner],['Bearer '+secondToken,secondOwner]]).get(options.headers.Authorization);
  return accountHash?Response.json({ok:true,accountHash,verifiedAt:Date.now()}):Response.json({error:{code:'login-required'}},{status:401});
 };
 const options={...f.options,fetchImpl};let runtime=openServerPerpsRuntime(options);
 const request=(token,body)=>runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation',{
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...body?{method:'POST',body:JSON.stringify(body)}:{}}));
 const body={action:'provision',settings,explicitCustodyApproval:true};
 assert.equal((await request(firstToken,body)).status,503);await runtime.close();
 for(const bad of ['true',1,null])assert.throws(()=>openServerPerpsRuntime({...options,custodyProvisioning:bad}));
 runtime=openServerPerpsRuntime({...options,custodyProvisioning:true});
 try{
  assert.deepEqual(runtime.capabilities(),{mode:'controls-only',executionAvailable:false,tradingEnabled:false,custodyProvisioningAvailable:true});
  assert.equal((await request('f'.repeat(64),body)).status,401);
  assert.equal((await request(firstToken,{...body,explicitCustodyApproval:false})).status,400);
  assert.equal((await request(firstToken,{...body,ownerAccountHash:secondOwner})).status,400);
  assert.equal(readdirSync(join(f.directory,'wallets')).length,1);
  const [firstResponse,secondResponse]=await Promise.all([request(firstToken,body),request(secondToken,body)]);
  assert.equal(firstResponse.status,200);assert.equal(secondResponse.status,200);
  const first=await firstResponse.json(),second=await secondResponse.json();
  assert.notEqual(first.controls.walletAddress,second.controls.walletAddress);
  for(const response of [first,second]){
   assert.deepEqual(response.setup,{stage:'BACKUP_VERIFICATION_REQUIRED',backupVerified:false,fundingAvailable:false,readyForSigning:false});
   assert.equal(response.controls.enabled,false);assert.equal(response.controls.paused,true);assert.equal(JSON.stringify(response).includes('ciphertext'),false);
  }
  const read=await (await request(firstToken)).json();assert.equal(read.controls.walletAddress,first.controls.walletAddress);assert.equal(JSON.stringify(read).includes(second.controls.walletAddress),false);
  await runtime.close();assert.equal(runtime.capabilities().custodyProvisioningAvailable,false);
  runtime=openServerPerpsRuntime({...options,custodyProvisioning:true});
  const repeated=await (await request(firstToken,body)).json();assert.equal(repeated.controls.walletAddress,first.controls.walletAddress);assert.equal(repeated.controls.revision,first.controls.revision);
  assert.equal(readdirSync(join(f.directory,'wallets')).length,3);
  const report=await runtime.run({once:true});assert.equal(report.results.RECONCILIATION_ONLY,3);assert.equal(f.calls.length,0);
 }finally{await runtime.close();}
});
test('shared control boundary binds loopback and advertises no execution or provisioning in maintenance',async t=>{
 const f=fixture(t),runtime=openServerPerpsRuntime(f.options),probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const boundary=startServerPerpsControlBoundary(runtime,{port});
 try{
  await once(boundary.server,'listening');assert.equal(boundary.server.address().address,'127.0.0.1');
  const health=await fetch('http://127.0.0.1:'+port+'/health');assert.deepEqual(await health.json(),{ok:true,mode:'controls-only',executionAvailable:false,tradingEnabled:false,custodyProvisioningAvailable:false});
 }finally{await Promise.all([boundary.close(),runtime.close()]);}
});

test('actual authenticated runtime enforces custody capacity before creating another user wallet',async t=>{
 const f=fixture(t),runtime=openServerPerpsRuntime({...f.options,custodyProvisioning:true,custodyWalletLimit:1,
  fetchImpl:async()=>Response.json({ok:true,accountHash:'d'.repeat(64),verifiedAt:Date.now()})});
 try{
  const response=await runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation',{method:'POST',
   headers:{Authorization:'Bearer '+'e'.repeat(64),'Content-Type':'application/json'},
   body:JSON.stringify({action:'provision',explicitCustodyApproval:true,settings:{capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3}})}));
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'custody-capacity');
  assert.equal(readdirSync(join(f.directory,'wallets')).length,1);assert.equal(runtime.capabilities().executionAvailable,false);
 }finally{await runtime.close();}
});

test('shutdown while custody authentication is pending cannot create a wallet or advertise setup readiness',async t=>{
 const f=fixture(t);let started,release;const began=new Promise(resolve=>{started=resolve;});
 const runtime=openServerPerpsRuntime({...f.options,custodyProvisioning:true,fetchImpl:async()=>{
  started();await new Promise(resolve=>{release=resolve;});return Response.json({ok:true,accountHash:'d'.repeat(64),verifiedAt:Date.now()});
 }});
 const pending=runtime.handleControlRequest(new Request('https://157.230.54.133/v1/automation',{method:'POST',
  headers:{Authorization:'Bearer '+'e'.repeat(64),'Content-Type':'application/json'},
  body:JSON.stringify({action:'provision',explicitCustodyApproval:true,settings:{capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3}})}));
 await began;const closing=runtime.close();assert.equal(runtime.capabilities().custodyProvisioningAvailable,false);
 release();assert.equal((await pending).status,503);await closing;assert.equal(readdirSync(join(f.directory,'wallets')).length,1);
});
test('the actual Linux worker entry point runs maintenance against unfunded private stores and never enables controls',{skip:process.platform==='win32'},t=>{
 const f=fixture(t,{active:true});
 const cli=process.env.JAMDDMAJ_TEST_PERPS_WORKER_CLI||fileURLToPath(new URL('../scripts/perps-server-worker.mjs',import.meta.url));
 execFileSync(process.execPath,[cli,'--once'],{env:{PATH:process.env.PATH,STATE_DIRECTORY:f.directory},encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
 const status=JSON.parse(readFileSync(join(f.directory,'worker-status.json'),'utf8'));assert.equal(status.mode,'maintenance');assert.equal(status.results.RECONCILIATION_ONLY,1);assert.equal(status.readyForSigning,false);
 assert.equal(existsSync(join(f.directory,'worker.lock')),false);
 const controls=openPerpsAutomationControls(f.controlsPath);try{assert.equal(controls.read(f.identity).enabled,true);}finally{controls.close();}
});

test('the actual Linux CLI requires a control boundary for custody setup and leaves all existing accounts paused',{skip:process.platform==='win32'},t=>{
 const f=fixture(t),cli=process.env.JAMDDMAJ_TEST_PERPS_WORKER_CLI||fileURLToPath(new URL('../scripts/perps-server-worker.mjs',import.meta.url));
 const options={env:{PATH:process.env.PATH,STATE_DIRECTORY:f.directory},encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']};
 assert.throws(()=>execFileSync(process.execPath,[cli,'--once','--custody-setup'],options));assert.equal(existsSync(join(f.directory,'worker.lock')),false);
 execFileSync(process.execPath,[cli,'--once','--controls','--custody-setup'],options);
 assert.equal(JSON.parse(readFileSync(join(f.directory,'worker-status.json'),'utf8')).mode,'maintenance');
 assert.equal(readdirSync(join(f.directory,'wallets')).length,1);
 const controls=openPerpsAutomationControls(f.controlsPath);try{const state=controls.read(f.identity);assert.equal(state.enabled,false);assert.equal(state.paused,true);}finally{controls.close();}
});
