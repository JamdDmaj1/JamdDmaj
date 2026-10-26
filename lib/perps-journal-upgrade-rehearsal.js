// Operator-only migration rehearsal on private disposable SQLite snapshots.
// Never replaces live stores, touches custody keys or enables execution.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {withLockedPerpsRuntimeRecoverySnapshot,readPerpsRuntimeRecoverySnapshot,inspectExistingPerpsRuntimeDatabases} from './perps-runtime-recovery.js';
import {openPerpsExecutionJournal,PERPS_EMPTY_CLOSE_REBUILD_SQL,PERPS_POSITION_CLOSE_SCHEMA_SQL} from './perps-execution-journal.js';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write,readPrivateRecoveryFile as read} from './perps-recovery-private-files.js';
const SOURCES=new Set(['d48b3b21a0aaa1addfa5735406f90e634f99f3b344cb418237de24938a9672e7','1657eaa7e4eb82efe0e045597e1ec06dd736b9bdc9f2b6a88125c987dc6ea563','f4c79e669461914ff30fe59063f6ca11270d951600fc320c6ce87dcd616ca786','cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54']);
SOURCES.add('42653dcbee61271989264b68e8829787afc7d1b2c5e54ae759b100571088fbaf');
SOURCES.add('e92bbd338ca88b8a85064ac669f0ae6ffb50641475b1bd62f78df48d06ccf145');
const TARGET='505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fail(phase='APPROVAL'){throw Object.assign(Error('PERPS_JOURNAL_UPGRADE_REHEARSAL_UNAVAILABLE'),{phase});}
function schema(db){return hash(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row=>({...row,sql:row.sql?.replace(/\s+/g,' ').trim()}))));}
export async function rehearsePausedEmptyPerpsJournalUpgrade({controlsPath,journalPath,temporaryDirectory,explicitRehearsalApproval=false,allowNonPosixForTests=false}={}){
 if(explicitRehearsalApproval!==true)fail();
 let work,phase='PRIVATE_DIRECTORY';const opened=[];
 try{
  const parent=check(temporaryDirectory,true,allowNonPosixForTests).path;
  phase='LOCKED_SNAPSHOT';return await withLockedPerpsRuntimeRecoverySnapshot({controlsPath,journalPath,temporaryDirectory:parent,allowNonPosixForTests},async handle=>{
   phase='PRIVATE_COPY';
   const records=readPerpsRuntimeRecoverySnapshot(handle);
   work=mkdtempSync(join(parent,'jamd-upgrade-rehearsal-'));chmodSync(work,0o700);work=check(work,true,allowNonPosixForTests).path;
   const paths={};for(const record of records){paths[record.kind]=join(work,record.kind+'.sqlite');write(paths[record.kind],Buffer.from(record.data,'base64'),allowNonPosixForTests);}
   const controls=new DatabaseSync(paths.controls,{readOnly:true}),journal=new DatabaseSync(paths.journal,{readOnly:true});opened.push(controls,journal);
   phase='SOURCE_ADMISSION';const accounts=controls.prepare('SELECT COUNT(*) AS count FROM perps_automation_controls').get().count;
   const active=controls.prepare('SELECT COUNT(*) AS count FROM perps_automation_controls WHERE enabled!=0 OR paused!=1').get().count;
   const sourceSchema=schema(journal);if(accounts<1||accounts>256||active||!SOURCES.has(sourceSchema))fail();
   // This deliberately bounded operator path is for the observed never-used
   // legacy production journal, not an automatic migration of financial rows.
   for(const table of ['perps_reservations','perps_exit_request_bindings','perps_consumed_exit_events'])if(journal.prepare('SELECT COUNT(*) AS count FROM '+table).get().count!==0)fail();
   if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_position_closes'").get()
    &&journal.prepare('SELECT COUNT(*) AS count FROM perps_position_closes').get().count!==0)fail();
   if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_exit_cancellations'").get()
    &&journal.prepare('SELECT COUNT(*) AS count FROM perps_exit_cancellations').get().count!==0)fail();
   for(const db of opened.reverse())db.close();opened.length=0;
   phase='CANDIDATE_UPGRADE';const rebuilt=new DatabaseSync(paths.journal);try{rebuilt.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;'+PERPS_EMPTY_CLOSE_REBUILD_SQL+PERPS_POSITION_CLOSE_SCHEMA_SQL+'COMMIT;');}finally{rebuilt.close();}
   const candidate=openPerpsExecutionJournal(paths.journal);candidate.close();
   inspectExistingPerpsRuntimeDatabases({controlsPath:paths.controls,journalPath:paths.journal,allowNonPosixForTests});
   phase='CANDIDATE_VERIFICATION';const final=new DatabaseSync(paths.journal);opened.push(final);
   if(schema(final)!==TARGET||final.prepare('SELECT COUNT(*) AS count FROM perps_reservations').get().count!==0
    ||final.prepare('SELECT COUNT(*) AS count FROM perps_exit_cancellations').get().count!==0)fail();
   final.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');final.close();opened.length=0;
   return Object.freeze({stage:'PAUSED_EMPTY_JOURNAL_UPGRADE_REHEARSED',sourceSchema,targetSchema:TARGET,accounts,reservations:0,
    sourceSnapshotSha256:records.find(row=>row.kind==='journal').sha256,candidateSnapshotSha256:hash(read(paths.journal,8*1024*1024,allowNonPosixForTests)),
    liveStoresReplaced:false,custodyKeysRead:false,tradingEnabled:false,readyForSigning:false});
  });
 }catch{fail(phase);}finally{
  for(const db of opened)try{db.close();}catch{}
  // Only the fresh, verified child created above; never an input/live path.
  if(work){check(work,true,allowNonPosixForTests);rmSync(work,{recursive:true,force:false});}
 }
}
