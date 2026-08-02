import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCandlesticks, candlestickDecision } from "../candlesticks.js";

function candle(open, high, low, close) {
  return { open, high, low, close, volume: 100 };
}

test("detects a bullish engulfing pattern after a decline", () => {
  const analysis = analyzeCandlesticks([
    candle(110, 111, 108, 109),
    candle(109, 110, 106, 107),
    candle(107, 108, 104, 105),
    candle(105, 106, 102, 103),
    candle(104, 105, 100, 101),
    candle(100, 106, 99, 105)
  ]);
  assert.equal(analysis.bias, "bullish");
  assert.equal(analysis.strong, true);
  assert.ok(analysis.patterns.includes("bullish-engulfing"));
  assert.equal(candlestickDecision(analysis, "LONG"), "strong-confirmation");
  assert.equal(candlestickDecision(analysis, "SHORT"), "strong-opposition");
});

test("detects a shooting star only with bullish context", () => {
  const analysis = analyzeCandlesticks([
    candle(100, 102, 99, 101),
    candle(101, 104, 100, 103),
    candle(103, 106, 102, 105),
    candle(105, 108, 104, 107),
    candle(107, 110, 106, 109),
    candle(109, 115, 108.5, 109.5)
  ]);
  assert.equal(analysis.bias, "bearish");
  assert.ok(analysis.patterns.includes("shooting-star"));
  assert.equal(candlestickDecision(analysis, "LONG"), "opposition");
});

test("does not turn a doji into a directional trade signal", () => {
  const analysis = analyzeCandlesticks([
    candle(100, 101, 99, 100.5),
    candle(100.5, 102, 100, 101),
    candle(101, 103, 100.5, 102),
    candle(102, 104, 101, 103),
    candle(103, 105, 102, 104),
    candle(104, 106, 102, 104.1)
  ]);
  assert.equal(analysis.bias, "neutral");
  assert.ok(analysis.patterns.includes("doji"));
  assert.equal(candlestickDecision(analysis, "LONG"), "neutral");
});
