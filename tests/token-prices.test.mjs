import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/token-prices.js';
test('invalid identifiers are rejected before fetching',async()=>{
 const r=await handler(new Request('https://example.com/api/token-prices?ids=../secret'));assert.equal(r.status,400);
});
test('prices stay bound to coin IDs and unavailable values are omitted',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({zama:{usd:0.09},bitcoin:{usd:80000},unknown:{usd:0}}));
 try{const r=await handler(new Request('https://example.com/api/token-prices?ids=zama,unknown'));assert.deepEqual(await r.json(),{zama:{usd:0.09}});}finally{globalThis.fetch=original;}
});
