// Operator command only. Caller must stop the worker and use its exact private
// RuntimeDirectory so the shared worker.lock lease prevents concurrent startup.
import {upgradePausedEmptyPerpsJournal} from '../lib/perps-paused-journal-upgrade.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {checkPrivateRecoveryPath} from '../lib/perps-recovery-private-files.js';
let registry;
try{
 const args=process.argv.slice(2);
 if(args.length!==11||!['--controls','--journal','--lock-dir','--backups','--registry'].every((name,i)=>args[i*2]===name)||args[10]!=='--explicit-migration-approval')throw Error();
 checkPrivateRecoveryPath(args[9],false);registry=openPerpsBackupRegistry(args[9]);
 console.log(JSON.stringify(await upgradePausedEmptyPerpsJournal({controlsPath:args[1],journalPath:args[3],lockDirectory:args[5],backupDirectory:args[7],readBackupProof:who=>registry.readVerified(who),explicitMigrationApproval:true})));
}catch(error){console.error(JSON.stringify({code:'PERPS_PAUSED_JOURNAL_UPGRADE_UNAVAILABLE',phase:error?.phase??'INPUT'}));process.exitCode=1;}
finally{registry?.close();}
