// Private in-memory provider binding, separate from public portfolio/watch data.
// No seed, storage, automatic connect, signature prompt or send API is exposed.
import bs58 from 'bs58';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
const sessions=new WeakMap();
function emit(doc){const EventType=doc.defaultView?.Event||globalThis.Event;if(EventType)doc.dispatchEvent?.(new EventType('jamd-web-wallet-session'));}
function accountIdentity(account){
 try{return typeof account?.address==='string'&&account.publicKey instanceof Uint8Array&&account.publicKey.length===32
  &&bs58.encode(account.publicKey)===account.address&&Array.isArray(account.chains)&&account.chains.includes('solana:mainnet');}catch{return false;}
}
function capable(wallet,account){
 try{
  const feature=wallet.features['solana:signTransaction'];
  return accountIdentity(account)&&Array.isArray(account.features)&&account.features.includes('solana:signTransaction')
   &&Array.isArray(wallet.chains)&&wallet.chains.includes('solana:mainnet')&&feature?.version==='1.0.0'
   &&typeof feature?.signTransaction==='function'&&Array.isArray(feature.supportedTransactionVersions)
   &&feature.supportedTransactionVersions.includes(0)&&feature.supportedTransactionVersions.includes('legacy')
   &&Array.isArray(wallet.accounts)&&wallet.accounts.some(value=>accountIdentity(value)&&value.address===account.address);
 }catch{return false;}
}
export function bindWebPerpsWalletSession(doc,wallet,account){
 sessions.delete(doc);
 if(capable(wallet,account))sessions.set(doc,{wallet,account,address:account.address,key:bs58.encode(account.publicKey)});
 emit(doc);return readWebPerpsWalletSession(doc);
}
export function clearWebPerpsWalletSession(doc){sessions.delete(doc);emit(doc);}
export function readWebPerpsWalletSession(doc){
 const session=sessions.get(doc),selected=selectedWalletAccount(doc);
 if(!session||selected?.source!=='external'||selected.address!==session.address)return null;
 let valid=false;try{valid=session.account.address===session.address&&bs58.encode(session.account.publicKey)===session.key&&capable(session.wallet,session.account);}catch{}
 if(!valid){
  sessions.delete(doc);return null;
 }
 return Object.freeze({address:session.address,walletName:String(session.wallet.name||'Wallet').slice(0,60),chain:'solana:mainnet',
  connected:true,supportsOwnerPartialSignature:true,transactionVersions:Object.freeze(['legacy',0]),readyForSigning:false,tradingEnabled:false});
}
