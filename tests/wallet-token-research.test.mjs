import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/wallet-token-research.js';
const mint='So11111111111111111111111111111111111111112';
test('research keeps exact mint identity and sources historical candles and verification independently',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));
  if(String(url).includes('dexscreener'))return Response.json([{chainId:'solana',pairAddress:mint,baseToken:{address:mint},priceUsd:'10',liquidity:{usd:100}}]);
  if(String(url).includes('jup.ag'))return Response.json([{id:mint,isVerified:true}]);
  return Response.json({data:{attributes:{ohlcv_list:[[1700000000,10,12,9,11,5],[1700003600,11,13,10,12,5],[1,0,0,0,0,0]]}}});
 };
 try{
  const response=await handler(new Request('https://example.test/api/wallet-token-research?mint='+mint));
  const data=await response.json();assert.equal(data.mint,mint);assert.equal(data.verification.status,'verified');assert.equal(data.candles.length,2);assert.match(data.chartSource,/GeckoTerminal/);assert.equal(calls.length,3);
  await handler(new Request('https://example.test/api/wallet-token-research?mint='+mint));assert.equal(calls.length,3);
 }finally{globalThis.fetch=original;}
});
test('rejects invalid identifiers and mutation methods',async()=>{
 assert.equal((await handler(new Request('https://example.test/?mint=bad'))).status,400);
 assert.equal((await handler(new Request('https://example.test/',{method:'POST'}))).status,405);
});
