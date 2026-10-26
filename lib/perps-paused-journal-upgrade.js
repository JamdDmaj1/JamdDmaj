// Explicit operator-only schema upgrade for the observed EMPTY legacy journal.
// No HTTP, key creation/decryption, execution mode, activation or financial I/O.
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {join,dirname} from 'node:path';
import {lstatSync,mkdtempSync,chmodSync,unlinkSync} from 'node:fs';
import {PERPS_PLATFORM_FEE_LOCK_SCHEMA_SQL,PERPS_EXIT_CANCELLATION_SCHEMA_SQL,PERPS_POSITION_CLOSE_SCHEMA_SQL,PERPS_EMPTY_CLOSE_REBUILD_SQL,openPerpsExecutionJournal} from './perps-execution-journal.js';
import {inspectExistingPerpsRuntimeDatabases} from './perps-runtime-recovery.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write,readPrivateRecoveryFile as read,syncPrivateRecoveryDirectory as sync} from './perps-recovery-private-files.js';
const SOURCES=new Set(['e92bbd338ca88b8a85064ac669f0ae6ffb50641475b1bd62f78df48d06ccf145','42653dcbee61271989264b68e8829787afc7d1b2c5e54ae759b100571088fbaf','d48b3b21a0aaa1addfa5735406f90e634f99f3b344cb418237de24938a9672e7','1657eaa7e4eb82efe0e045597e1ec06dd736b9bdc9f2b6a88125c987dc6ea563','f4c79e669461914ff30fe59063f6ca11270d951600fc320c6ce87dcd616ca786','cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54']),TARGET='505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9';
const CONTROLS='03270dc01ead4f30609d9865ebb3aad80d0b0d48e3cc387e05fd2b9b155d22a7',MAX=8*1024*1024;
const hash=data=>createHash('sha256').update(data).digest('hex');
function fail(phase){throw Object.assign(Error('PERPS_PAUSED_JOURNAL_UPGRADE_UNAVAILABLE'),{phase});}
function schema(db){return hash(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row=>({...row,sql:row.sql?.replace(/\s+/g,' ').trim()}))));}
function verify(db,expected){
 if(schema(db)!==expected||db.prepare('PRAGMA integrity_check').all().some(row=>Object.values(row)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)throw Error();
 const size=db.prepare('PRAGMA page_count').get().page_count*db.prepare('PRAGMA page_size').get().page_size;if(!Number.isSafeInteger(size)||size<512||size>MAX)throw Error();
}
export async function upgradePausedEmptyPerpsJournal({controlsPath,journalPath,lockDirectory,backupDirectory,readBackupProof,explicitMigrationApproval=false,allowNonPosixForTests=false}={}){
 if(explicitMigrationApproval!==true||typeof readBackupProof!=='function')fail('APPROVAL');
 let phase='PRIVATE_PATHS',lease,leaseStat,controls,journal,archive,sourceSchema,committed=false,completed=false;const locks=[],opened=[];
 try{
  controlsPath=check(controlsPath,false,allowNonPosixForTests).path;journalPath=check(journalPath,false,allowNonPosixForTests).path;
  for(const path of [controlsPath,journalPath])check(dirname(path),true,allowNonPosixForTests);
  const a=lstatSync(controlsPath,{bigint:true}),b=lstatSync(journalPath,{bigint:true});if(a.dev===b.dev&&a.ino===b.ino)throw Error();
  lockDirectory=check(lockDirectory,true,allowNonPosixForTests).path;backupDirectory=check(backupDirectory,true,allowNonPosixForTests).path;
  phase='WORKER_LEASE';lease=join(lockDirectory,'worker.lock');write(lease,JSON.stringify({stage:'PAUSED_JOURNAL_UPGRADE',instance:randomUUID(),pid:process.pid}),allowNonPosixForTests);
  leaseStat=lstatSync(lease,{bigint:true});
  phase='LOCKED_ADMISSION';
  for(const path of [controlsPath,journalPath].sort()){
   const db=new DatabaseSync(path,{timeout:250});opened.push(db);db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; BEGIN IMMEDIATE');locks.push(db);
   if(path===controlsPath)controls=db;else journal=db;
  }
  verify(controls,CONTROLS);sourceSchema=schema(journal);if(!SOURCES.has(sourceSchema))throw Error();verify(journal,sourceSchema);
  const accounts=controls.prepare('SELECT owner,wallet,enabled,paused FROM perps_automation_controls ORDER BY wallet').all();
  if(accounts.length<1||accounts.length>256||accounts.some(row=>row.enabled!==0||row.paused!==1))throw Error();
  for(const table of ['perps_reservations','perps_exit_request_bindings','perps_consumed_exit_events'])if(journal.prepare('SELECT COUNT(*) AS count FROM '+table).get().count!==0)throw Error();
  if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_position_closes'").get()
   &&journal.prepare('SELECT COUNT(*) AS count FROM perps_position_closes').get().count!==0)throw Error();
  if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_exit_cancellations'").get()
   &&journal.prepare('SELECT COUNT(*) AS count FROM perps_exit_cancellations').get().count!==0)throw Error();
  phase='VERIFIED_RECOVERY';for(const row of accounts){const who={ownerAccountHash:row.owner,walletAddress:row.wallet};requireVerifiedPerpsCustodyBackup(readBackupProof(who),who);}
  // Preserve exact WAL-aware rollback copies BEFORE DDL. Never overwrite an
  // older backup, replace a live database file or read a custody master key.
  phase='ROLLBACK_BACKUP';archive=mkdtempSync(join(backupDirectory,'jamd-journal-upgrade-'));chmodSync(archive,0o700);archive=check(archive,true,allowNonPosixForTests).path;
  const copies={};for(const [kind,path]of [['controls',controlsPath],['journal',journalPath]]){
   const source=new DatabaseSync(path,{readOnly:true});try{const file=join(archive,kind+'.sqlite');await backup(source,file);chmodSync(file,0o600);check(file,false,allowNonPosixForTests);copies[kind]={path:file,sha256:hash(read(file,MAX,allowNonPosixForTests))};}finally{source.close();}
  }
  phase='CANDIDATE_REHEARSAL';const candidate=join(archive,'candidate.sqlite');write(candidate,read(copies.journal.path,MAX,allowNonPosixForTests),allowNonPosixForTests);
  const candidateDb=new DatabaseSync(candidate);try{candidateDb.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;'+PERPS_EMPTY_CLOSE_REBUILD_SQL+PERPS_POSITION_CLOSE_SCHEMA_SQL+'COMMIT;');}finally{candidateDb.close();}
  const probe=openPerpsExecutionJournal(candidate);probe.close();inspectExistingPerpsRuntimeDatabases({controlsPath:copies.controls.path,journalPath:candidate,allowNonPosixForTests});
  write(join(archive,'manifest.json'),JSON.stringify({stage:'PREPARED_PAUSED_EMPTY_UPGRADE',sourceSchema,targetSchema:TARGET,copies,accounts:accounts.length}),allowNonPosixForTests);sync(archive);
  phase='ATOMIC_UPGRADE';journal.exec('ALTER TABLE perps_reservations ADD COLUMN platform_fee_units INTEGER NOT NULL DEFAULT 0 CHECK(platform_fee_units>=0);'+PERPS_EXIT_CANCELLATION_SCHEMA_SQL+PERPS_EMPTY_CLOSE_REBUILD_SQL+PERPS_POSITION_CLOSE_SCHEMA_SQL+PERPS_PLATFORM_FEE_LOCK_SCHEMA_SQL);verify(journal,TARGET);
  // Recovery consent is rechecked immediately before committing structural
  // changes. None of these operations may enable or alter owner settings.
  for(const row of accounts){const who={ownerAccountHash:row.owner,walletAddress:row.wallet};requireVerifiedPerpsCustodyBackup(readBackupProof(who),who);}
  journal.exec('COMMIT');committed=true;locks.splice(locks.indexOf(journal),1);
  controls.exec('ROLLBACK');locks.splice(locks.indexOf(controls),1);
  for(const db of opened.reverse())db.close();opened.length=0;
  inspectExistingPerpsRuntimeDatabases({controlsPath,journalPath,allowNonPosixForTests});completed=true;
  return Object.freeze({stage:'PAUSED_EMPTY_JOURNAL_UPGRADED',sourceSchema,targetSchema:TARGET,accounts:accounts.length,reservations:0,
   rollbackDirectory:archive,custodyKeysRead:false,controlsChanged:false,newRecoveryVerificationRequired:true,tradingEnabled:false,readyForSigning:false});
 }catch{fail(phase);}finally{
  for(const db of locks.reverse())try{db.exec('ROLLBACK');}catch{}
  for(const db of opened.reverse())try{db.close();}catch{}
  // Keep the lease if COMMIT happened but post-commit verification failed.
  // A failed/unknown upgrade must not appear safe to restart automatically.
  if(leaseStat&&(!committed||completed)){
   const current=lstatSync(lease,{bigint:true});if(current.dev!==leaseStat.dev||current.ino!==leaseStat.ino)fail('LEASE_REVIEW');
   unlinkSync(lease);sync(lockDirectory);
  }
 }
}
