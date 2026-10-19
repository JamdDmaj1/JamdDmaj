// Isolated fixture worker ONLY. Refuses all paths outside its test temporary
// directory and never creates a master key, signs or performs network requests.
import {realpathSync} from 'node:fs';
import {dirname,basename,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {openPerpsCustodyVault} from '../../lib/perps-custody-vault.js';
import {openPerpsAutomationControls} from '../../lib/perps-automation-controls.js';
import {createPerpsCustodyProvisioner} from '../../lib/perps-custody-provisioning.js';
let controls;
try{
 const input=JSON.parse(process.argv[2]),parent=realpathSync(dirname(input.options.directory));
 if(dirname(parent)!==realpathSync(tmpdir())||!/^jamd-provision-[A-Za-z0-9_-]+$/.test(basename(parent))
  ||resolve(input.options.directory)!==join(parent,'wallets')||resolve(input.options.keyFile)!==join(parent,'keys','master.key')
  ||resolve(input.path)!==join(parent,'controls.sqlite')||realpathSync(input.options.directory)!==join(parent,'wallets')
  ||realpathSync(input.options.keyFile)!==join(parent,'keys','master.key')||realpathSync(input.path)!==join(parent,'controls.sqlite'))throw Error();
 controls=openPerpsAutomationControls(input.path,{now:()=>input.now});
 const value=createPerpsCustodyProvisioner({vault:openPerpsCustodyVault(input.options),controls}).provision(input.request);
 console.log(JSON.stringify({ok:true,wallet:value.walletAddress}));
}catch{console.log(JSON.stringify({ok:false}));}
finally{controls?.close();}
