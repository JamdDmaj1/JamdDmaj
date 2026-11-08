import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import bs58 from 'bs58';
import {preparePhoenixOrderReview,preparePhoenixCloseReview} from '../lib/phoenix-order-review.js';
import {buildPhoenixOrderWire} from '../lib/phoenix-order-wire.js';
import {capturePhoenixSignedOrder,reconcilePhoenixOrder,archivePhoenixSignedOrder,restorePhoenixSignedOrder,requirePhoenixFinalizedOrder} from '../lib/phoenix-order-receipt.js';
import {phoenixOrderFixture} from './helpers/phoenix-order-fixture.mjs';
import {phoenixEventBatches} from './helpers/phoenix-event-batches.mjs';

async function fixture({close=false}={}){
 // Ephemeral test-only key, no filesystem or network. Never a custody key.
 const keys=generateKeyPairSync('ed25519'),wallet=bs58.encode(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const f=await phoenixOrderFixture({wallet,baseLots:close?-240n:0n,virtualQuoteLots:close?30000000n:0n});
 const review=close?await preparePhoenixCloseReview(f.intent,f.deps):await preparePhoenixOrderReview(f.intent,f.deps);
 const wire=await buildPhoenixOrderWire(review,f.wireOptions),signed=Buffer.from(wire.serializedTxBase64,'base64');
 sign(null,signed.subarray(65),keys.privateKey).copy(signed,1);
 const proof=capturePhoenixSignedOrder(wire,signed.toString('base64')),plan=review.plan;
 const quote=BigInt(plan.baseLots)*123456n,fee=(quote*350n+999999n)/1000000n;
 const tx={slot:1001,transaction:[signed.toString('base64'),'base64'],meta:{err:null,fee:5600,
  innerInstructions:phoenixEventBatches({wire,plan,traderAddress:f.a.trader,slot:1001,timestamp:Math.floor(f.now()/1000),quote,fee,
   postBase:close?0n:BigInt(plan.baseLots),postVirtual:close?0n:-quote,postCollateral:close?10010000n:BigInt(plan.marginUsdcUnits)-fee})}};
 let status={slot:1001,confirmationStatus:'finalized',err:null},result=tx;
 const calls=[];
 const request=async(method,params)=>{
  calls.push(method);
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  assert.equal(params[0][0]===proof.signature||params[0]===proof.signature,true);
  if(method==='getSignatureStatuses')return {context:{slot:1002},value:[status]};
  if(method==='getTransaction'){assert.equal(params[1].commitment,'finalized');return result;}
  throw Error('UNEXPECTED_NETWORK_METHOD');
 };
 return {...f,proof,wire,plan,signed,tx,request,calls,setStatus(s){status=s;},setTx(t){result=t;}};
}

test('exact finalized signed order remains reconcilable after review expiry',async()=>{
 const f=await fixture();f.advance(60000);
 const result=await reconcilePhoenixOrder(f.proof,{request:f.request});
 assert.equal(result.state,'POSITION_OPEN');assert.equal(result.fill.baseLotsFilled,f.plan.baseLots);
 assert.equal(result.walletCredited,false);assert.equal(result.mayRetry,false);
 assert.deepEqual(f.calls,['getGenesisHash','getSignatureStatuses','getTransaction','getGenesisHash']);
});

test('flat close receipt is not a wallet payout receipt',async()=>{
 const f=await fixture({close:true}),result=await reconcilePhoenixOrder(f.proof,{request:f.request});
 assert.equal(result.state,'POSITION_CLOSED');assert.equal(result.walletCredited,false);assert.equal(result.requiresCollateralReconciliation,true);
});

test('absent, merely confirmed or unavailable finalized transaction stays unresolved without resend',async()=>{
 const f=await fixture();
 for(const status of [null,{slot:1001,confirmationStatus:'confirmed',err:null}]){
  f.setStatus(status);const result=await reconcilePhoenixOrder(f.proof,{request:f.request});
  assert.equal(result.state,'UNKNOWN');assert.equal(result.mayRetry,false);
 }
 f.setStatus({slot:1001,confirmationStatus:'finalized',err:null});f.setTx(null);
 assert.equal((await reconcilePhoenixOrder(f.proof,{request:f.request})).state,'UNKNOWN');
 assert.ok(f.calls.every(m=>!m.startsWith('send')));
});

test('invalid signature, changed message, forged proof and another finalized wire reject',async()=>{
 const f=await fixture(),bad=Buffer.from(f.signed);bad[1]^=1;
 assert.throws(()=>capturePhoenixSignedOrder(f.wire,bad.toString('base64')),/SIGNATURE/);
 bad[bad.length-1]^=1;assert.throws(()=>capturePhoenixSignedOrder(f.wire,bad.toString('base64')),/WIRE/);
 await assert.rejects(()=>reconcilePhoenixOrder({...f.proof},{request:f.request}),/UNVERIFIED/);
 f.tx.transaction[0]=bad.toString('base64');await assert.rejects(()=>reconcilePhoenixOrder(f.proof,{request:f.request}),/TRANSACTION/);
});

test('finalized failure charges no platform fee and conflicting failure evidence rejects',async()=>{
 const f=await fixture(),error={InstructionError:[5,{Custom:1}]};
 f.tx.meta.err=error;await assert.rejects(()=>reconcilePhoenixOrder(f.proof,{request:f.request}),/STATUS_CONFLICT/);
 f.setStatus({slot:1001,confirmationStatus:'finalized',err:error});
 const result=await reconcilePhoenixOrder(f.proof,{request:f.request});
 assert.equal(result.state,'FAILED');assert.equal(result.platformFeeDueUnits,'0');assert.equal(result.walletCredited,false);
});

test('success without native fill evidence, fee corruption and wrong network cannot finalize',async()=>{
 const f=await fixture();f.tx.meta.innerInstructions=[];
 await assert.rejects(()=>reconcilePhoenixOrder(f.proof,{request:f.request}),/EVENTS_GROUP/);
 f.tx.meta.fee=20000;await assert.rejects(()=>reconcilePhoenixOrder(f.proof,{request:f.request}),/TRANSACTION/);
 await assert.rejects(()=>reconcilePhoenixOrder(f.proof,{request:async()=> 'testnet'}),/NETWORK/);
});

test('accepted transaction with zero fill is not a position and cannot collect a platform fee',async()=>{
 const f=await fixture();
 f.tx.meta.innerInstructions=phoenixEventBatches({wire:f.wire,plan:{...f.plan,baseLots:'0'},traderAddress:f.a.trader,
  slot:1001,timestamp:Math.floor(f.now()/1000),quote:0n,fee:0n,postBase:0n,postVirtual:0n,postCollateral:10000000n});
 const result=await reconcilePhoenixOrder(f.proof,{request:f.request});
 assert.equal(result.state,'NO_FILL');assert.equal(result.platformFeeDueUnits,'0');
 assert.equal(result.requiresCollateralReconciliation,true);assert.equal(result.walletCredited,false);
});

test('archived exact wire reconstructs read-only reconciliation after expiry, not signing authority',async()=>{
 for(const close of [false,true]){
  const f=await fixture({close}),archive=JSON.parse(JSON.stringify(archivePhoenixSignedOrder(f.proof)));
  f.advance(60000);const restored=await restorePhoenixSignedOrder(archive);
  assert.equal(restored.signature,f.proof.signature);assert.equal(restored.readyForTrading,false);
  assert.equal(restored.restoredForReadOnlyReconciliation,true);
  const result=await reconcilePhoenixOrder(restored,{request:f.request});
  assert.equal(requirePhoenixFinalizedOrder(result,{signature:f.proof.signature}),result);
  assert.throws(()=>requirePhoenixFinalizedOrder({...result}),/UNVERIFIED/);
  assert.throws(()=>requirePhoenixFinalizedOrder(result,{signature:'another'}),/UNVERIFIED/);
 }
});

test('archive cannot substitute wallet, child, direction, amount, expiry, flags or signature',async()=>{
 const f=await fixture(),archive=archivePhoenixSignedOrder(f.proof);
 for(const change of [{walletAddress:bs58.encode(new Uint8Array(32).fill(2))},{isolatedSubaccountIndex:2},{side:'SHORT'},
  {baseLots:'999'},{marginUsdcUnits:'1'},{marginUsdcUnits:'11000000'},{priceInTicks:'1'},{clientOrderId:'2'},{lastValidSlot:'2000'},
  {close:true},{serializedTxBase64:Buffer.from(f.wire.serializedTxBase64,'base64').toString('base64')}]){
  await assert.rejects(()=>restorePhoenixSignedOrder({...archive,...change}));
 }
});
