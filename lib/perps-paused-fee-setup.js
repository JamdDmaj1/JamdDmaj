// Operator-only empty fee-store setup. No custody keys, network, activation,
// mandate, assessment or payment. A new inclusive recovery proof is required.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,lstatSync,unlinkSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write,syncPrivateRecoveryDirectory as sync} from './perps-recovery-private-files.js';
import {inspectExistingPerpsRuntimeDatabases,inspectExistingPerpsFeeDatabases} from './perps-runtime-recovery.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {openPerpsExecutionJournal} from './perps-execution-journal.js';
import {openPerpsPlatformFeeJournal} from './perps-platform-fee-journal.js';
import {openPerpsPlatformFeePaymentJournal} from './perps-platform-fee-payment-journal.js';

export function preparePausedPerpsFeeStores({controlsPath,journalPath,swapsPath,feesPath,paymentsPath,lockDirectory,readBackupProof,explicitOperatorApproval=false,now=Date.now,allowNonPosixForTests=false}={}){
 if(explicitOperatorApproval!==true||typeof readBackupProof!=='function'||typeof now!=='function')throw Error('PAUSED_FEE_SETUP_APPROVAL_REQUIRED');
 let lease,leaseStat,journal,fee,payment,started=false,complete=false;const opened=[],locked=[];
 try{
  const paths=[controlsPath,journalPath,swapsPath,feesPath,paymentsPath].map(p=>resolve(p));
  if(new Set(paths).size!==paths.length)throw Error();
  for(const p of paths)check(dirname(p),true,allowNonPosixForTests);
  for(const p of [controlsPath,journalPath,swapsPath])check(p,false,allowNonPosixForTests);
  check(lockDirectory,true,allowNonPosixForTests);
  if(existsSync(feesPath)||existsSync(paymentsPath))throw Error(); // Never overwrite or repair partial stores.
  lease=join(lockDirectory,'worker.lock');write(lease,JSON.stringify({stage:'PAUSED_FEE_SETUP',instance:randomUUID(),pid:process.pid}),allowNonPosixForTests);leaseStat=lstatSync(lease,{bigint:true});
  inspectExistingPerpsRuntimeDatabases({controlsPath,journalPath,allowNonPosixForTests});
  journal=openPerpsExecutionJournal(journalPath);
  const dbs=new Map();for(const p of [controlsPath,journalPath,swapsPath].sort()){
   const db=new DatabaseSync(p,{timeout:250});opened.push(db);db.exec('PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE');locked.push(db);dbs.set(p,db);
  }
  const accounts=dbs.get(controlsPath).prepare('SELECT owner,wallet,enabled,paused FROM perps_automation_controls').all();
  if(!accounts.length||accounts.length>256||accounts.some(r=>r.enabled!==0||r.paused!==1))throw Error();
  const risk=dbs.get(journalPath);
  for(const [table,condition]of [
   ['perps_reservations',"state IN('RESERVED','SIGNING','UNCERTAIN','OPEN')"],
   ['perps_position_closes',"state='PREPARED'"],
   ['perps_position_close_executions',"state IN('SIGNING','UNCERTAIN')"],
   ['perps_close_conversions',"state!='FINALIZED'"],
   ['perps_exit_cancellations',"state IN('PREPARED','SIGNING','UNCERTAIN')"],
   ['perps_platform_fee_locks',"state='HELD'"]])if(risk.prepare('SELECT 1 FROM '+table+' WHERE '+condition+' LIMIT 1').get())throw Error();
  if(dbs.get(swapsPath).prepare("SELECT 1 FROM bot_wallet_swaps WHERE state IN('SIGNING','UNKNOWN') LIMIT 1").get())throw Error();
  const verifiedAt=now();if(!Number.isSafeInteger(verifiedAt))throw Error();
  for(const row of accounts){const who={ownerAccountHash:row.owner,walletAddress:row.wallet},proof=requireVerifiedPerpsCustodyBackup(readBackupProof(who),who);
   if(!proof.botSwapStateIncluded||proof.verifiedAt<verifiedAt-900000||proof.verifiedAt>verifiedAt+2000)throw Error();
  }
  started=true;fee=openPerpsPlatformFeeJournal(feesPath,{entryJournal:journal});payment=openPerpsPlatformFeePaymentJournal(paymentsPath);
  payment.close();payment=null;fee.close();fee=null;
  inspectExistingPerpsFeeDatabases({feesPath,paymentsPath,allowNonPosixForTests});complete=true;
  return Object.freeze({stage:'PAUSED_FEE_STORES_PREPARED',accounts:accounts.length,controlsChanged:false,custodyKeysRead:false,newRecoveryVerificationRequired:true,tradingEnabled:false,readyForSigning:false});
 }catch{throw Error('PAUSED_FEE_SETUP_UNAVAILABLE');}
 finally{
  for(const db of locked.reverse())try{db.exec('ROLLBACK');}catch{}
  for(const db of opened.reverse())try{db.close();}catch{}
  payment?.close();fee?.close();journal?.close();
  if(leaseStat&&(!started||complete)){const stat=lstatSync(lease,{bigint:true});if(stat.ino!==leaseStat.ino||stat.dev!==leaseStat.dev)throw Error('PAUSED_FEE_SETUP_LEASE_CHANGED');unlinkSync(lease);sync(lockDirectory);}
 }
}
