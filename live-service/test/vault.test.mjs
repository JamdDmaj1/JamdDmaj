import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createVault, vaultContext} from '../src/vault.mjs';

test('vault seals and opens with the exact tenant context', () => {
  const vault = createVault(randomBytes(32));
  const context = vaultContext({accountHash: 'a'.repeat(64), connectionId: '11111111-1111-4111-8111-111111111111', exchange: 'bitget'});
  const sealed = vault.seal('api-secret-value', context);
  assert.match(sealed, /^v1\./);
  assert.equal(vault.open(sealed, context), 'api-secret-value');
  assert.throws(() => vault.open(sealed, context + 'x'));
  assert.notEqual(vault.seal('same', context), sealed);
});

test('vault rejects invalid keys and oversized secrets', () => {
  assert.throws(() => createVault(Buffer.alloc(31)));
  const vault = createVault(randomBytes(32));
  const context = vaultContext({accountHash: 'a'.repeat(64), connectionId: 'id', exchange: 'bitget'});
  assert.throws(() => vault.seal('', context));
  assert.throws(() => vault.seal('x'.repeat(4097), context));
  assert.throws(() => vault.open('not-sealed', context));
});
