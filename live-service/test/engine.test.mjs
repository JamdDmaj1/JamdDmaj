import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createVault, vaultContext} from '../src/vault.mjs';
import {openStore} from '../src/store.mjs';
import {startEngine} from '../src/engine.mjs';

const account = 'a'.repeat(64);
const connectionId = '11111111-1111-4111-8111-111111111111';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'jamd-live-engine-'));
  const store = openStore(join(dir, 'live.sqlite'));
  const vault = createVault(randomBytes(32));
  const context = vaultContext({accountHash: account, connectionId, exchange: 'bitget'});
  store.user(account, 'live-risk-v1');
  store.createConnection({
    id: connectionId, accountHash: account, exchange: 'bitget', label: 'test',
    keyEnc: vault.seal('key', context), secretEnc: vault.seal('secret', context), passphraseEnc: null,
    status: 'connected', balance: {total: 100}, positions: [],
    marginUsd: 10, leverage: 5, maxOpen: 1, protectionRoe: 4, dailyLossUsd: 50, maxTradesDay: 3
  });
  store.setLive(account, connectionId, true);
  return {dir, store, vault};
}

function exchangeMock() {
  const orders = [];
  return {
    markets: {'BTC/USDT:USDT': {id: 'BTCUSDT', symbol: 'BTC/USDT:USDT', swap: true, linear: true}},
    orders,
    async fetchPositions() { return []; },
    async fetchTicker() { return {last: 100}; },
    amountToPrecision(_symbol, amount) { return String(amount); },
    async setMarginMode() {},
    async setLeverage() {},
    async createOrderWithTakeProfitAndStopLoss(...args) { orders.push(args); return {id: 'order-1'}; },
    async createOrder(...args) { orders.push(args); return {id: 'order-2'}; },
    async close() {}
  };
}

function signal(overrides = {}) {
  return {
    id: 'signal-1', pair: 'BTCUSDT', side: 'long', score: 12,
    tp1: 110, sl: 95, createdAt: Date.now(), status: 'OPEN', ...overrides
  };
}

test('engine opens a protected position from an eligible signal', async () => {
  const {dir, store, vault} = fixture();
  const exchange = exchangeMock();
  let fetchCalls = 0;
  const engine = startEngine({
    config: {
      engineEnabled: true, engineIntervalMs: 60000, signalUrl: 'https://signal.test',
      cronSecret: 'secret', requestTimeoutMs: 5000, betaMode: true,
      betaAllowlist: [account], verifiedExchanges: ['bitget'], allowUnverifiedExchanges: false
    },
    store, vault, vaultContext,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({open: [signal()]}), {status: 200});
    },
    adapterFactory: async () => exchange,
    log: {warn() {}}
  });
  try {
    const summary = await engine.runOnce();
    assert.equal(summary.executed, 1);
    assert.equal(fetchCalls, 1);
    assert.equal(exchange.orders.length, 1);
    const positions = store.listPositions(account);
    assert.equal(positions.length, 1);
    assert.equal(positions[0].status, 'OPEN');
    assert.equal(positions[0].tp, 110);
    assert.equal(positions[0].sl, 95);
    assert.equal(store.orderForSignal(connectionId, 'signal-1').status, 'OPEN');
  } finally {
    engine.stop(); store.close(); rmSync(dir, {recursive: true, force: true});
  }
});

test('engine disables live when realized daily loss exceeds the configured limit', async () => {
  const {dir, store, vault} = fixture();
  store.upsertPosition(account, {
    connectionId, exchange: 'bitget', symbol: 'BTC/USDT:USDT', side: 'long',
    amount: 1, entry: 100, mark: 40, status: 'CLOSED', realizedPnl: -60,
    openedAt: Date.now() - 1000, closedAt: Date.now()
  });
  const exchange = exchangeMock();
  const engine = startEngine({
    config: {
      engineEnabled: true, engineIntervalMs: 60000, signalUrl: 'https://signal.test',
      cronSecret: 'secret', requestTimeoutMs: 5000, betaMode: true,
      betaAllowlist: [account], verifiedExchanges: ['bitget'], allowUnverifiedExchanges: false
    },
    store, vault, vaultContext,
    fetchImpl: async () => new Response(JSON.stringify({open: [signal()]}), {status: 200}),
    adapterFactory: async () => exchange,
    log: {warn() {}}
  });
  try {
    const summary = await engine.runOnce();
    assert.equal(summary.executed, 0);
    assert.equal(exchange.orders.length, 0);
    assert.equal(store.getConnection(account, connectionId).live_enabled, 0);
  } finally {
    engine.stop(); store.close(); rmSync(dir, {recursive: true, force: true});
  }
});
