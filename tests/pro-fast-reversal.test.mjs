import test from "node:test";
import assert from "node:assert/strict";
import { buildFastReversalSignal, isFastReversal } from "../lib/pro-signals.js";

const base = {
  price: 102,
  ema12: 101,
  ema26: 100,
  microTrend: "bullish 15m confirmation"
};

test("fast reversal closes a short when 15m and 1h turn bullish", () => {
  assert.equal(isFastReversal("SHORT", base), true);
});

test("fast reversal keeps a short while 1h EMA is still bearish", () => {
  assert.equal(isFastReversal("SHORT", { ...base, ema12: 99, ema26: 100, price: 98 }), false);
});

test("fast reversal closes a long when 15m and 1h turn bearish", () => {
  assert.equal(isFastReversal("LONG", {
    price: 98,
    ema12: 99,
    ema26: 100,
    microTrend: "bearish 15m confirmation"
  }), true);
});

test("fast reversal does not fire without opposite 15m structure", () => {
  assert.equal(isFastReversal("SHORT", { ...base, microTrend: "mixed 15m confirmation" }), false);
});

test("fast reversal builds an opposite paper/watch signal with levels", () => {
  const parent = {
    id: "BTC-SHORT-1",
    baseSymbol: "BTC",
    pair: "BTCUSDT",
    side: "SHORT",
    leverage: 10,
    score: 12,
    telegramEligible: true,
    setupType: "trend-continuation"
  };
  const signal = buildFastReversalSignal(parent, {
    price: 65000,
    atrPercent: 0.01,
    adx: 25,
    trend: "bullish alignment",
    higherTrend: "bearish 4h alignment",
    microTrend: "bullish 15m confirmation"
  });
  assert.equal(signal.side, "LONG");
  assert.equal(signal.setupType, "fast-reversal");
  assert.equal(signal.bitgetEligible, false);
  assert.equal(signal.telegramEligible, true);
  assert.ok(signal.tp1 > signal.entry);
  assert.ok(signal.sl < signal.entry);
});
