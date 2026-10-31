import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFairLaunchMessage,fairLaunchOwnerSignature,readFairLaunchTransaction,fairLaunchRecovery,fairLaunchExclusive} from '../lib/fair-launch-transaction.js';
import {ed25519} from '@noble/curves/ed25519.js';
import bs58 from 'bs58';
import {validateDevnetTokenRequest} from '../lib/solana-devnet-token.js';
const signature='2'.repeat(88);
test('cross-tab lock is mandatory and a busy tab cannot start another signing flow',async()=>{
 let started=0;await assert.rejects(fairLaunchExclusive(null,()=>started++),/UNAVAILABLE/);
 await assert.rejects(fairLaunchExclusive({request:async(name,options,run)=>{assert.equal(name,'jamd.fairLaunch.devnet');assert.equal(options.ifAvailable,true);return run(null);}},()=>started++),/BUSY/);
 assert.equal(started,0);await fairLaunchExclusive({request:async(n,o,run)=>run({name:n})},()=>started++);assert.equal(started,1);
});
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
 assert.equal(fairLaunchRecovery(storage).read().signature,signature);assert.throws(()=>store.save({signature:'3'.repeat(88),kind:'create'}),/PENDING/);store.clear('3'.repeat(88));assert.ok(store.read());store.clear(signature);assert.equal(store.read(),null);
 assert.throws(()=>fairLaunchRecovery({getItem(){return null;},setItem(){throw Error('storage blocked')}}).save({signature,kind:'create'}),/blocked/);
});
test('terminal results are recorded before clearing pending and remain available after reopen',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};const r=fairLaunchRecovery(storage);
 r.save({signature,kind:'create',mintAddress:'public-mint',policyAddress:'public-policy'});r.finish(signature,'confirmed');
 assert.equal(r.read(),null);assert.equal(fairLaunchRecovery(storage).receipts()[0].state,'confirmed');assert.throws(()=>r.finish(signature,'pending'),/INVALID/);
 r.save({signature:'3'.repeat(88),kind:'create'});storage.setItem=()=>{throw Error('STORAGE');};assert.throws(()=>r.finish('3'.repeat(88),'failed'),/STORAGE/);assert.ok(r.read());
});
test('uncertain send expires only after finalized height and a missing mint; outages preserve uncertainty',async()=>{
 const options={lastValidBlockHeight:'1000',mintAddress:'11111111111111111111111111111111'};
 for(const [height,account,state]of[[999,null,'pending'],[1001,{},'pending'],[1001,null,'expired']]){
  const methods=[];const result=await readFairLaunchTransaction(signature,{...options,fetchImpl:async(url,opt)=>{const q=JSON.parse(opt.body);methods.push(q.method);return {ok:true,json:async()=>({result:q.method==='getSignatureStatuses'?{value:[null]}:q.method==='getBlockHeight'?height:{value:account}})};}});
  assert.equal(result.state,state);assert.ok(!methods.includes('sendTransaction'));
 }
 await assert.rejects(readFairLaunchTransaction(signature,{...options,fetchImpl:async(url,opt)=>{const q=JSON.parse(opt.body);if(q.method==='getBlockHeight')throw Error('offline');return {ok:true,json:async()=>({result:{value:[null]}})};}}),/offline/);
});
