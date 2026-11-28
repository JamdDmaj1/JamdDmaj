import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityVerifier, bearerToken} from '../src/auth.mjs';

const token = 'a'.repeat(64);
const account = 'b'.repeat(64);

test('identity verifier caches valid sessions and rejects malformed tokens', async () => {
  let calls = 0;
  const verifier = createIdentityVerifier({
    identityUrl: 'https://example.test/api/perps-identity',
    cacheMs: 60000,
    now: () => 1000,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(init.headers.Authorization, `Bearer ${token}`);
      return new Response(JSON.stringify({ok: true, accountHash: account}), {status: 200});
    }
  });
  assert.equal(await verifier.verify(token), account);
  assert.equal(await verifier.verify(token), account);
  assert.equal(calls, 1);
  await assert.rejects(() => verifier.verify('short'), {status: 401});
});

test('identity verifier maps unauthorized and unavailable responses', async () => {
  const unauthorized = createIdentityVerifier({
    identityUrl: 'https://example.test/api/perps-identity',
    fetchImpl: async () => new Response('{}', {status: 401})
  });
  await assert.rejects(() => unauthorized.verify(token), {status: 401});
  const unavailable = createIdentityVerifier({
    identityUrl: 'https://example.test/api/perps-identity',
    fetchImpl: async () => new Response('{}', {status: 503})
  });
  await assert.rejects(() => unavailable.verify(token), {status: 503});
});

test('bearerToken accepts only the exact opaque session format', () => {
  assert.equal(bearerToken({headers: {authorization: `Bearer ${token}`}}), token);
  assert.equal(bearerToken({headers: {authorization: 'Bearer bad'}}), '');
  assert.equal(bearerToken({headers: {}}), '');
});
