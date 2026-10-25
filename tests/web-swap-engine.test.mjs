import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {createWebWalletKeySession,deriveAndroidSolanaSeed} from '../lib/web-wallet-keys.js';
import {sealPortableWalletBackup} from '../lib/portable-wallet-backup.js';
import {createWebSwapEngine} from '../lib/web-swap-engine.js';
import {openWebSwapJournal} from '../lib/web-swap-journal.js';
import {from64} from '../lib/web-swap-policy.js';
import {swapFixture} from './fixtures/web-swap.mjs';
const entropy=new Uint8Array(32),password='Public mock wallet, never funded';
async function fixture(nativeInput=true){
 const seed=await deriveAndroidSolanaSeed(entropy),address=bs58.encode(ed25519.getPublicKey(seed));seed.fill(0);
 const backup=await sealPortableWalletBackup(entropy,password),session=createWebWalletKeySession();await session.unlock(backup,password,address);
 const f=await swapFixture(address,{nativeInput}),journal=await openWebSwapJournal(new IDBFactory());let sends=0,fail=false,now=Date.now();
 const rpc=async(method,params)=>{if(method==='sendTransaction'){sends++;if(fail)throw Error('MOCK_TIMEOUT');const wire=from64(params[0]);assert.equal(ed25519.verify(wire.subarray(1,65),wire.subarray(65),bs58.decode(address)),true);return bs58.encode(wire.subarray(1,65));}return f.rpc(method,params);};
 const engine=createWebSwapEngine({rpc,journal,now:()=>now,fetchImpl:async url=>{assert.match(url,/^\/api\/swap-build\?/);return Response.json({ok:true,preparation:f.preparation});}});
 return {...f,address,session,journal,engine,sends:()=>sends,fail:()=>{fail=true;},expire:()=>{now=f.preparation.expiresAt;}};
}
for(const nativeInput of [true,false])test('review, explicit one-use approval, signature and durable mock submission '+nativeInput,async()=>{
 const f=await fixture(nativeInput);try{
  const review=await f.engine.prepare(f.intent);assert.equal(f.sends(),0);
  assert.throws(()=>f.engine.authorize(review,false),/APPROVAL_REQUIRED/);
  await assert.rejects(f.session.signReviewed({}),/APPROVAL_REQUIRED/);
  const grant=f.engine.authorize(review,true),signed=await f.session.signReviewed(grant);assert.equal(f.sends(),0);
  await assert.rejects(f.session.signReviewed(grant),/APPROVAL_REQUIRED/);
  const signature=await f.engine.submit(review,signed);assert.equal(f.sends(),1);assert.equal((await f.journal.read(f.address)).signature,signature);
  await assert.rejects(f.engine.submit(review,signed));assert.equal(f.sends(),1);
  await assert.rejects(f.engine.prepare(f.intent),/PENDING_CHECK/);
 }finally{f.session.lock();f.journal.close();}
});
test('ambiguous broadcast remains durable UNKNOWN and is never retried',async()=>{
 const f=await fixture();try{const review=await f.engine.prepare(f.intent),signed=await f.session.signReviewed(f.engine.authorize(review,true));f.fail();await assert.rejects(f.engine.submit(review,signed),/MOCK_TIMEOUT/);assert.equal((await f.journal.read(f.address)).state,'UNKNOWN');await assert.rejects(f.engine.prepare(f.intent),/PENDING_CHECK/);assert.equal(f.sends(),1);}finally{f.session.lock();f.journal.close();}
});
test('editing or expiry invalidates signing grants before any signature or send',async()=>{
 const f=await fixture();try{const review=await f.engine.prepare(f.intent),grant=f.engine.authorize(review,true);f.engine.invalidate();await assert.rejects(f.session.signReviewed(grant),/EXPIRED/);assert.equal(f.sends(),0);const second=await f.engine.prepare(f.intent),g=f.engine.authorize(second,true);f.expire();await assert.rejects(f.session.signReviewed(g),/EXPIRED/);assert.equal(f.sends(),0);}finally{f.session.lock();f.journal.close();}
});
test('journal reservation is atomic across two tabs and never stores a private key or wire',async()=>{
 const idb=new IDBFactory(),a=await openWebSwapJournal(idb),b=await openWebSwapJournal(idb),record={address:'public',signature:'public-signature',lastValidBlockHeight:'500'};
 try{const results=await Promise.allSettled([a.begin(record),b.begin(record)]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.deepEqual(Object.keys(await a.read('public')).sort(),['address','createdAt','lastValidBlockHeight','signature','state']);}finally{a.close();b.close();}
});
