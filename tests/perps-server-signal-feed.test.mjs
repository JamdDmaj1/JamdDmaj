import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPublishedServerPerpsSignals,readServerPerpsSignalFeed,requireFreshServerPerpsSignalFeed} from '../lib/perps-server-signal-feed.js';
import {evaluateAutomaticEntryQuality} from '../lib/automatic-entry-quality.js';
import {automaticEntryQualityDecision} from '../scripts/bitget-executor.mjs';
const now=Date.parse('2026-10-19T02:00:00Z'),feedToken='test-only-feed-token-123456789';
function signal(id='signal:SOL:1'){
 return {id,pair:'SOLUSDT',side:'LONG',status:'OPEN',score:12.5,entry:100,sl:95,tp1:110,contractMultiplier:1,
  createdAt:new Date(now-60000).toISOString(),telegramSentAt:new Date(now-59000).toISOString(),telegramMessageId:123,
  marketAlignment:'with-market',higherTrend:'bullish 4h alignment',microTrend:'bullish 15m alignment',volumeRatio:1.3,adx:26,spreadPercent:0.0015,liquidityUsd:25000000,freshness:{status:'fresh'},bitgetEligible:false};
}
function feed(open=[signal()]){return {ok:true,clientFeed:true,generatedAt:new Date(now).toISOString(),executor:{livePaused:false,minScore:12,minLiquidityUsd:3000000},open};}
test('Jupiter selects only published fresh supported signals, independently of Bitget flags, retaining Telegram exits',()=>{
 const a=signal(),b={...signal('signal:BTC:1'),pair:'BTCUSDT',score:13};
 const result=selectPublishedServerPerpsSignals(feed([a,b]),{now});
 assert.deepEqual(result.candidates.map(s=>s.id),[b.id,a.id]);assert.equal(result.candidates[1].sl,95);assert.equal(result.candidates[1].tp1,110);
 assert.equal(result.candidates[1].decision.ok,true);assert.equal(result.candidates[1].bitgetEligible,undefined);assert.ok(Object.isFrozen(result.candidates[1].decision));
 a.entry=200;assert.equal(result.candidates[1].entry,100);assert.equal(result.readyForSigning,false);assert.equal(result.tradingEnabled,false);
});
test('unpublished, closed, stale, future, unsupported, multiplied and weak candidates never reach preparation',()=>{
 const changes=[{telegramMessageId:null},{telegramSentAt:null},{status:'CLOSED'},{createdAt:new Date(now-300001).toISOString()},
  {telegramSentAt:new Date(now+2001).toISOString()},{telegramSentAt:new Date(now-100000).toISOString()},{pair:'XRPUSDT'},
  {contractMultiplier:1000},{side:'BUY'},{sl:101},{score:11.9},{marketAlignment:'counter-market'},{freshness:{status:'late'}},{score:NaN},{id:'unsafe\n'}];
 for(const change of changes){const result=selectPublishedServerPerpsSignals(feed([{...signal(),...change}]),{now});assert.equal(result.candidates.length,0,JSON.stringify(change));}
 const currentFeed=feed();currentFeed.generatedAt=new Date(now+300000).toISOString();
 assert.equal(selectPublishedServerPerpsSignals(currentFeed,{now:now+300000}).candidates.length,0);
});
test('paused feed stays paused and malformed, duplicated or stale feed snapshots fail closed',()=>{
 const paused=feed();paused.executor.livePaused=true;assert.equal(selectPublishedServerPerpsSignals(paused,{now}).remotePaused,true);
 for(const bad of [{...feed(),ok:false},{...feed(),clientFeed:false},{...feed(),executor:{}},{...feed(),open:[signal(),signal()]},
  {...feed(),generatedAt:new Date(now-15001).toISOString()},{...feed(),generatedAt:new Date(now+2001).toISOString()},
  {...feed(),executor:{...feed().executor,minScore:'NaN'}},{...feed(),open:Array.from({length:41},(_,i)=>signal(String(i)))}])assert.throws(()=>selectPublishedServerPerpsSignals(bad,{now}));
});
test('new strategy preserves conservative legacy filters without loading Bitget into the new reader',()=>{
 const gate={minLiquidityUsd:3000000};
 for(const change of [{},{score:11.9},{marketAlignment:'neutral-market'},{higherTrend:'bearish'},{microTrend:'bearish'},{volumeRatio:1.1},{adx:18},{spreadPercent:0},{liquidityUsd:0}]){
  const s={...signal(),...change};assert.deepEqual(evaluateAutomaticEntryQuality(s,gate),automaticEntryQualityDecision(s,gate));
 }
 assert.equal(evaluateAutomaticEntryQuality({...signal(),score:NaN},gate).ok,false);
 assert.equal(evaluateAutomaticEntryQuality(signal(),{minLiquidityUsd:NaN}).ok,false);
});
test('reader uses only the fixed authenticated read feed, bounds response, and expires its private proof',async()=>{
 const calls=[];let clock=0;
 const result=await readServerPerpsSignalFeed({feedToken},{now:()=>now,monotonicNow:()=>clock,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(feed());}});
 assert.equal(requireFreshServerPerpsSignalFeed(result),result);assert.throws(()=>requireFreshServerPerpsSignalFeed({...result}));
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://www.jamddmaj.com/api/pro-client-feed');
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');
 assert.equal(calls[0].options.headers['X-JamdDmaj-Client-Token'],feedToken);assert.equal(calls[0].options.body,undefined);
 assert.equal(JSON.stringify(result).includes(feedToken),false);clock=10001;assert.throws(()=>requireFreshServerPerpsSignalFeed(result));
});
test('authorization, transport, timeout and size failures never publish, retry or disclose a private error',async()=>{
 for(const make of [()=>new Response('error',{status:401}),()=>Response.json({}),()=>new Response('not json',{headers:{'Content-Type':'application/json'}}),()=>new Response('x'.repeat(1048577),{headers:{'Content-Type':'application/json'}}),()=>{throw Error('private-token-or-url');}]){
  let calls=0;await assert.rejects(readServerPerpsSignalFeed({feedToken},{now:()=>now,fetchImpl:async()=>{calls++;return make();}}),/^Error: PERPS_SIGNAL_FEED_UNAVAILABLE$/);assert.equal(calls,1);
 }
 let calls=0;for(const token of ['',undefined,'has space in token','x\n'.repeat(16)])await assert.rejects(readServerPerpsSignalFeed({feedToken:token},{fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
 let clock=0;await assert.rejects(readServerPerpsSignalFeed({feedToken},{now:()=>now,monotonicNow:()=>clock,fetchImpl:async()=>{clock=10001;return Response.json(feed());}}));
});
