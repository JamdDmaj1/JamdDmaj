// Offline development only; excluded from build-web. Never use with real funds.
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {sealTestSecret,openTestSecret} from './experimental-wallet-vault.js';
import {createDevnetTransferSession} from './experimental-devnet-transfer.js';

function publicAddress(seed){
  const pair=nacl.sign.keyPair.fromSeed(seed);
  try{return bs58.encode(pair.publicKey)}finally{pair.secretKey.fill(0)}
}
export function createTestWalletLifecycle(){
  let revision=0,phase='empty',secret=null,expected=null,backup=null,transfer=null;
  const wipe=()=>{secret?.fill(0);secret=null;};
  const ensure=ticket=>{if(ticket!==revision)throw new Error('operation-cancelled')};
  return Object.freeze({
    get state(){return Object.freeze({phase,network:'solana:devnet',productionReady:false})},
    async create(password){
      if(phase!=='empty')throw new Error('wallet-already-exists');
      const ticket=++revision;phase='creating';const seed=crypto.getRandomValues(new Uint8Array(32));
      try{
        const encrypted=await sealTestSecret(seed,password);ensure(ticket);
        expected=publicAddress(seed);backup=encrypted;phase='backup-required';
        return structuredClone(encrypted);
      }catch(error){if(ticket===revision)phase='empty';throw error}finally{seed.fill(0)}
    },
    async confirmRecovery(restoredBackup,password){
      if(phase!=='backup-required')throw new Error('backup-not-pending');
      const ticket=++revision;let restored;
      try{
        restored=await openTestSecret(restoredBackup,password);ensure(ticket);
        if(publicAddress(restored)!==expected)throw new Error('different-wallet');
        // Recovery must succeed before the wallet can be unlocked.
        phase='locked';
      }finally{restored?.fill(0)}
    },
    async unlock(password){
      if(phase!=='locked')throw new Error('wallet-not-locked');
      const ticket=++revision;let restored;
      try{restored=await openTestSecret(backup,password);ensure(ticket);if(publicAddress(restored)!==expected)throw new Error('different-wallet');secret=restored;restored=null;phase='unlocked';}
      finally{restored?.fill(0)}
    },
    async restore(encryptedBackup,password){
      if(phase!=='empty')throw new Error('wallet-already-exists');
      const ticket=++revision;phase='creating';let restored;
      try{
        const copy=structuredClone(encryptedBackup);
        restored=await openTestSecret(copy,password);ensure(ticket);
        expected=publicAddress(restored);backup=copy;phase='locked';
      }catch(error){if(ticket===revision)phase='empty';throw error}finally{restored?.fill(0)}
    },
    testAddress(){if(phase!=='unlocked'||!secret)throw new Error('wallet-locked');return Object.freeze({address:publicAddress(secret),network:'solana:devnet',testOnly:true})},
    transferSession(options={}){
      if(phase!=='unlocked'||!secret)throw new Error('wallet-locked');
      if(transfer&&['preparing','review','checking','submitting','submitted','uncertain'].includes(transfer.state.phase))throw new Error('request-pending');
      const ticket=revision,owner=publicAddress(secret);
      const isUnlocked=()=>phase==='unlocked'&&secret!==null&&ticket===revision;
      transfer=createDevnetTransferSession({...options,owner,isUnlocked,sign:message=>{
        if(!isUnlocked())throw new Error('wallet-locked');
        const pair=nacl.sign.keyPair.fromSeed(secret);
        try{return nacl.sign.detached(message,pair.secretKey)}finally{pair.secretKey.fill(0)}
      }});return transfer;
    },
    lock(){revision++;wipe();transfer?.cancelReview();if(phase==='unlocked')phase='locked';if(phase==='creating')phase='empty';},
    dispose(){revision++;wipe();expected=null;backup=null;phase='empty';}
  });
}
