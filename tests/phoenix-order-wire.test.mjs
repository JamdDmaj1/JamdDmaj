import test from 'node:test';
import assert from 'node:assert/strict';
import {getTransactionDecoder,getCompiledTransactionMessageDecoder} from '@solana/kit';
import {preparePhoenixOrderReview,preparePhoenixCloseReview,refreshPhoenixCloseReview} from '../lib/phoenix-order-review.js';
import {decodePhoenixMarketQuote} from '../lib/phoenix-market-quote.js';
import {buildPhoenixOrderWire,requirePhoenixUnsignedWire} from '../lib/phoenix-order-wire.js';
import {phoenixOrderFixture} from './helpers/phoenix-order-fixture.mjs';
import {phoenixTestKey,phoenixTraderBytes,phoenixRpcAccount} from './helpers/phoenix-chain-account-fixture.mjs';

test('local wire decodes independently with one zero signature and exact native instructions',async()=>{
 const f=await phoenixOrderFixture(),review=await preparePhoenixOrderReview(f.intent,f.deps);
 const wire=await buildPhoenixOrderWire(review,f.wireOptions),raw=Buffer.from(wire.serializedTxBase64,'base64');
 assert.ok(raw.length<=1232);assert.equal(raw[0],1);assert.ok(raw.subarray(1,65).every(b=>b===0));
 const decoded=getTransactionDecoder().decode(raw),message=getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
 assert.equal(message.version,'legacy');assert.equal(message.header.numSignerAccounts,1);assert.equal(message.staticAccounts[0],f.wallet);assert.equal(message.instructions.length,6);
 assert.equal(wire.maximumPriorityFeeLamports,'600');assert.equal(wire.readyForSigning,false);
 assert.equal(requirePhoenixUnsignedWire(wire).review,review);assert.throws(()=>requirePhoenixUnsignedWire({...wire}));
 f.advance(5000);assert.throws(()=>requirePhoenixUnsignedWire(wire),/EXPIRED/);
});
test('wallet close uses opposite side and exact chain size, ignoring caller-supplied quantity',async()=>{
 for(const baseLots of [-240n,240n]){
  const f=await phoenixOrderFixture({baseLots,virtualQuoteLots:baseLots<0n?30000000n:-30000000n});
  const review=await preparePhoenixCloseReview({...f.intent,closeBaseLots:'999999',side:baseLots<0n?'SHORT':'LONG'},f.deps);
  assert.equal(review.plan.close,true);assert.equal(review.plan.baseLots,'240');assert.equal(review.plan.side,baseLots<0n?'LONG':'SHORT');
  const wire=await buildPhoenixOrderWire(review,f.wireOptions),p=requirePhoenixUnsignedWire(wire);
  assert.equal(p.checked.instructions.length,1);assert.equal(f.deposits,0);
  const message=getCompiledTransactionMessageDecoder().decode(Buffer.from(wire.messageBase64,'base64'));
  assert.equal(message.instructions.length,3);
 }
});

test('server can refresh an expired close snapshot only with the same position and original tighter absolute bound',async()=>{
 const f=await phoenixOrderFixture(),previous=await preparePhoenixCloseReview(f.intent,f.deps);f.advance(6000);
 f.deps.publicClient.quote=async()=>decodePhoenixMarketQuote({symbol:'DOGE',timestamp_ms:f.now(),mark_price:0.13,oracle_price:0.13},{symbol:'DOGE',now:f.now()});
 const refreshed=await refreshPhoenixCloseReview(previous,f.deps);
 assert.ok(refreshed.expiresAt>f.now());assert.equal(refreshed.plan.baseLots,previous.plan.baseLots);
 assert.equal(refreshed.plan.packet.priceInTicks,previous.plan.packet.priceInTicks);
 assert.equal(refreshed.plan.referencePrice,'0.13');assert.equal(refreshed.plan.priceLimitUsd,previous.plan.priceLimitUsd);
 await assert.rejects(()=>refreshPhoenixCloseReview({...previous},f.deps),/UNVERIFIED/);
 f.map.set(f.a.trader,phoenixRpcAccount(f.map.get(f.a.trader).owner,phoenixTraderBytes({address:f.a.trader,baseLots:-241n})));
 await assert.rejects(()=>refreshPhoenixCloseReview(previous,f.deps),/CLOSE_CHANGED/);
});
test('close requires a live native position and refuses a foreign position authority',async()=>{
 const f=await phoenixOrderFixture({baseLots:0n,virtualQuoteLots:0n});await assert.rejects(()=>preparePhoenixCloseReview(f.intent,f.deps),/CLOSE_POSITION/);
 const g=await phoenixOrderFixture();g.map.set(g.a.trader,phoenixRpcAccount(g.map.get(g.a.trader).owner,phoenixTraderBytes({address:g.a.trader,positionAuthority:phoenixTestKey(88),baseLots:-240n})));
 await assert.rejects(()=>preparePhoenixCloseReview(g.intent,g.deps),/CLOSE_AUTHORITY/);
 await assert.rejects(()=>preparePhoenixCloseReview(g.intent,{...g.deps,readAccount:async()=>({walletAddress:g.wallet})}),/ACCOUNT_UNVERIFIED|PROOF_MISSING|ACCOUNT_PROOF/);
});
test('wire rejects forged review, excessive priority spending and unexpected signer',async()=>{
 const f=await phoenixOrderFixture(),review=await preparePhoenixOrderReview(f.intent,f.deps);
 await assert.rejects(()=>buildPhoenixOrderWire({...review},f.wireOptions),/REVIEW_EXPIRED/);
 for(const changes of [{computeUnitLimit:1400001},{computeUnitPriceMicroLamports:10001},{lastValidBlockHeight:0},{blockhash:'wrong'}])await assert.rejects(()=>buildPhoenixOrderWire(review,{...f.wireOptions,...changes}));
 const original=f.client.ixs.buildPlaceMarketOrder;
 f.client.ixs.buildPlaceMarketOrder=async params=>{const ix=await original(params);ix.accounts[3]={address:phoenixTestKey(99),role:2};return ix;};
 await assert.rejects(()=>buildPhoenixOrderWire(review,f.wireOptions),/BINDING/);
});
