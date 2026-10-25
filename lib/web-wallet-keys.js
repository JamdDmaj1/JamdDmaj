// Private in-memory Solana recovery. Same BIP39/SLIP-0010 profile as Android.
// Not a generic signer: transaction approval is a separate, branded boundary.
import {entropyToMnemonic,mnemonicToSeedWebcrypto} from '@scure/bip39';
import {wordlist} from '@scure/bip39/wordlists/english.js';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {openPortableWalletBackup} from './portable-wallet-backup.js';
import {consumeWebSwapGrant,signedSwapWire} from './web-swap-engine.js';
async function hmac(key,data){
 const imported=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-512'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',imported,data));
}
export async function deriveAndroidSolanaSeed(entropy){
 if(!(entropy instanceof Uint8Array)||entropy.length!==32)throw Error('INVALID_WALLET_ENTROPY');
 let mnemonic=entropyToMnemonic(entropy,wordlist),seed,node;
 try{
  seed=await mnemonicToSeedWebcrypto(mnemonic,'');mnemonic='';
  node=await hmac(new TextEncoder().encode('ed25519 seed'),seed);
  for(const child of [44,501,0,0]){
   const data=new Uint8Array(37);data.set(node.subarray(0,32),1);new DataView(data.buffer).setUint32(33,child+0x80000000,false);
   let next;try{next=await hmac(node.subarray(32),data);}finally{data.fill(0);}
   node.fill(0);node=next;
  }
  return node.slice(0,32);
 }finally{mnemonic='';seed?.fill(0);node?.fill(0);}
}
// Closure owns the key. Never attaches it to DOM, window, storage or an account.
export function createWebWalletKeySession({now=Date.now,lifetimeMs=300000}={}){
 if(!Number.isSafeInteger(lifetimeMs)||lifetimeMs<1||lifetimeMs>300000)throw Error('INVALID_UNLOCK_LIFETIME');
 let secret=null,address=null,expires=0,epoch=0,timer;
 function lock(){epoch++;clearTimeout(timer);secret?.fill(0);secret=null;address=null;expires=0;}
 function current(){if(secret&&now()>=expires)lock();return secret?Object.freeze({address,expiresAt:expires,network:'solana:mainnet'}):null;}
 async function unlock(backup,password,expectedAddress){
  lock();const ticket=epoch;let entropy,derived;
  try{
   // Require an independently known address: never silently replace a wallet.
   if(typeof expectedAddress!=='string'||expectedAddress.length<32||expectedAddress.length>44||bs58.decode(expectedAddress).length!==32)throw Error('EXPECTED_WALLET_REQUIRED');
   entropy=await openPortableWalletBackup(backup,password);derived=await deriveAndroidSolanaSeed(entropy);
   const actual=bs58.encode(ed25519.getPublicKey(derived));
   if(actual!==expectedAddress)throw Error('RECOVERED_WALLET_MISMATCH');
   if(epoch!==ticket)throw Error('WALLET_LOCKED');
   secret=derived;derived=null;address=actual;expires=now()+lifetimeMs;
   timer=setTimeout(lock,lifetimeMs);timer?.unref?.();return current();
  }finally{entropy?.fill(0);derived?.fill(0);}
 }
 async function signReviewed(grant){
  const identity=current(),ticket=epoch;if(!identity)throw Error('WALLET_LOCKED');
  const approval=await consumeWebSwapGrant(grant,identity.address);
  if(!current()||epoch!==ticket)throw Error('WALLET_LOCKED');approval.current();
  let signature;try{signature=ed25519.sign(approval.message,secret);if(!current()||epoch!==ticket)throw Error('WALLET_LOCKED');approval.current();return signedSwapWire(approval.message,signature);}
  finally{signature?.fill(0);approval.message.fill(0);}
 }
 return Object.freeze({unlock,lock,current,signReviewed});
}
