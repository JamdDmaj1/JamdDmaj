import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../src/store.mjs';
import {randomBytes} from 'node:crypto';
import {createVault, vaultContext} from '../src/vault.mjs';

const account = 'a'.repeat(64);

test('store isolates connections, config, positions and shares by account', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jamd-live-store-'));
  const store = openStore(join(dir, 'live.sqlite'));
  try {
    store.user(account, 'live-risk-v1');
    const created = store.createConnection({
      accountHash: account, exchange: 'bitget', label: 'Main',
      keyEnc: 'key', secretEnc: 'secret', passphraseEnc: null,
      status: 'connected', balance: {total: 56.5}, positions: [],
      marginUsd: 25, leverage: 5, maxOpen: 1, protectionRoe: 4, dailyLossUsd: 50, maxTradesDay: 3
    });
    assert.equal(created.label, 'Main');
    assert.equal(created.live_enabled, 0);
    assert.equal(store.listConnections(account).length, 1);
    assert.equal(store.listConnections('b'.repeat(64)).length, 0);
    const updated = store.updateConfig(account, created.id, {
      marginUsd: 35, leverage: 10, maxOpen: 1, protectionRoe: 4, dailyLossUsd: 50, maxTradesDay: 3
    });
    assert.equal(updated.margin_usd, 35);
    assert.equal(updated.leverage, 10);
    assert.equal(store.setLive(account, created.id, true).live_enabled, 1);
    const position = store.upsertPosition(account, {
      connectionId: created.id, exchange: 'bitget', symbol: 'BTC/USDT:USDT', side: 'long',
      amount: 0.01, entry: 100, status: 'OPEN', openedAt: Date.now()
    });
    assert.equal(store.listPositions(account).length, 1);
    assert.equal(store.listPositions('b'.repeat(64)).length, 0);
    store.upsertPosition(account, {
      id: position.id, connectionId: created.id, exchange: 'bitget', symbol: 'BTC/USDT:USDT', side: 'long',
      amount: 0.01, entry: 100, mark: 90, status: 'CLOSED', realizedPnl: -0.1,
      openedAt: position.opened_at, closedAt: Date.now()
    });
    assert.equal(store.realizedPnlSince(created.id, 0), -0.1);
    const share = store.createShare(account, position.id, {symbol: 'BTC/USDT:USDT'});
    assert.equal(store.getShare(share.token).position_id, position.id);
    assert.equal(store.revokeShare(account, share.token), true);
    assert.equal(store.getShare(share.token), null);
    assert.throws(() => store.deleteConnection('b'.repeat(64), created.id));
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test('supplied connection id is preserved for vault context', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jamd-live-store-id-'));
  const store = openStore(join(dir, 'live.sqlite'));
  try {
    store.user(account, 'live-risk-v1');
    const id = '22222222-2222-4222-8222-222222222222';
    const vault = createVault(randomBytes(32));
    const context = vaultContext({accountHash: account, connectionId: id, exchange: 'bitget'});
    const created = store.createConnection({
      id, accountHash: account, exchange: 'bitget', label: 'id-test',
      keyEnc: vault.seal('key', context), secretEnc: vault.seal('secret', context), passphraseEnc: null,
      status: 'connected', balance: {total: 0}, positions: [],
      marginUsd: 25, leverage: 5, maxOpen: 1, protectionRoe: 4, dailyLossUsd: 50, maxTradesDay: 3
    });
    assert.equal(created.id, id);
    assert.equal(vault.open(created.key_enc, vaultContext({accountHash: created.account_hash, connectionId: created.id, exchange: created.exchange})), 'key');
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
