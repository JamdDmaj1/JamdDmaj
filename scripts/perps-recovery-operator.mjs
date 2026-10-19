#!/usr/bin/env node
// Initialize an OPERATOR encryption identity, or restore an authenticated
// archive into a fresh quarantined directory. Never prints private key bytes,
// enables automation, releases quarantine, signs or submits transactions.
import {initializePerpsOperatorRecovery,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {readPrivateRecoveryFile} from '../lib/perps-recovery-private-files.js';
import {createHash} from 'node:crypto';
try{
 const args=process.argv.slice(2);let result;
 if(args.length===3&&args[0]==='init'&&args[1]==='--directory')result=await initializePerpsOperatorRecovery({directory:args[2]});
 else if(args.length===9&&args[0]==='restore'&&args[1]==='--directory'&&args[3]==='--archive'&&args[5]==='--destination'&&args[7]==='--expected-sha256'){
  if(!/^[a-f0-9]{64}$/.test(args[8]))throw Error();
  const ciphertext=readPrivateRecoveryFile(args[4],24*1024*1024+65536);
  if(createHash('sha256').update(ciphertext).digest('hex')!==args[8])throw Error();
  result=await restorePerpsCustodyRecoveryArchive({ciphertext,operatorDirectory:args[2],destinationDirectory:args[6],explicitOperatorApproval:true});
 }else throw Error();
 console.log(JSON.stringify(result));
}catch{console.error('PERPS_OPERATOR_RECOVERY_UNAVAILABLE');process.exitCode=1;}
