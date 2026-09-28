import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaSwapQuoteService } from '../lib/solana-swap-quote.js';
const inputMint = 'So11111111111111111111111111111111111111112';
const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const request = { inputMint, outputMint, amount: '1000000' };
const body = { inputMint, outputMint, inAmount: '1000000', outAmount: '100', transaction: null };
test('works in runtimes without AbortSignal.timeout', async () => {
  const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  try {
    const quote = createSolanaSwapQuoteService({ apiKey: 'test-only', fetchImpl: async (_, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      return Response.json(body);
    } });
    assert.equal((await quote(request)).outAmount, '100');
  } finally { Object.defineProperty(AbortSignal, 'timeout', original); }
});
test('quote-only request never supplies taker and never returns executable payload', async () => {
  const quote = createSolanaSwapQuoteService({ apiKey: 'test-only', now: () => 100,
    fetchImpl: async (url, options) => {
      assert.equal(typeof url, 'string');
      url = new URL(url);
      assert.equal(url.origin, 'https://api.jup.ag');
      assert.equal(url.searchParams.has('taker'), false);
      assert.equal(options.redirect, 'manual');
      return Response.json(body);
    } });
  const result = await quote(request);
  assert.equal(result.outAmount, '100'); assert.equal(result.executable, false);
  assert.equal(result.expiresAt, 15100); assert.equal(result.transaction, undefined);
  assert.ok(Object.isFrozen(result));
});
test('rejects malformed inputs before contacting provider', async () => {
  const quote = createSolanaSwapQuoteService({ apiKey: 'test', fetchImpl: () => assert.fail('network') });
  for (const amount of ['0', '-1', '1.0', '1e6', '01', '18446744073709551616', 1]) await assert.rejects(quote({ ...request, amount }));
  await assert.rejects(quote({ ...request, outputMint: inputMint }));
  await assert.rejects(quote({ ...request, inputMint: 'invalid' }));
});
test('rejects unsafe credential header contents without contacting provider', async () => {
  for (const apiKey of ['key\nInjected: value', 'key\u200b', 'key value']) {
    await assert.rejects(createSolanaSwapQuoteService({ apiKey, fetchImpl: () => assert.fail('network') })(request), /credential format/);
  }
});
test('redirect replies are rejected without following their destination', async () => {
  let calls = 0;
  const quote = createSolanaSwapQuoteService({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    calls++;
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://untrusted.invalid/' } });
  } });
  await assert.rejects(quote(request), error => error.providerStatus === 302);
  assert.equal(calls, 1);
});
test('rejects mismatched, failed or executable replies', async () => {
  for (const change of [{ inAmount: '2' }, { outputMint: inputMint }, { outAmount: '0' }, { errorCode: 1 }, { transaction: 'base64' }]) {
    const quote = createSolanaSwapQuoteService({ apiKey: 'test', fetchImpl: async () => Response.json({ ...body, ...change }) });
    await assert.rejects(quote(request));
  }
});
test('requires configuration and bounds response size and quote age', async () => {
  await assert.rejects(createSolanaSwapQuoteService({})(request), /not configured/);
  await assert.rejects(createSolanaSwapQuoteService({ apiKey: 'test', fetchImpl: async () => new Response('x'.repeat(262145)) })(request), /too large/);
  let clock = 0;
  await assert.rejects(createSolanaSwapQuoteService({ apiKey: 'test', now: () => (clock += 11000), fetchImpl: async () => Response.json(body) })(request), /expired/);
});
