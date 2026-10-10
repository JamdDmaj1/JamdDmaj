import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{normalizeDepth} from '../api/market-depth.js';
test('order book sorts levels and rejects stale, crossed or malformed books',()=>{
  const data={ts:Date.now(),asks:[[12,1],[11,2]],bids:[[9,2],[10,1]]};
  assert.equal(normalizeDepth(data).asks[0].price,11);
  assert.equal(normalizeDepth(data).bids[0].price,10);
  for(const bad of [{...data,ts:1},{...data,asks:[[8,1]]},{...data,bids:[[9,-1]]},{...data,asks:[]}])assert.throws(()=>normalizeDepth(bad));
});
test('depth accepts only read-only valid symbols and fixed upstream',async t=>{
  let called='';t.mock.method(globalThis,'fetch',async url=>{called=url;return Response.json({code:'00000',data:{ts:Date.now(),asks:[[11,1]],bids:[[10,2]]}});});
  assert.equal((await handler(new Request('https://app/api/market-depth?symbol=../../'))).status,400);
  assert.equal((await handler(new Request('https://app/api/market-depth?symbol=BTCUSDT',{method:'POST'}))).status,405);
  const r=await handler(new Request('https://app/api/market-depth?symbol=BTCUSDT'));
  assert.equal(r.status,200);assert.equal((await r.json()).symbol,'BTCUSDT');assert.match(called,/^https:\/\/api.bitget.com\/api\/v2\/mix\/market\/merge-depth\?/);
});
