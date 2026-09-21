import test from 'node:test';
import assert from 'node:assert/strict';
import {getBitgetPublicReview} from '../lib/bitget-public-review.js';
const now=1000000;
const mock=(status='normal',ts=now)=>async(url,options)=>{
 assert.equal(options.method,'GET');assert.equal(new URL(url).hostname,'api.bitget.com');
 return {ok:true,json:async()=>({code:'00000',data:url.includes('/contracts?')?[{symbol:'BTCUSDT',symbolStatus:status,quoteCoin:'USDT',supportMarginCoins:['USDT']}]:[{symbol:'BTCUSDT',lastPr:'60000',ts}]})};
};
test('public quote returns matching fresh contract without placing orders',async()=>{
 const quote=await getBitgetPublicReview('BTCUSDT',mock(),()=>now);assert.equal(quote.price,60000);assert.equal(quote.orderSubmitted,false);
});
test('blocked contracts and stale quotes fail closed',async()=>{
 await assert.rejects(()=>getBitgetPublicReview('BTCUSDT',mock('restrictedAPI'),()=>now));
 await assert.rejects(()=>getBitgetPublicReview('BTCUSDT',mock('normal',now-31000),()=>now));
 await assert.rejects(()=>getBitgetPublicReview('../BTCUSDT',mock(),()=>now));
});
