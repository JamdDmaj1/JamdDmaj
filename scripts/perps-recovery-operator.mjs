#!/usr/bin/env node
// Initialize an OPERATOR encryption identity, or restore an authenticated
// archive into a fresh quarantined directory. Never prints private key bytes,
// enables automation, releases quarantine, signs or submits transactions.
import {initializePerpsOperatorRecovery,restorePerpsCustodyRecoveryArchive,createPerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {readPrivateRecoveryFile,writePrivateRecoveryFile,checkPrivateRecoveryPath} from '../lib/perps-recovery-private-files.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {parseRecoveryArchiveStores} from '../lib/perps-recovery-cli-stores.js';
let registry;
try{
 const args=process.argv.slice(2);let result;
 if(args.length===3&&args[0]==='init'&&args[1]==='--directory')result=await initializePerpsOperatorRecovery({directory:args[2]});
 else if(args.length===9&&args[0]==='restore'&&args[1]==='--directory'&&args[3]==='--archive'&&args[5]==='--destination'&&args[7]==='--expected-sha256'){
  if(!/^[a-f0-9]{64}$/.test(args[8]))throw Error();
  const ciphertext=readPrivateRecoveryFile(args[4],24*1024*1024+65536);
  if(createHash('sha256').update(ciphertext).digest('hex')!==args[8])throw Error();
  result=await restorePerpsCustodyRecoveryArchive({ciphertext,operatorDirectory:args[2],destinationDirectory:args[6],explicitOperatorApproval:true});
 }else if([15,17,19,21].includes(args.length)&&args[0]==='archive'&&['--directory','--key-file','--controls','--journal','--recipient-file','--registry','--output'].every((key,index)=>args[1+index*2]===key)){
  const stores=parseRecoveryArchiveStores(args);
  if(new Set([4,6,8,10,12,14].map(index=>resolve(args[index]))).size!==6)throw Error();
  if(!args[12].endsWith('.sqlite')||!args[14].endsWith('.age'))throw Error();
  const recipient=readPrivateRecoveryFile(args[10],256).toString('utf8').trim();
  const archive=await createPerpsCustodyRecoveryArchive({directory:args[2],keyFile:args[4],recipient,explicitOperatorApproval:true,requireRestoreProof:true,runtimePaths:{controlsPath:args[6],journalPath:args[8],temporaryDirectory:dirname(args[12]),...stores}});
  registry=openPerpsBackupRegistry(args[12]);await registry.registerArchive(archive,{explicitOperatorApproval:true});writePrivateRecoveryFile(args[14],archive.ciphertext);
  result={stage:'ENCRYPTED_BACKUP_AWAITING_OPERATOR_RESTORE',archiveSha256:archive.sha256,output:args[14],backupVerified:false,readyForSigning:false};
 }else if(args.length===7&&args[0]==='verify'&&args[1]==='--registry'&&args[3]==='--proof'&&args[5]==='--expected-archive'){
  if(!/^[a-f0-9]{64}$/.test(args[6]))throw Error();checkPrivateRecoveryPath(args[2],false);registry=openPerpsBackupRegistry(args[2]);
  result=registry.acceptRestoreProof({proofFile:args[4],expectedArchiveSha256:args[6],explicitOperatorApproval:true});
 }else throw Error();
 console.log(JSON.stringify(result));
}catch{console.error('PERPS_OPERATOR_RECOVERY_UNAVAILABLE');process.exitCode=1;}
finally{registry?.close();}
