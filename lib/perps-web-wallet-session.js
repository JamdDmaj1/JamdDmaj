// Private in-memory provider binding, separate from public portfolio/watch data.
// No seed, storage, automatic connect, signature prompt or send API is exposed.
import bs58 from 'bs58';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {consumeWebPerpsOwnerSignatureAuthorization} from './perps-web-signing-review.js';
import {webPerpsBytes,webPerpsBase64} from './perps-web-envelope.js';
import {consumeWebCloseSignatureAuthorization} from './perps-web-close-client.js';
export {createWebCloseClient,authorizeWebCloseSignature,submitSignedWebClose} from './perps-web-close-client.js';
export {openWebCloseJournal} from './perps-web-close-journal.js';
// Keep the review issuer, grants, journal and provider binding in this SAME
// browser bundle; a separately bundled grant map could never authorize signing.
export {createWebPerpsSigningReviewClient,authorizeWebPerpsOwnerSignature,readWebPerpsOwnerSignature,claimWebPerpsServerHandoff,consumeWebPerpsServerHandoff} from './perps-web-signing-review.js';
export {openWebPerpsSigningJournal} from './perps-web-signing-journal.js';
export {createWebPerpsOperationStatusClient} from './perps-web-operation-status-client.js';
const sessions=new WeakMap(),bindings=new WeakMap();
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
   &&feature.supportedTransactionVersions.some(version=>version===0||version==='legacy')
   &&Array.isArray(wallet.accounts)&&wallet.accounts.some(value=>accountIdentity(value)&&value.address===account.address);
 }catch{return false;}
}
export function bindWebPerpsWalletSession(doc,wallet,account){
 sessions.delete(doc);
 if(capable(wallet,account)){
  const binding=Object.freeze({}),session={wallet,account,address:account.address,key:bs58.encode(account.publicKey),binding};
  sessions.set(doc,session);bindings.set(binding,{doc,session});
 }
 emit(doc);return readWebPerpsWalletSession(doc);
}

export function requireWebPerpsWalletSigningBinding(binding,doc,{current=true}={}){
 const proof=bindings.get(binding);if(!proof||proof.doc!==doc||current&&(sessions.get(doc)!==proof.session||readWebPerpsWalletSession(doc)===null))throw Error('WEB_PERPS_WALLET_SESSION_REQUIRED');
 return Object.freeze({address:proof.session.address});
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
  connected:true,supportsOwnerPartialSignature:true,transactionVersions:Object.freeze([...new Set(session.wallet.features['solana:signTransaction'].supportedTransactionVersions.filter(version=>version===0||version==='legacy'))]),readyForSigning:false,tradingEnabled:false});
}

export async function signReviewedWebPerpsOrder(doc,grant){
 const session=sessions.get(doc),publicSession=readWebPerpsWalletSession(doc);
 if(!session||!publicSession)throw Error('WEB_PERPS_WALLET_SESSION_REQUIRED');
 const authorization=consumeWebPerpsOwnerSignatureAuthorization(grant,doc);
 const feature=session.wallet.features['solana:signTransaction'];
 if(authorization.packet.review.walletAddress!==session.address||!feature.supportedTransactionVersions.includes(authorization.transactionVersion))throw Error('WEB_PERPS_WALLET_VERSION_UNSUPPORTED');
 authorization.revalidate();
 // Sign-only. Never use signAndSendTransaction, an injected global provider,
 // a message signature or a transaction modified by a wallet/relayer.
 const result=await feature.signTransaction({account:session.account,chain:'solana:mainnet',transaction:webPerpsBytes(authorization.packet.preparation.serializedTxBase64),
  options:{preflightCommitment:'confirmed',minContextSlot:authorization.packet.review.observedSlot}});
 if(!Array.isArray(result)||result.length!==1||!(result[0]?.signedTransaction instanceof Uint8Array)||result[0].signedTransaction.length>1232)throw Error('INVALID_WEB_PERPS_OWNER_SIGNATURE');
 return authorization.record(webPerpsBase64(result[0].signedTransaction),session.binding);
}
export async function signReviewedWebClose(doc,grant){
 const session=sessions.get(doc),publicSession=readWebPerpsWalletSession(doc);if(!session||!publicSession)throw Error('WEB_PERPS_WALLET_SESSION_REQUIRED');
 const authorization=consumeWebCloseSignatureAuthorization(grant,doc),feature=session.wallet.features['solana:signTransaction'];
 if(authorization.packet.walletAddress!==session.address||!feature.supportedTransactionVersions.includes(authorization.version))throw Error('WEB_PERPS_WALLET_VERSION_UNSUPPORTED');
 await authorization.revalidate();requireWebPerpsWalletSigningBinding(session.binding,doc);
 const result=await feature.signTransaction({account:session.account,chain:'solana:mainnet',transaction:webPerpsBytes(authorization.packet.material.serializedTxBase64),options:{preflightCommitment:'confirmed',minContextSlot:authorization.packet.observedSlot}});
 if(!Array.isArray(result)||result.length!==1||!(result[0]?.signedTransaction instanceof Uint8Array)||result[0].signedTransaction.length>1232)throw Error('INVALID_WEB_PERPS_OWNER_SIGNATURE');
 return authorization.record(webPerpsBase64(result[0].signedTransaction),session.binding);
}
