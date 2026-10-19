// Private runtime callback for the existing owner's explicit activation flow.
// No HTTP, key creation, signing, submission or activation is performed here.
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
function fail(){throw Error('PERPS_EXECUTION_NOT_CONFIGURED');}
export function createServerPerpsActivationAuthorizer({controls,vault,backupRegistry,journal,readAccount,isExecutionRunning}={}){
 if(typeof controls?.read!=='function'||typeof vault?.describe!=='function'||typeof backupRegistry?.readVerified!=='function'
  ||typeof journal?.pending!=='function'||typeof journal?.openPositions!=='function'||typeof readAccount!=='function'||typeof isExecutionRunning!=='function')fail();
 return async function authorize(input){
  const {ownerAccountHash,walletAddress,revision,settings}=input,who={ownerAccountHash,walletAddress};
  function check(){
   if(isExecutionRunning()!==true)fail();
   const current=controls.read(who),identity=vault.describe(who);
   if(current.revision!==revision||JSON.stringify(current.settings)!==JSON.stringify(settings)||identity.exclusive!==true
    ||identity.purpose!=='jamddmaj-perps-automation'||identity.ownerAccountHash!==ownerAccountHash||identity.walletAddress!==walletAddress)fail();
   requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
   if(journal.pending(walletAddress).length)fail();
  }
  check();const dailyAccount=requireFreshServerPerpsDailyAccount(await readAccount(who),{walletAddress,journal});check();
  function revalidate(){
   check();requireFreshServerPerpsDailyAccount(dailyAccount,{walletAddress,journal});
   // A journalled position absent from the chain bank needs maintenance first,
   // not renewed consent that appears to resolve its exit/uncertainty.
   const positions=new Set(dailyAccount.positions.map(position=>position.address));
   if(journal.openPositions(walletAddress).some(row=>!positions.has(row.position_address)))fail();
  }
  revalidate();return Object.freeze({custodyAuthorized:true,executionReady:true,dailyAccount,revalidate});
 };
}
