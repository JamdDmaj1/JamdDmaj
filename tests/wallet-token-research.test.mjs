import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/wallet-token-research.js';
const mint='So11111111111111111111111111111111111111112';
test('research keeps exact mint identity and sources historical candles and verification independently',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async url=>{calls.push(String(url));
  if(String(url).includes('dexscreener'))return Response.json([{chainId:'solana',pairAddress:mint,baseToken:{address:mint,name:'Solana',symbol:'SOL'},quoteToken:{symbol:'USDC'},dexId:'example',priceUsd:'10',liquidity:{usd:100},marketCap:123000,fdv:456000,txns:{h24:{buys:0,sells:3}},priceChange:{h1:-2,h6:4},pairCreatedAt:1700000000000}]);
  if(String(url).includes('jup.ag'))return Response.json([{id:mint,isVerified:true}]);
  return Response.json({data:{attributes:{ohlcv_list:[[1700000000,10,12,9,11,5],[1700003600,11,13,10,12,5],[1,0,0,0,0,0]]}}});
 };
 try{
  const response=await handler(new Request('https://example.test/api/wallet-token-research?mint='+mint));
  const data=await response.json();assert.equal(data.mint,mint);assert.equal(data.verification.status,'verified');assert.equal(data.candles.length,2);assert.match(data.chartSource,/GeckoTerminal/);assert.equal(calls.length,3);
  assert.equal(data.market.marketCapUsd,123000);assert.equal(data.market.fdvUsd,456000);assert.equal(data.market.buys24h,0);assert.equal(data.market.sells24h,3);assert.equal(data.market.volume24h,null);assert.equal(data.market.change1h,-2);assert.equal(data.market.name,'Solana');
  await handler(new Request('https://example.test/api/wallet-token-research?mint='+mint));assert.equal(calls.length,3);
 }finally{globalThis.fetch=original;}
});
test('rejects invalid identifiers and mutation methods',async()=>{
 assert.equal((await handler(new Request('https://example.test/?mint=bad'))).status,400);
 assert.equal((await handler(new Request('https://example.test/',{method:'POST'}))).status,405);
});

test('FDV never substitutes for missing capitalization; invalid metrics stay unknown',async()=>{
 const original=globalThis.fetch,m='11111111111111111111111111111111';
 globalThis.fetch=async url=>String(url).includes('dexscreener')?Response.json([{chainId:'solana',pairAddress:m,baseToken:{address:m},fdv:100,marketCap:null,liquidity:{usd:-1},volume:{h24:''},txns:{h24:{buys:false}}}]):Response.json([]);
 try{const data=await (await handler(new Request('https://example.test/?mint='+m))).json();assert.equal(data.market.marketCapUsd,null);assert.equal(data.market.fdvUsd,100);assert.equal(data.market.liquidityUsd,null);assert.equal(data.market.volume24h,null);assert.equal(data.market.buys24h,null);}finally{globalThis.fetch=original;}
});
