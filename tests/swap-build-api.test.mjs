import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/swap-build.js';
const env={JUPITER_API_KEY:'secret-fixture',UPSTASH_REDIS_REST_URL:'configured',UPSTASH_REDIS_REST_TOKEN:'configured'};
const query='inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&taker=11111111111111111111111111111111&slippageBps=50';
const request=(suffix='')=>new Request('https://app.example/api/swap-build?'+query+suffix);
test('build API returns noncached preparation with exact user intent and shared quota',async()=>{
  const order=[];
  const handler=createHandler({env,limit:async()=>order.push('quota'),build:async intent=>{
    order.push('prepare');assert.equal(intent.slippageBps,50);assert.equal(intent.amount,'1000000');
    return {executable:false,requiresNativeValidation:true};}});
  const response=await handler(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.deepEqual(order,['quota','prepare']);assert.equal((await response.json()).preparation.executable,false);
});
test('build API rejects executable extras duplicates and unconfigured deployments',async()=>{
  const handler=createHandler({env,limit:()=>assert.fail('unexpected quota')});
  for(const suffix of ['&transaction=payload','&signature=payload','&amount=1','&tipAmount=1'])assert.equal((await handler(request(suffix))).status,400);
  assert.equal((await handler(new Request('https://app.example/api/swap-build',{method:'POST',body:'signature'}))).status,405);
  assert.equal((await createHandler({env:{}})(request())).status,503);
});
test('quota and provider failures never expose credentials or call submission',async()=>{
  const denied=createHandler({env,limit:async()=>{throw Object.assign(new Error('secret-fixture'),{status:429});},build:()=>assert.fail('provider called')});
  const limited=await denied(request());assert.equal(limited.status,429);assert.doesNotMatch(await limited.text(),/secret-fixture/);
  const failed=createHandler({env,limit:async()=>{},build:async()=>{throw new Error('secret-fixture');}});
  const response=await failed(request());assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/secret-fixture/);
});
