// Read-only post-upgrade inspection; never imports a signer or requests activation.
import {DatabaseSync} from 'node:sqlite';
import {inspectExistingPerpsRuntimeDatabases,withLockedPerpsRuntimeRecoverySnapshot,readPerpsRuntimeRecoverySnapshot,inspectPerpsRuntimeRecoveryDatabases} from '../lib/perps-runtime-recovery.js';
import {openPerpsBackupRegistry,requireVerifiedPerpsCustodyBackup} from '../lib/perps-backup-registry.js';
import {checkPrivateRecoveryPath} from '../lib/perps-recovery-private-files.js';
const root='/var/lib/private/jamddmaj-perps-runtime';
const controlsPath='/var/lib/private/jamddmaj-perps-controls/controls.sqlite';
let controls,registry;
try {
 const runtime=inspectExistingPerpsRuntimeDatabases({controlsPath,journalPath:root+'/journal.sqlite'});
 checkPrivateRecoveryPath(root+'/backup.sqlite',false);
 controls=new DatabaseSync(controlsPath,{readOnly:true});
 const accounts=controls.prepare('SELECT owner,wallet,enabled,paused FROM perps_automation_controls').all();
 if(!accounts.length||accounts.some(row=>row.enabled!==0||row.paused!==1))throw Error('POST_UPGRADE_CHECK_REFUSED');
 registry=openPerpsBackupRegistry(root+'/backup.sqlite');
 for(const row of accounts){
  const who={ownerAccountHash:row.owner,walletAddress:row.wallet};
  const proof=requireVerifiedPerpsCustodyBackup(registry.readVerified(who),who);
  if(!proof.platformFeeStateIncluded||!proof.botSwapStateIncluded)throw Error('POST_UPGRADE_CHECK_REFUSED');
 }
 await withLockedPerpsRuntimeRecoverySnapshot({controlsPath,journalPath:root+'/journal.sqlite',feesPath:root+'/fees.sqlite',paymentsPath:root+'/payments.sqlite',swapsPath:root+'/swaps.sqlite',temporaryDirectory:root},handle=>{
  inspectPerpsRuntimeRecoveryDatabases(readPerpsRuntimeRecoverySnapshot(handle),{temporaryDirectory:root,identities:accounts.map(row=>({ownerAccountHash:row.owner,walletAddress:row.wallet}))});
 });
 console.log(JSON.stringify({stage:'POST_UPGRADE_RUNTIME_AND_BACKUP_REGISTRY_VERIFIED',runtime:runtime.stage,accountsVerified:accounts.length,allPaused:true,existingRestoreAttestationsRechecked:true,freshFinancialSnapshotRestoreInspection:true,newArchiveCreated:false,readyForSigning:false}));
} catch {console.error('POST_UPGRADE_CHECK_REFUSED');process.exitCode=1;}
finally {registry?.close();controls?.close();}
