#!/usr/bin/env node
// This initialization creates an OPERATOR encryption identity, not a Solana
// wallet or financial signing key. It never prints private key bytes.
import {initializePerpsOperatorRecovery} from '../lib/perps-custody-recovery.js';
try{
 if(process.argv.length!==5||process.argv[2]!=='init'||process.argv[3]!=='--directory')throw Error();
 console.log(JSON.stringify(await initializePerpsOperatorRecovery({directory:process.argv[4]})));
}catch{console.error('PERPS_OPERATOR_RECOVERY_UNAVAILABLE');process.exitCode=1;}
