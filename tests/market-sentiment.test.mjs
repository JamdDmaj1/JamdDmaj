import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSentiment} from '../api/market-sentiment.js';
test('sentiment is sourced, Bitcoin-scoped and timestamped without invented trends',()=>{
 const now=Date.now(),body={data:[{value:'53',timestamp:String(Math.floor(now/1000))}]};
 const result=parseSentiment(body,now);assert.equal(result.value,53);assert.equal(result.scope,'bitcoin');assert.equal(result.source,'Alternative.me');
 for(const row of [{value:101},{value:-1},{value:1.2},{timestamp:1},{timestamp:Math.floor(now/1000)+1000}])assert.throws(()=>parseSentiment({data:[{...body.data[0],...row}]},now));
 assert.throws(()=>parseSentiment({data:[]}));
});
