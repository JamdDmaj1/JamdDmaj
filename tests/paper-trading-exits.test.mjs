import test from 'node:test';
import assert from 'node:assert/strict';
import {updatePaperPortfolio} from '../lib/pro-signals.js';

const now = Date.now();
function state(overrides = {}) {
  return {
    startingBalance: 1000,
    balance: 1000,
    equity: 1000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    maxDrawdownPercent: 0,
    updatedAt: new Date(now).toISOString(),
    closed: [],
    open: [{
      signalId: 'signal:1',
      symbol: 'MSTR/USDT PERP',
      pair: 'MSTRUSDT',
      side: 'SHORT',
      entry: 100,
      currentPrice: 100,
      marginUsd: 5,
      originalMarginUsd: 5,
      notionalUsd: 100,
      originalNotionalUsd: 100,
      leverage: 20,
      remainingFraction: 1,
      closedTargets: [],
      protectionActive: false,
      protectionRoe: 10,
      protectedPrice: 99.5,
      riskPercent: 5,
      estimatedRiskUsd: 5,
      openedAt: new Date(now).toISOString(),
      status: 'OPEN',
      reached: [],
      ...overrides
    }]
  };
}
const config = {paperEnabled: true, paperRiskPercent: 5, paperLeverage: 20};
const market = price => new Map([['MSTR', {price}]]);

test('paper trading liquidates a short instead of leaving it open forever', () => {
  const paper = updatePaperPortfolio(state(), config, [], [], market(120));
  assert.equal(paper.open.length, 0);
  assert.equal(paper.closed[0].closeTarget, 'LIQUIDATION');
  assert.equal(paper.closed[0].status, 'LIQUIDATED');
  assert.ok(paper.closed[0].roePercent >= -100);
});

test('paper trading closes a stored stop even without a signal update', () => {
  const paper = updatePaperPortfolio(state({sl: 105}), config, [], [], market(106));
  assert.equal(paper.open.length, 0);
  assert.equal(paper.closed[0].closeTarget, 'STOP');
  assert.equal(paper.closed[0].status, 'SL');
});

test('paper trading takes TP1 from price and leaves the runner open', () => {
  const paper = updatePaperPortfolio(state({sl: 110, tp1: 95, tp2: 90, tp3: 85}), config, [], [], market(94));
  assert.equal(paper.open.length, 1);
  assert.equal(paper.closed[0].closeTarget, 'TP1');
  assert.ok(Math.abs(paper.open[0].remainingFraction - 0.3) < 1e-9);
});

test('paper trading protects the TP1 runner at break-even after fees', () => {
  const first = updatePaperPortfolio(state({sl: 110, tp1: 95, tp2: 90, tp3: 85}), config, [], [], market(94));
  assert.equal(first.open.length, 1);
  assert.equal(first.open[0].protectionActive, true);
  assert.ok(first.open[0].protectedPrice > 99.8 && first.open[0].protectedPrice < 100);
  const second = updatePaperPortfolio(first, config, [], [], market(100.2));
  assert.equal(second.open.length, 0);
  assert.equal(second.closed[0].closeTarget, 'TP1_PROTECTION');
});

test('paper trading opens only one position and applies entry slippage', () => {
  const created = [
    {id: 'signal:a', symbol: 'AAA/USDT PERP', pair: 'AAAUSDT', side: 'LONG', entry: 100, sl: 95, tp1: 110, tp2: 120, tp3: 130, plannedUsd: 50, leverage: 20, createdAt: new Date(now).toISOString(), validUntil: new Date(now + 12 * 3600000).toISOString()},
    {id: 'signal:b', symbol: 'BBB/USDT PERP', pair: 'BBBUSDT', side: 'LONG', entry: 100, sl: 95, tp1: 110, tp2: 120, tp3: 130, plannedUsd: 50, leverage: 20, createdAt: new Date(now).toISOString(), validUntil: new Date(now + 12 * 3600000).toISOString()}
  ];
  const paper = updatePaperPortfolio({startingBalance: 1000, balance: 1000, equity: 1000, open: [], closed: [], updatedAt: new Date(now).toISOString()}, {...config, paperMaxOpen: 1}, created, [], new Map([['AAA', {price: 100}], ['BBB', {price: 100}]]));
  assert.equal(paper.open.length, 1);
  assert.equal(paper.open[0].symbol, 'AAA/USDT PERP');
  assert.ok(Math.abs(paper.open[0].entry - 100.05) < 1e-9);
});
