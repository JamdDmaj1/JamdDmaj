import test from 'node:test';
import assert from 'node:assert/strict';
import {placeMarketOrder} from '../src/adapters/ccxt.mjs';

function mockExchange({bracket = true} = {}) {
  const calls = [];
  return {
    calls,
    async setMarginMode(...args) { calls.push(['margin', ...args]); },
    async setLeverage(...args) { calls.push(['leverage', ...args]); },
    async fetchTicker() { return {last: 100}; },
    amountToPrecision(_symbol, amount) { return String(Number(amount).toFixed(3)); },
    async createOrder(symbol, type, side, amount, price, params) {
      calls.push(['order', symbol, type, side, amount, params]);
      return {id: 'fallback'};
    },
    async createOrderWithTakeProfitAndStopLoss(symbol, type, side, amount, price, tp, sl, params) {
      calls.push(['bracket', symbol, type, side, amount, tp, sl, params]);
      return {id: 'bracket'};
    }
  };
}

test('live entry uses a protected bracket when TP and SL are present', async () => {
  const exchange = mockExchange();
  const result = await placeMarketOrder(exchange, {
    symbol: 'BTC/USDT:USDT', side: 'long', marginUsd: 25, leverage: 5,
    clientOrderId: 'jlive-test', takeProfit: 105, stopLoss: 95
  });
  assert.equal(result.protected, true);
  assert.equal(result.amount, 1.25);
  const bracket = exchange.calls.find(call => call[0] === 'bracket');
  assert.ok(bracket);
  assert.equal(bracket[3], 'buy');
  assert.equal(bracket[5], 105);
  assert.equal(bracket[6], 95);
});

test('live entry falls back to a plain market order only when no protection is provided', async () => {
  const exchange = mockExchange();
  const result = await placeMarketOrder(exchange, {
    symbol: 'BTC/USDT:USDT', side: 'short', marginUsd: 10, leverage: 2,
    clientOrderId: 'jlive-test'
  });
  assert.equal(result.protected, false);
  const order = exchange.calls.find(call => call[0] === 'order');
  assert.ok(order);
  assert.equal(order[3], 'sell');
});
