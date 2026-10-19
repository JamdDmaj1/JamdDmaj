import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPerpsSignalFeed} from '../scripts/inspect-perps-signal-feed.mjs';
test('VPS inspection is an authenticated single GET and never returns secrets or readiness authority',async()=>{
 const feedToken='test-only-feed-token-123456789',time=Date.parse('2026-10-19T02:00:00Z');let calls=0;
 const result=await inspectPerpsSignalFeed({feedToken},{now:()=>time,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://www.jamddmaj.com/api/pro-client-feed');assert.equal(options.method,'GET');
  return Response.json({ok:true,clientFeed:true,generatedAt:new Date(time).toISOString(),executor:{livePaused:false},open:[]});
 }});
 assert.equal(calls,1);assert.equal(result.available,true);assert.equal(result.eligiblePublishedSignals,0);
 assert.equal(result.tradingEnabled,false);assert.equal(result.readyForSigning,false);assert.equal(JSON.stringify(result).includes(feedToken),false);
});
