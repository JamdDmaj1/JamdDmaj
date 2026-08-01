import assert from "node:assert/strict";
import test from "node:test";

import proClientFeedHandler from "../api/pro-client-feed.js";
import { dayKey } from "../api/pro-executor.js";
import { dailyReportKey, shouldReuseRecentCycle } from "../lib/pro-signals.js";

function signal(id, ageMs, bitgetEligible) {
  return {
    id,
    pair: `${id.toUpperCase()}USDT`,
    symbol: `${id.toUpperCase()}USDT`,
    baseSymbol: id.toUpperCase(),
    side: "LONG",
    status: "OPEN",
    score: 12,
    bitgetEligible,
    createdAt: new Date(Date.now() - ageMs).toISOString(),
    entry: 1,
    tp1: 1.1,
    tp2: 1.2,
    tp3: 1.3,
    sl: 0.9
  };
}

function mockRedisState(open) {
  return async () => new Response(JSON.stringify([
    { result: JSON.stringify({ maxExecutionSignalAgeMinutes: 5 }) },
    { result: "{}" },
    { result: JSON.stringify(open) },
    { result: "[]" },
    { result: "{}" },
    { result: "{}" },
    { result: "null" }
  ]), { status: 200 });
}

test("the executor feed rejects missing or URL-only credentials", { concurrency: false }, async () => {
  const previousSecret = process.env.JAMDDMAJ_CRON_SECRET;
  process.env.JAMDDMAJ_CRON_SECRET = "test-secret";
  try {
    const missing = await proClientFeedHandler(new Request("https://example.test/api/pro-client-feed"));
    const urlOnly = await proClientFeedHandler(new Request("https://example.test/api/pro-client-feed?token=test-secret"));
    assert.equal(missing.status, 401);
    assert.equal(urlOnly.status, 401);
  } finally {
    if (previousSecret === undefined) delete process.env.JAMDDMAJ_CRON_SECRET;
    else process.env.JAMDDMAJ_CRON_SECRET = previousSecret;
  }
});

test("the executor feed sends only fresh Bitget-ready signals", { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.JAMDDMAJ_CRON_SECRET;
  process.env.JAMDDMAJ_CRON_SECRET = "test-secret";
  globalThis.fetch = mockRedisState([
    signal("fresh", 60_000, true),
    signal("old", 10 * 60_000, true),
    signal("study", 60_000, false)
  ]);
  try {
    const response = await proClientFeedHandler(new Request("https://example.test/api/pro-client-feed", {
      headers: { "X-JamdDmaj-Client-Token": "test-secret" }
    }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.signals.map((item) => item.id), ["fresh"]);
    assert.deepEqual(body.open.map((item) => item.id), ["fresh", "old", "study"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.JAMDDMAJ_CRON_SECRET;
    else process.env.JAMDDMAJ_CRON_SECRET = previousSecret;
  }
});

test("daily learning reports use the New York calendar date", () => {
  assert.equal(dayKey("2026-07-30T01:00:00.000Z"), "2026-07-29");
  assert.equal(dayKey("2026-07-30T05:00:00.000Z"), "2026-07-30");
  assert.equal(dailyReportKey("2026-07-30T01:00:00.000Z"), "2026-07-29");
  assert.equal(dailyReportKey("2026-07-30T05:00:00.000Z"), "2026-07-30");
});

test("recent server scans are reused unless a forced cycle is requested", () => {
  const now = Date.parse("2026-08-01T00:00:00.000Z");
  assert.equal(shouldReuseRecentCycle("2026-07-31T23:59:00.000Z", false, now), true);
  assert.equal(shouldReuseRecentCycle("2026-07-31T23:55:00.000Z", false, now), false);
  assert.equal(shouldReuseRecentCycle("2026-07-31T23:59:00.000Z", true, now), false);
  assert.equal(shouldReuseRecentCycle("2026-08-01T00:01:00.000Z", false, now), false);
});
