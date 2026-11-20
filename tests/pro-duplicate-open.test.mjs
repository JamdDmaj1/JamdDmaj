import test from "node:test";
import assert from "node:assert/strict";
import { dedupeOpenSignals } from "../lib/pro-signals.js";

test("duplicate open signals keep one per asset and side", () => {
  const base = { status: "OPEN", baseSymbol: "XAUT", pair: "XAUTUSDT", side: "SHORT", id: "a" };
  const result = dedupeOpenSignals([
    base,
    { ...base, id: "b" },
    { ...base, id: "c", side: "LONG" },
    { ...base, id: "d", baseSymbol: "BTC", pair: "BTCUSDT" }
  ]);
  assert.equal(result.open.length, 3);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].status, "STALE");
  assert.equal(result.duplicates[0].closeReason, "DUPLICATE_OPEN");
});

test("empty and invalid inputs are safe", () => {
  assert.deepEqual(dedupeOpenSignals([]), { open: [], duplicates: [] });
  assert.deepEqual(dedupeOpenSignals(null), { open: [], duplicates: [] });
});
