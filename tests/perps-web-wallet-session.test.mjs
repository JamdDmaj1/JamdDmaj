import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {selectWalletAccount} from '../lib/wallet-portfolio-store.js';
import {bindWebPerpsWalletSession,readWebPerpsWalletSession,clearWebPerpsWalletSession} from '../lib/perps-web-wallet-session.js';
function fixture(){
 const events=[],doc={dispatchEvent:e=>events.push(e.type)},publicKey=Uint8Array.from({length:32},()=>51),address=bs58.encode(publicKey),calls={sign:0};
 const account={address,publicKey,chains:['solana:mainnet'],features:['solana:signTransaction']};
 const wallet={name:'Phantom fixture',chains:['solana:mainnet'],accounts:[account],features:{'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:['legacy',0],signTransaction:()=>{calls.sign++;throw Error('must not be called');}}}};
 selectWalletAccount(doc,{address,source:'external',name:'Phantom fixture'});return {doc,events,account,wallet,calls,address};
}
test('a public watch address alone never becomes a Phantom signing session',()=>{
 const f=fixture();assert.equal(readWebPerpsWalletSession(f.doc),null);
 const session=bindWebPerpsWalletSession(f.doc,f.wallet,f.account);assert.equal(session.connected,true);assert.equal(session.readyForSigning,false);assert.equal(session.tradingEnabled,false);
 assert.equal(session.address,f.address);assert.equal(Object.hasOwn(session,'wallet'),false);assert.equal(Object.hasOwn(session,'signTransaction'),false);assert.equal(f.calls.sign,0);
 assert(Object.isFrozen(session));assert(f.events.includes('jamd-web-wallet-session'));
 clearWebPerpsWalletSession(f.doc);assert.equal(readWebPerpsWalletSession(f.doc),null);
});
test('provider state is document-local and requires the selected external account, never the native wallet',()=>{
 const f=fixture();bindWebPerpsWalletSession(f.doc,f.wallet,f.account);
 assert.equal(readWebPerpsWalletSession({}),null);
 selectWalletAccount(f.doc,{address:f.address,source:'native',name:'native'});assert.equal(readWebPerpsWalletSession(f.doc),null);
 selectWalletAccount(f.doc,{address:bs58.encode(Uint8Array.from({length:32},()=>52)),source:'external',name:'another'});assert.equal(readWebPerpsWalletSession(f.doc),null);
 assert.equal(f.calls.sign,0);
});
test('network, public key, account capabilities, current accounts and transaction version support are mandatory',()=>{
 for(const change of [
  f=>{f.account.chains=['solana:devnet'];},f=>{f.wallet.chains=['solana:devnet'];},f=>{f.account.publicKey=new Uint8Array(31);},f=>{f.account.publicKey[0]^=1;},
  f=>{f.account.features=[];},f=>{f.wallet.accounts=[];},f=>{f.wallet.features['solana:signTransaction'].version='unknown';},
  f=>{f.wallet.features['solana:signTransaction'].supportedTransactionVersions=[];},f=>{f.wallet.features['solana:signTransaction'].supportedTransactionVersions=[1];},
  f=>{f.wallet.features['solana:signTransaction'].signTransaction=undefined;}
 ]){const f=fixture();change(f);assert.equal(bindWebPerpsWalletSession(f.doc,f.wallet,f.account),null);assert.equal(f.calls.sign,0);}
});
test('a wallet supporting only the actual legacy or v0 format is not rejected for lacking the other format',()=>{
 for(const version of ['legacy',0]){const f=fixture();f.wallet.features['solana:signTransaction'].supportedTransactionVersions=[version];assert.deepEqual(bindWebPerpsWalletSession(f.doc,f.wallet,f.account).transactionVersions,[version]);}
});
test('changed, disconnected or malformed provider accounts invalidate the original binding instead of reusing a saved address',()=>{
 for(const change of [f=>{f.wallet.accounts=[];},f=>{f.account.chains=[];},f=>{f.account.publicKey=null;},f=>{f.account.address='changed';},f=>{f.wallet.features={};}]){
  const f=fixture();assert(bindWebPerpsWalletSession(f.doc,f.wallet,f.account));change(f);assert.equal(readWebPerpsWalletSession(f.doc),null);assert.equal(f.calls.sign,0);
 }
});
