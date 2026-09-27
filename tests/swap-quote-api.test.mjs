import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/swap-quote.js';
const env = { JUPITER_API_KEY: 'private-test-value', UPSTASH_REDIS_REST_URL: 'test', UPSTASH_REDIS_REST_TOKEN: 'test' };
const url = 'https://www.jamddmaj.com/api/swap-quote?inputMint=a&outputMint=b&amount=1';
test('diagnostics expose only failure stage and bounded provider status', async () => {
  const records = [];
  const handler = createHandler({ env, limit: async () => {}, diagnostic: data => records.push(data), quote: async () => { throw Object.assign(new Error('secret-response-body'), { providerStatus: 401 }); } });
  const response = await handler(new Request(url));
  assert.equal(response.status, 502);
  assert.deepEqual(records, [{ stage: 'provider', providerStatus: 401 }]);
  assert.equal((await response.text()).includes('secret-response-body'), false);
});
test('quote API is disabled without server configuration', async () => {
  const response = await createHandler({ env: {}, quote: () => assert.fail() })(new Request(url));
  assert.equal(response.status, 503);
});
test('rejects executable parameters and duplicate parameters', async () => {
  const handler = createHandler({ env, limit: () => assert.fail() });
  for (const extra of ['&taker=wallet', '&amount=2', '&transaction=data']) assert.equal((await handler(new Request(url + extra))).status, 400);
  assert.equal((await handler(new Request(url, { method: 'POST' }))).status, 405);
});
test('rate limit failure prevents provider calls and hides private errors', async () => {
  const handler = createHandler({ env, limit: async () => { throw Object.assign(new Error('private-test-value'), { status: 429 }); }, quote: () => assert.fail() });
  const response = await handler(new Request(url));
  assert.equal(response.status, 429); assert.equal((await response.text()).includes('private-test-value'), false);
});
test('successful indicative response cannot be cached', async () => {
  let checked = false;
  const handler = createHandler({ env, limit: async () => { checked = true; }, quote: async input => { assert.ok(checked); assert.equal(input.amount, '1'); return { executable: false }; } });
  const response = await handler(new Request(url));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).quote.executable, false);
});
