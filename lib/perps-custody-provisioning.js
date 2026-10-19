// Private server coordinator. ownerAccountHash MUST come from the verified
// session adapter, never from user JSON. No key/bootstrap, backup export,
// transfer, activation, signature or transaction transport is performed here.
import {validateServerPerpsAutomationSettings} from './perps-automation-controls.js';
import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {checkPrivateRecoveryPath} from './perps-recovery-private-files.js';
function fail(){throw Error('PERPS_CUSTODY_PROVISIONING_UNAVAILABLE');}
function inputValue(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['ownerAccountHash','settings','explicitCustodyApproval'].includes(key))
  ||typeof input.ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(input.ownerAccountHash)||input.explicitCustodyApproval!==true)fail();
 return {ownerAccountHash:input.ownerAccountHash,settings:validateServerPerpsAutomationSettings(input.settings)};
}
// Single-host runtime only: its exclusive worker lock and this synchronous
// method serialize admission. This is not a distributed multi-process quota.
// Count every private directory entry conservatively, including orphaned
// records, so failed control writes cannot bypass the creation/storage limit.
export function createBoundedPerpsCustodyProvisioner({directory,vault,controls,maximumWalletFiles=20,allowNonPosixForTests=false}={}){
 if(!Number.isSafeInteger(maximumWalletFiles)||maximumWalletFiles<1||maximumWalletFiles>256)fail();
 directory=checkPrivateRecoveryPath(directory,true,allowNonPosixForTests).path;
 const provisioner=createPerpsCustodyProvisioner({vault,controls});
 return Object.freeze({provision(input){
  const {ownerAccountHash}=inputValue(input);
  checkPrivateRecoveryPath(directory,true,allowNonPosixForTests);
  // Never rotate or block recovery of an already persisted owner identity.
  if(!controls.readForOwner({ownerAccountHash})&&!existsSync(join(directory,'owner-'+ownerAccountHash+'.json'))
    &&readdirSync(directory).length>=maximumWalletFiles)throw Error('PERPS_CUSTODY_CAPACITY_REACHED');
  return provisioner.provision(input);
 }});
}
export function createPerpsCustodyProvisioner({vault,controls}={}){
 if(typeof vault?.createOrReadExclusiveWallet!=='function'||typeof vault?.describe!=='function'
  ||typeof controls?.readForOwner!=='function'||typeof controls?.provision!=='function')fail();
 function verifiedIdentity(ownerAccountHash,walletAddress){
  const value=vault.describe({ownerAccountHash,walletAddress});
  if(value?.ownerAccountHash!==ownerAccountHash||value.walletAddress!==walletAddress||value.exclusive!==true||value.purpose!=='jamddmaj-perps-automation')fail();
 }
 function result(state){return Object.freeze({stage:'EXCLUSIVE_CUSTODY_BACKUP_VERIFICATION_REQUIRED',walletAddress:state.walletAddress,
  controls:state,activationChanged:false,backupVerified:false,fundingAvailable:false,readyForSigning:false});}
 return Object.freeze({
  provision(input){
   try{
    const {ownerAccountHash,settings}=inputValue(input);
    const previous=controls.readForOwner({ownerAccountHash});
    if(previous){verifiedIdentity(ownerAccountHash,previous.walletAddress);return result(previous);}
    const wallet=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
    if(wallet?.ownerAccountHash!==ownerAccountHash||wallet.exclusive!==true||wallet.purpose!=='jamddmaj-perps-automation')fail();
    verifiedIdentity(ownerAccountHash,wallet.walletAddress);
    try{controls.provision({ownerAccountHash,walletAddress:wallet.walletAddress,settings});}
    catch{
     // A competing request or a lost response may already have committed the
     // exact same owner/wallet. Never create another key or reset its settings.
     const recovered=controls.readForOwner({ownerAccountHash});if(!recovered||recovered.walletAddress!==wallet.walletAddress)fail();
    }
    const current=controls.readForOwner({ownerAccountHash});
    if(!current||current.walletAddress!==wallet.walletAddress)fail();verifiedIdentity(ownerAccountHash,current.walletAddress);
    return result(current);
   }catch{fail();}
  }
 });
}
