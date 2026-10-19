import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,rmSync,rmdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openServerPerpsRuntime} from '../lib/perps-server-runtime.js';
import {perpsWorkerEnvironment} from '../lib/perps-server-runtime.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
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
 for(const env of [{},{STATE_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_WORKER_MODE:'auto'},{STATE_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_EXECUTION_APPROVED:'yes'},{STATE_DIRECTORY:'/private/runtime',JAMDDMAJ_PERPS_WORKER_BATCH_SIZE:'51'}])assert.throws(()=>perpsWorkerEnvironment(env));
});
test('systemd runtime locks remain separate from durable financial state and disappear on a clean drain',async t=>{
 const f=fixture(t),lockDirectory=join(f.directory,'run');mkdirSync(lockDirectory,{mode:0o700});
 const runtime=openServerPerpsRuntime({...f.options,lockDirectory});assert.equal(existsSync(join(f.directory,'worker.lock')),false);assert.equal(existsSync(join(lockDirectory,'worker.lock')),true);
 await runtime.run({once:true});await runtime.close();assert.equal(existsSync(join(lockDirectory,'worker.lock')),false);assert.equal(existsSync(f.journalPath),true);
 assert.equal(perpsWorkerEnvironment({STATE_DIRECTORY:f.directory,RUNTIME_DIRECTORY:lockDirectory}).lockDirectory,lockDirectory);
});
test('the actual Linux worker entry point runs maintenance against unfunded private stores and never enables controls',{skip:process.platform==='win32'},t=>{
 const f=fixture(t,{active:true});
 const cli=process.env.JAMDDMAJ_TEST_PERPS_WORKER_CLI||fileURLToPath(new URL('../scripts/perps-server-worker.mjs',import.meta.url));
 execFileSync(process.execPath,[cli,'--once'],{env:{PATH:process.env.PATH,STATE_DIRECTORY:f.directory},encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
 const status=JSON.parse(readFileSync(join(f.directory,'worker-status.json'),'utf8'));assert.equal(status.mode,'maintenance');assert.equal(status.results.RECONCILIATION_ONLY,1);assert.equal(status.readyForSigning,false);
 assert.equal(existsSync(join(f.directory,'worker.lock')),false);
 const controls=openPerpsAutomationControls(f.controlsPath);try{assert.equal(controls.read(f.identity).enabled,true);}finally{controls.close();}
});
