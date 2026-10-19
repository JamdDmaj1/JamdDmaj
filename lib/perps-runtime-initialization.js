// Explicit one-time operator setup, never called by startup, HTTP or restore.
// No user wallet, seed export, activation, network or transaction is created.
import {readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkPrivateRecoveryPath as check,makePrivateRecoveryDirectory as mkdir,writePrivateRecoveryFile as write,syncPrivateRecoveryDirectory as sync} from './perps-recovery-private-files.js';
import {createPerpsCustodyMasterKey} from './perps-custody-vault.js';
import {openPerpsAutomationControls} from './perps-automation-controls.js';
import {openPerpsExecutionJournal} from './perps-execution-journal.js';
import {openPerpsBackupRegistry} from './perps-backup-registry.js';
import {inspectExistingPerpsRuntimeDatabases} from './perps-runtime-recovery.js';
export const PERPS_RUNTIME_INITIALIZATION_MARKER='.perps-initialization-incomplete.json';
function fail(){throw Error('PERPS_RUNTIME_INITIALIZATION_UNAVAILABLE');}
export function initializeEmptyPerpsRuntime({directory,explicitInitializationApproval=false,allowNonPosixForTests=false}={}){
 const stores=[];
 try{
  if(process.platform==='win32'&&!allowNonPosixForTests||explicitInitializationApproval!==true)fail();
  directory=check(directory,true,allowNonPosixForTests).path;
  if(readdirSync(directory).length!==0)fail();
  // Exclusive creation arbitrates simultaneous installers. Keep this marker
  // on every partial failure: neither retry nor worker may rotate a lost key.
  const marker=join(directory,PERPS_RUNTIME_INITIALIZATION_MARKER);
  write(marker,JSON.stringify({version:1,stage:'INITIALIZATION_INCOMPLETE',instance:randomUUID()}),allowNonPosixForTests);
  const keys=mkdir(join(directory,'keys'),allowNonPosixForTests);
  mkdir(join(directory,'wallets'),allowNonPosixForTests);
  createPerpsCustodyMasterKey(join(keys,'master.key'),{allowNonPosixForTests});
  const paths=Object.fromEntries(['controls','journal','backup'].map(name=>[name,join(directory,name+'.sqlite')]));
  for(const path of Object.values(paths))write(path,Buffer.alloc(0),allowNonPosixForTests);
  stores.push(openPerpsAutomationControls(paths.controls));
  stores.push(openPerpsExecutionJournal(paths.journal));
  stores.push(openPerpsBackupRegistry(paths.backup,{allowNonPosixForTests}));
  for(const store of stores.reverse())store.close();stores.length=0;
  for(const path of Object.values(paths))check(path,false,allowNonPosixForTests);
  inspectExistingPerpsRuntimeDatabases({controlsPath:paths.controls,journalPath:paths.journal,allowNonPosixForTests});
  if(readdirSync(join(directory,'wallets')).length!==0)fail();
  const result=Object.freeze({stage:'EMPTY_RUNTIME_INITIALIZED',custodyWallets:0,backupVerified:false,fundingAvailable:false,readyForSigning:false,tradingEnabled:false});
  write(join(directory,'.perps-initialized.json'),JSON.stringify({version:1,...result}),allowNonPosixForTests);
  check(marker,false,allowNonPosixForTests);unlinkSync(marker);sync(directory);
  return result;
 }catch{fail();}finally{for(const store of stores)try{store.close();}catch{}}
}
