// Private server coordinator. ownerAccountHash MUST come from the verified
// session adapter, never from user JSON. No key/bootstrap, backup export,
// transfer, activation, signature or transaction transport is performed here.
import {validateServerPerpsAutomationSettings} from './perps-automation-controls.js';
function fail(){throw Error('PERPS_CUSTODY_PROVISIONING_UNAVAILABLE');}
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
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['ownerAccountHash','settings','explicitCustodyApproval'].includes(key))
     ||typeof input.ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(input.ownerAccountHash)||input.explicitCustodyApproval!==true)fail();
    const {ownerAccountHash}=input,settings=validateServerPerpsAutomationSettings(input.settings);
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
