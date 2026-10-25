import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,pbkdf2Sync} from 'node:crypto';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {deriveAndroidSolanaSeed,createWebWalletKeySession} from '../lib/web-wallet-keys.js';
import {sealPortableWalletBackup} from '../lib/portable-wallet-backup.js';
const entropy=new Uint8Array(32),password='Public test password, never funded';
// Independent BIP39 vector: 256 zero bits -> 23 abandon words, then art.
function independent(){
 const seed=pbkdf2Sync(Array(23).fill('abandon').concat('art').join(' '),'mnemonic',2048,64,'sha512');
 let node=createHmac('sha512','ed25519 seed').update(seed).digest();seed.fill(0);
 for(const child of [44,501,0,0]){const data=Buffer.alloc(37);node.copy(data,1,0,32);data.writeUInt32BE(child+0x80000000,33);const next=createHmac('sha512',node.subarray(32)).update(data).digest();node.fill(0);data.fill(0);node=next;}
 const key=Uint8Array.from(node.subarray(0,32));node.fill(0);return key;
}
test('recovers exact Android Solana derivation, not another account or BIP39 password',async()=>{
 const key=await deriveAndroidSolanaSeed(entropy),reference=independent();
 try{assert.deepEqual(key,reference);}finally{key.fill(0);reference.fill(0);}
});
test('unlock requires matching known address, expires and exposes no raw key or generic signer',async()=>{
 const seed=independent(),address=bs58.encode(ed25519.getPublicKey(seed));seed.fill(0);
 const backup=await sealPortableWalletBackup(entropy,password);let now=100;
 const session=createWebWalletKeySession({now:()=>now,lifetimeMs:1000});
 await assert.rejects(session.unlock(backup,password,'11111111111111111111111111111111'),/MISMATCH/);assert.equal(session.current(),null);
 assert.equal((await session.unlock(backup,password,address)).address,address);
 assert.deepEqual(Object.keys(session).sort(),['current','lock','signReviewed','unlock']);
 await assert.rejects(session.signReviewed({message:new Uint8Array([1])}),/APPROVAL_REQUIRED/);
 now=1100;assert.equal(session.current(),null);
 await session.unlock(backup,password,address);session.lock();assert.equal(session.current(),null);
});
test('locking during asynchronous recovery cannot resurrect the session',async()=>{
 const seed=independent(),address=bs58.encode(ed25519.getPublicKey(seed));seed.fill(0);
 const backup=await sealPortableWalletBackup(entropy,password),session=createWebWalletKeySession();
 const pending=session.unlock(backup,password,address);session.lock();await assert.rejects(pending,/LOCKED/);assert.equal(session.current(),null);
});
