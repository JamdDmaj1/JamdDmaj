import test from 'node:test';
import assert from 'node:assert/strict';
import {readPerpsMarketReference} from '../lib/perps-market-reference.js';
test('public reference is fetched without credentials and normalized to six decimals',async()=>{
 const price=await readPerpsMarketReference('BTC',{fetchImpl:async(url,options)=>{
  assert.match(url,/market-stats\?mint=3NZ9/);assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.method,'GET');return Response.json({price:'77837.87537206'});
 }});assert.equal(price,'77837.875372');
});
test('missing, malformed, redirected and failed references cannot become an order price',async()=>{
 for(const value of [{},{price:null},{price:100},{price:'NaN'},{price:'0'},{price:'1e5'},{price:'1000000000'}])await assert.rejects(readPerpsMarketReference('BTC',{fetchImpl:async()=>Response.json(value)}));
 await assert.rejects(readPerpsMarketReference('XRP',{fetchImpl:()=>{throw Error('must not fetch');}}));
 await assert.rejects(readPerpsMarketReference('BTC',{fetchImpl:async()=>new Response('',{status:503})}));
 await assert.rejects(readPerpsMarketReference('BTC',{fetchImpl:async()=>({ok:true,redirected:true})}));
});
