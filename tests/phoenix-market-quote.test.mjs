import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePhoenixMarketQuote,requirePhoenixMarketQuote} from '../lib/phoenix-market-quote.js';
import {decodePhoenixCatalog} from '../lib/phoenix-market-plan.js';
import {createPhoenixPublicClient} from '../lib/phoenix-public-client.js';
import {preparePhoenixOrderReview,buildPhoenixReviewedInstructions} from '../lib/phoenix-order-review.js';
const now=1800000000000;
const row={symbol:'DOGE',timestamp_ms:now-100,mark_price:0.12345678,oracle_price:0.1235};
const quote=(extra={})=>decodePhoenixMarketQuote({...row,...extra},{symbol:'DOGE',now});

test('quote binds native symbol, source timestamp and fresh nonzero prices',()=>{
 const q=quote();assert.equal(q.referencePrice,'0.12345678');assert.equal(q.readyForSigning,false);
 assert.equal(requirePhoenixMarketQuote(q,{symbol:'DOGE',now}),q);
 for(const patch of [{symbol:'SOL'},{timestamp_ms:now-10001},{timestamp_ms:now+2001},{timestamp_ms:NaN},{mark_price:0},{mark_price:Infinity},{oracle_price:0},{mark_price:0.3}])assert.throws(()=>quote(patch));
 assert.throws(()=>requirePhoenixMarketQuote({...q},{symbol:'DOGE',now}),/EXPIRED/);
 assert.throws(()=>requirePhoenixMarketQuote(q,{symbol:'SOL',now}),/EXPIRED/);
 assert.throws(()=>requirePhoenixMarketQuote(q,{symbol:'DOGE',now:now+5000}),/EXPIRED/);
});
test('small market price resolution is retained, never rounded into a different risk',()=>{
 assert.equal(quote({mark_price:0.0000001,oracle_price:0.0000001}).referencePrice,'0.0000001');
 assert.equal(quote({mark_price:0.0000014,oracle_price:0.0000014}).referencePrice,'0.0000014');
 assert.throws(()=>quote({mark_price:1e-19,oracle_price:1e-19}),/RESOLUTION/);
});
test('public quotes use fixed read-only origin and reject path or symbol injection before fetch',async()=>{
 const calls=[],client=createPhoenixPublicClient({now:()=>now,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,text:async()=>JSON.stringify(row)};}});
 await client.quote('DOGE');assert.equal(calls[0].url,'https://perp-api.phoenix.trade/v1/market/DOGE/stats/latest');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.credentials,'omit');
 for(const symbol of ['../send','DOGE?x=1','https://evil.test'])await assert.rejects(()=>client.quote(symbol));
 assert.equal(calls.length,1);
});
test('review ignores caller price and packet; no unproven close or expired evidence',async()=>{
 const catalog=decodePhoenixCatalog([{symbol:'DOGE',assetId:7,marketStatus:'active',metadata:{assetClass:'crypto'},marketPubkey:'Hqt5Vom5L3X3RcKysKnBmLAvjYgo6TGAwoheW658h5cz',splinePubkey:'Fg5UGzY7pJ39zKCsJkcMnvX4kxroZb2waKDusM4RwihS',tickSize:1,baseLotsDecimals:0,takerFee:0.00035,leverageTiers:[{maxLeverage:10,maxSizeBaseLots:1000000}]}],{observedAt:now});
 const intent={walletAddress:'11111111111111111111111111111112',symbol:'DOGE',side:'LONG',marginUsdcUnits:'10000000',leverageTenths:30,clientOrderId:'1',isolatedSubaccountIndex:1,referencePrice:'999999',packet:{priceInTicks:1n}};
 const deps={publicClient:{catalog:async()=>catalog,quote:async()=>quote()},readSlot:async()=>1000,now:()=>now};
 const r=await preparePhoenixOrderReview(intent,deps);assert.equal(r.plan.referencePrice,'0.12345678');assert.equal(r.withdrawalMayQueue,true);assert.equal(r.readyForSigning,false);assert.equal(r.expiresAt,now+5000);
 await assert.rejects(()=>buildPhoenixReviewedInstructions({...r},{now:()=>now}),/REVIEW_EXPIRED/);
 await assert.rejects(()=>buildPhoenixReviewedInstructions(r,{now:()=>now+5000}),/REVIEW_EXPIRED/);
 let clock=now;
 const client={ixs:{buildPlaceMarketOrder:async()=>{clock+=6000;throw Error('TEST_NO_BUILD_AFTER_EXPIRY');}}};
 await assert.rejects(()=>buildPhoenixReviewedInstructions(r,{client,now:()=>clock}),/TEST_NO_BUILD_AFTER_EXPIRY/);
 await assert.rejects(()=>preparePhoenixOrderReview({...intent,closeBaseLots:'1'},deps),/POSITION_PROOF/);
 await assert.rejects(()=>preparePhoenixOrderReview(intent,{...deps,now:()=>now+6000}),/EXPIRED/);
});
