// Explicit operator-only empty-schema upgrade. No signer or network transport.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readStoppedServiceAdmission} from './manual-13820-admission.js';
import {upgradePausedEmptyPerpsJournal} from '../lib/perps-paused-journal-upgrade.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {checkPrivateRecoveryPath} from '../lib/perps-recovery-private-files.js';
const directory='/var/lib/private/jamddmaj-perps-runtime';
const controlsPath='/var/lib/private/jamddmaj-perps-controls/controls.sqlite';
const journalPath=directory+'/journal.sqlite',registryPath=directory+'/backup.sqlite';
function fail(){throw Error('MANUAL_13820_UPGRADE_REFUSED');}
let registry,phase='ARGUMENTS';
try{
 if(process.platform!=='linux'||process.argv.slice(2).join(' ')!=='--apply-reviewed-empty-upgrade')fail();
 phase='ROOT_MAINTENANCE_ADMISSION';readStoppedServiceAdmission();
 phase='PRIVATE_PATHS';
 for(const path of [controlsPath,journalPath,registryPath])checkPrivateRecoveryPath(path,false);
 checkPrivateRecoveryPath(directory,true);checkPrivateRecoveryPath('/run/jamddmaj-perps-runtime',true);
 phase='SOURCE_SCHEMA';const db=new DatabaseSync(journalPath,{readOnly:true});
 try{
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row=>({...row,sql:row.sql?.replace(/\s+/g,' ').trim()}));
  if(createHash('sha256').update(JSON.stringify(schema)).digest('hex')!=='505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9')fail();
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
   if(!/^[a-z_]+$/.test(name)||db.prepare('SELECT COUNT(*) AS n FROM '+name).get().n!==0)fail();
  }
 }finally{db.close();}
 phase='BACKUP_REGISTRY';registry=openPerpsBackupRegistry(registryPath);
 phase='ATOMIC_LIBRARY';
 const result=await upgradePausedEmptyPerpsJournal({controlsPath,journalPath,lockDirectory:'/run/jamddmaj-perps-runtime',backupDirectory:directory,
  readBackupProof:who=>{readStoppedServiceAdmission();const proof=registry.readVerified(who);if(proof.platformFeeStateIncluded!==true||proof.botSwapStateIncluded!==true)fail();return proof;},
  explicitMigrationApproval:true});
 console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({stage:'MANUAL_13820_UPGRADE_REFUSED',phase:error.phase??phase,code:/^[A-Z0-9_]+$/.test(error.message??'')?error.message:'OPERATOR_CHECK_FAILED'}));process.exitCode=1;}
finally{registry?.close();}
