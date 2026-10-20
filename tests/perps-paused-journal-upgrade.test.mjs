import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,chmodSync,rmSync,mkdirSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {upgradePausedEmptyPerpsJournal} from '../lib/perps-paused-journal-upgrade.js';
import {inspectExistingPerpsRuntimeDatabases} from '../lib/perps-runtime-recovery.js';
const owner='a'.repeat(64),wallet='11111111111111111111111111111111',now=1792454400000;
function fixture(t,{withCancellations=false}={}){
 let registry;const root=mkdtempSync(join(tmpdir(),'jamd-paused-upgrade-'));chmodSync(root,0o700);t.after(()=>{registry?.close();rmSync(root,{recursive:true,force:true});});
 const lockDirectory=join(root,'runtime'),backupDirectory=join(root,'backups');for(const path of [lockDirectory,backupDirectory])mkdirSync(path,{mode:0o700});
 const controlsPath=join(root,'controls.sqlite'),journalPath=join(root,'journal.sqlite'),registryPath=join(root,'backup.sqlite'),allowNonPosixForTests=process.platform==='win32';
 const controls=openPerpsAutomationControls(controlsPath,{now:()=>now});const before=controls.provision({ownerAccountHash:owner,walletAddress:wallet,settings:{capital:100,loss:50,positions:2,margin:10,leverage:3,dailyTrades:5}});controls.close();
 const journal=openPerpsExecutionJournal(journalPath);journal.close();const raw=new DatabaseSync(journalPath);raw.exec('DROP TABLE perps_position_closes');if(!withCancellations)raw.exec('DROP TABLE perps_exit_cancellations');raw.close();
 registry=openPerpsBackupRegistry(registryPath,{allowNonPosixForTests,now:()=>now});registry.close();
 // Persistence corpus only, no real wallet/key/archive. The cryptographic
 // restore acceptance path has separate tests; this case uses its persisted
 // accepted registry shape to obtain an actual privately branded proof.
 const db=new DatabaseSync(registryPath),archive='b'.repeat(64),bindings=JSON.stringify([{ownerAccountHash:owner,walletAddress:wallet}]);
 db.prepare("INSERT INTO perps_backup_challenges(archive,token_hash,created,expires,bindings,status) VALUES(?,?,?,?,?,'ACCEPTED')").run(archive,'c'.repeat(64),now,now+86400000,bindings);
 db.prepare('INSERT INTO perps_verified_backups(owner,wallet,archive,revision,verified) VALUES(?,?,?,?,?)').run(owner,wallet,archive,randomUUID(),now);db.close();
 for(const path of [controlsPath,journalPath,registryPath])chmodSync(path,0o600);
 registry=openPerpsBackupRegistry(registryPath,{allowNonPosixForTests,now:()=>now});
 return {root,controlsPath,journalPath,lockDirectory,backupDirectory,registry,before,
  input:{controlsPath,journalPath,lockDirectory,backupDirectory,readBackupProof:who=>registry.readVerified(who),explicitMigrationApproval:true,allowNonPosixForTests}};
}
function liveRows(f){const c=new DatabaseSync(f.controlsPath,{readOnly:true}),j=new DatabaseSync(f.journalPath,{readOnly:true});try{return {controls:c.prepare('SELECT * FROM perps_automation_controls').all(),schema:j.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()};}finally{c.close();j.close();}}

