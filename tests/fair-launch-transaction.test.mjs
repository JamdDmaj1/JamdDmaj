import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFairLaunchMessage,fairLaunchOwnerSignature,readFairLaunchTransaction,fairLaunchRecovery} from '../lib/fair-launch-transaction.js';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {validateDevnetTokenRequest} from '../lib/solana-devnet-token.js';
const signature='2'.repeat(88);
test('custom design settings cannot silently execute a different fixed Devnet policy',()=>{
 const config={network:'solana-token-2022',totalSupply:1000000,decimals:6,revokeMintAuthority:true,disableFreezeAuthority:true,creatorLockPercent:100};
 const wallet={features:{'solana:signTransaction':{supportedTransactionVersions:[0],signTransaction(){}}}};
 assert.ok(validateDevnetTokenRequest(config,wallet,{address:'11111111111111111111111111111111'}).some(e=>e.includes('creatorLockPercent')));
 assert.ok(validateDevnetTokenRequest({...config,creatorLockPercent:85,releaseMonths:60},wallet,{}).some(e=>e.includes('releaseMonths')));
});
test('only a valid fee-payer signature can become a recoverable submitted intent',()=>{
 const secret=new Uint8Array(32).fill(7),owner=bs58.encode(ed25519.getPublicKey(secret)),messageBytes=new Uint8Array([1,2,3]),signature=ed25519.sign(messageBytes,secret);
 assert.equal(fairLaunchOwnerSignature({messageBytes,signatures:{[owner]:signature}},owner),bs58.encode(signature));
 assert.throws(()=>fairLaunchOwnerSignature({messageBytes:new Uint8Array([1,2,4]),signatures:{[owner]:signature}},owner),/INVALID/);
 assert.throws(()=>fairLaunchOwnerSignature({messageBytes,signatures:{[owner]:new Uint8Array(64)}},owner),/INVALID/);
});
test('wallet must return the reviewed message exactly, including instruction order and blockhash',()=>{
 const a={messageBytes:new Uint8Array([1,2,3])};assert.doesNotThrow(()=>assertFairLaunchMessage(a,{messageBytes:new Uint8Array([1,2,3])}));
 for(const b of [null,{}, {messageBytes:new Uint8Array([1,3,2])},{messageBytes:new Uint8Array([1,2,3,4])}])assert.throws(()=>assertFairLaunchMessage(a,b),/CHANGED/);
});
test('submitted, missing, failed and confirmed statuses are distinct; only Devnet reads occur',async()=>{
 for(const [value,state]of[[null,'pending'],[{err:null,confirmationStatus:'processed'},'pending'],[{err:null,confirmationStatus:'confirmed'},'confirmed'],[{err:null,confirmationStatus:'finalized'},'confirmed'],[{err:{InstructionError:[0,1]}},'failed']]){
 const r=await readFairLaunchTransaction(signature,{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.devnet.solana.com');assert.equal(JSON.parse(options.body).method,'getSignatureStatuses');return {ok:true,json:async()=>({result:{value:[value]}})};}});assert.equal(r.state,state);
 }
 await assert.rejects(readFairLaunchTransaction('bad'),/SIGNATURE/);
 await assert.rejects(readFairLaunchTransaction(signature,{fetchImpl:async()=>({ok:false})}),/UNAVAILABLE/);
 await assert.rejects(readFairLaunchTransaction(signature,{fetchImpl:async()=>({ok:true,json:async()=>({result:{value:[{}]}})})}),/UNAVAILABLE/);
});
test('pending recovery survives reopen and cannot erase another signature',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const store=fairLaunchRecovery(storage);store.save({signature,kind:'create',mintAddress:'public-mint',policyAddress:'public-policy'});
 assert.equal(fairLaunchRecovery(storage).read().signature,signature);store.clear('3'.repeat(88));assert.ok(store.read());store.clear(signature);assert.equal(store.read(),null);
 assert.throws(()=>fairLaunchRecovery({setItem(){throw Error('storage blocked')}}).save({signature,kind:'create'}),/blocked/);
});
