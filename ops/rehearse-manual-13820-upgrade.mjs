// Operator-only rehearsal on private copies. No signer, send or service restart.
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {upgradePausedEmptyPerpsJournal} from '../lib/perps-paused-journal-upgrade.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {checkPrivateRecoveryPath} from '../lib/perps-recovery-private-files.js';
const controlsPath='/var/lib/private/jamddmaj-perps-controls/controls.sqlite';
const journalPath='/var/lib/private/jamddmaj-perps-runtime/journal.sqlite';
const registryPath='/var/lib/private/jamddmaj-perps-runtime/backup.sqlite';
const parent='/var/lib/private/jamddmaj-perps-runtime';
const expected='505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9';
function fail(){throw Error('MANUAL_UPGRADE_REHEARSAL_REFUSED');}
function snapshot(){
 const controls=new DatabaseSync(controlsPath,{readOnly:true}),journal=new DatabaseSync(journalPath,{readOnly:true});
 try{
  const schema=journal.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row=>({...row,sql:row.sql?.replace(/\s+/g,' ').trim()}));
  const schemaHash=createHash('sha256').update(JSON.stringify(schema)).digest('hex');
  const rows=controls.prepare('SELECT * FROM perps_automation_controls ORDER BY owner').all();
  if(schemaHash!==expected||!rows.length||rows.some(row=>row.enabled!==0||row.paused!==1))fail();
  for(const {name} of journal.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
   if(!/^[a-z_]+$/.test(name)||journal.prepare('SELECT COUNT(*) AS n FROM '+name).get().n!==0)fail();
  }
  return JSON.stringify({schemaHash,rows});
 }finally{controls.close();journal.close();}
}
let registry;
try{
 if(process.platform!=='linux'||process.argv.slice(2).join(' ')!=='--rehearse')fail();
 for(const path of [controlsPath,journalPath,registryPath])checkPrivateRecoveryPath(path,false);
 checkPrivateRecoveryPath(parent,true);
 const before=snapshot(),work=mkdtempSync(join(parent,'manual-13820-rehearsal-'));chmodSync(work,0o700);checkPrivateRecoveryPath(work,true);
 const copies={};
 for(const [kind,path]of [['controls',controlsPath],['journal',journalPath]]){
  const source=new DatabaseSync(path,{readOnly:true}),destination=join(work,kind+'.sqlite');
  try{await backup(source,destination);chmodSync(destination,0o600);checkPrivateRecoveryPath(destination,false);copies[kind]=destination;}finally{source.close();}
 }
 if(snapshot()!==before)fail();
 registry=openPerpsBackupRegistry(registryPath);
 const result=await upgradePausedEmptyPerpsJournal({controlsPath:copies.controls,journalPath:copies.journal,lockDirectory:work,backupDirectory:work,
  readBackupProof:who=>registry.readVerified(who),explicitMigrationApproval:true});
 if(snapshot()!==before)fail();
 console.log(JSON.stringify({stage:'MANUAL_13820_UPGRADE_REHEARSAL_VERIFIED',sourceSchema:result.sourceSchema,targetSchema:result.targetSchema,
  accounts:result.accounts,liveStoresChanged:false,custodyKeysRead:false,tradingEnabled:false,readyForSigning:false}));
}catch(error){console.error(JSON.stringify({stage:'MANUAL_13820_UPGRADE_REHEARSAL_FAILED',phase:error.phase??null}));process.exitCode=1;}
finally{registry?.close();}