test('the current production cancellation-aware empty schema has an explicit paused upgrade path',async t=>{
 const f=fixture(t,{withCancellations:true}),before=liveRows(f),result=await upgradePausedEmptyPerpsJournal(f.input);
 assert.equal(result.sourceSchema,'cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54');
 assert.equal(result.targetSchema,'8200534af55b955bb73f2dd8bd207eeac04b248381885f415e19584e5cebeddd');
 assert.deepEqual(liveRows(f).controls,before.controls);
 assert.equal(inspectExistingPerpsRuntimeDatabases(f.input).stage,'EXISTING_RUNTIME_STORES_VERIFIED');
});
test('atomic paused upgrade retains exact rollback copies, controls, and zero financial rows without keys or execution',async t=>{
 const f=fixture(t),before=liveRows(f),result=await upgradePausedEmptyPerpsJournal(f.input);
 assert.equal(result.stage,'PAUSED_EMPTY_JOURNAL_UPGRADED');assert.equal(result.custodyKeysRead,false);assert.equal(result.controlsChanged,false);
 assert.equal(result.newRecoveryVerificationRequired,true);assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
 assert.deepEqual(liveRows(f).controls,before.controls);assert.equal(existsSync(join(f.lockDirectory,'worker.lock')),false);
 assert.equal(inspectExistingPerpsRuntimeDatabases(f.input).stage,'EXISTING_RUNTIME_STORES_VERIFIED');
 const rollback=new DatabaseSync(join(result.rollbackDirectory,'journal.sqlite'),{readOnly:true});try{
  assert.deepEqual(rollback.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),before.schema);
  assert.equal(rollback.prepare('SELECT COUNT(*) AS count FROM perps_reservations').get().count,0);
 }finally{rollback.close();}
 const manifest=JSON.parse(readFileSync(join(result.rollbackDirectory,'manifest.json'),'utf8'));assert.equal(manifest.sourceSchema,result.sourceSchema);
 await assert.rejects(()=>upgradePausedEmptyPerpsJournal(f.input));assert.equal(existsSync(join(f.lockDirectory,'worker.lock')),false);
});
test('active controls, historical rows, unknown schema, missing backup, wrong paths, and an existing worker lease refuse migration',async t=>{
 for(const fault of ['active','rows','foreign','backup','lease','alias','approval']){
  const f=fixture(t),input={...f.input};
  if(fault==='active'){const db=new DatabaseSync(f.controlsPath);db.exec('UPDATE perps_automation_controls SET enabled=1,paused=0');db.close();}
  if(fault==='rows'){const db=new DatabaseSync(f.journalPath);db.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated) VALUES(?,?,?,?,?,'CANCELLED',?,?)").run(wallet,'past','past','2026-10-20',10000000,now,now);db.close();}
  if(fault==='foreign'){const db=new DatabaseSync(f.journalPath);db.exec('CREATE TABLE foreign_data(value TEXT)');db.close();}
  if(fault==='backup')input.readBackupProof=()=>({backupVerified:true});
  if(fault==='alias')input.journalPath=input.controlsPath;
  if(fault==='approval')input.explicitMigrationApproval=false;
  if(fault==='lease')writeFileSync(join(f.lockDirectory,'worker.lock'),'existing-worker',{mode:0o600});
  const before=liveRows(f);await assert.rejects(()=>upgradePausedEmptyPerpsJournal(input),/PERPS_PAUSED_JOURNAL_UPGRADE_UNAVAILABLE/);
  assert.deepEqual(liveRows(f),before);assert.equal(existsSync(join(f.lockDirectory,'worker.lock')),fault==='lease');
  if(fault==='lease')assert.equal(readFileSync(join(f.lockDirectory,'worker.lock'),'utf8'),'existing-worker');
 }
});

test('loss of backup proof after DDL rolls back schema and preserves the private rollback artifact',async t=>{
 const f=fixture(t),before=liveRows(f);let calls=0;
 await assert.rejects(()=>upgradePausedEmptyPerpsJournal({...f.input,readBackupProof:who=>{
  if(++calls===2)throw Error('backup revoked');return f.registry.readVerified(who);
 }}),error=>error.phase==='ATOMIC_UPGRADE');
 assert.equal(calls,2);assert.deepEqual(liveRows(f),before);assert.equal(existsSync(join(f.lockDirectory,'worker.lock')),false);
});

test('the actual shared worker lease permits only one simultaneous migration coordinator',async t=>{
 const f=fixture(t),before=liveRows(f),results=await Promise.allSettled([upgradePausedEmptyPerpsJournal(f.input),upgradePausedEmptyPerpsJournal(f.input)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.phase==='WORKER_LEASE').length,1);
 assert.deepEqual(liveRows(f).controls,before.controls);assert.equal(existsSync(join(f.lockDirectory,'worker.lock')),false);
});
