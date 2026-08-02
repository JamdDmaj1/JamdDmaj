import assert from "node:assert/strict";
import test from "node:test";

import chatHandler from "../api/chat.js";
import {
  buildChartMessages,
  chartVisionModels,
  hasSpecificChartEvidence,
  normalizeChartAnalysis
} from "../api/chart-analysis.js";
import proClientFeedHandler from "../api/pro-client-feed.js";
import { dayKey } from "../api/pro-executor.js";
import { enforceRateLimits } from "../lib/server.js";
import { calculateMarketDirection, dailyReportKey, shouldReuseRecentCycle } from "../lib/pro-signals.js";

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

test("rate limits use one atomic Redis script per request", { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const requests = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify([{ result: [1, 1, 1, 1, 1] }]), { status: 200 });
  };
  try {
    const result = await enforceRateLimits(new Request("https://example.test/api/chat", {
      headers: { "x-forwarded-for": "203.0.113.10" }
    }), "test-device");
    assert.equal(result.remaining, 79);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://redis.example.test/pipeline");
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.length, 1);
    assert.equal(body[0][0], "EVAL");
    assert.equal(body[0][2], 5);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("invalid chat requests do not consume Redis quota", { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const previousOpenRouter = process.env.OPENROUTER_API_KEY;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  let fetchCalls = 0;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Invalid input should not reach an external service");
  };
  try {
    const response = await chatHandler(new Request("https://example.test/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jamddmaj-device": "test-device-00001"
      },
      body: "not-json"
    }));
    assert.equal(response.status, 400);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousOpenRouter;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("market direction clearly separates bullish, bearish and mixed breadth", () => {
  const market = (trend, higherTrend, momentum6h, change24h) => ({
    price: 100,
    quoteVolume: 50_000_000,
    trend,
    higherTrend,
    momentum6h,
    change24h
  });
  const bullish = calculateMarketDirection(Array.from({ length: 12 }, () => (
    market("bullish alignment", "bullish 4h alignment", 1.2, 2.4)
  )), null, Date.parse("2026-08-02T00:00:00.000Z"));
  assert.equal(bullish.bias, "bullish");
  assert.equal(bullish.label, "FUERTEMENTE ALCISTA");
  assert.equal(bullish.bullishPercent, 100);

  const bearish = calculateMarketDirection(Array.from({ length: 12 }, () => (
    market("bearish alignment", "bearish 4h alignment", -1.2, -2.4)
  )), null, Date.parse("2026-08-02T00:00:00.000Z"));
  assert.equal(bearish.bias, "bearish");
  assert.equal(bearish.label, "FUERTEMENTE BAJISTA");
  assert.equal(bearish.bearishPercent, 100);

  const mixed = calculateMarketDirection([
    ...Array.from({ length: 6 }, () => market("bullish alignment", "bullish 4h alignment", 1, 2)),
    ...Array.from({ length: 6 }, () => market("bearish alignment", "bearish 4h alignment", -1, -2))
  ], null, Date.parse("2026-08-02T00:00:00.000Z"));
  assert.equal(mixed.bias, "mixed");
  assert.equal(mixed.label, "MIXTA / SIN DIRECCION CLARA");
});

test("market direction smoothing avoids an instant full reversal", () => {
  const now = Date.parse("2026-08-02T00:30:00.000Z");
  const bearishMarkets = Array.from({ length: 10 }, () => ({
    price: 100,
    quoteVolume: 50_000_000,
    trend: "bearish alignment",
    higherTrend: "bearish 4h alignment",
    momentum6h: -2,
    change24h: -4
  }));
  const direction = calculateMarketDirection(bearishMarkets, {
    score: 60,
    updatedAt: "2026-08-02T00:15:00.000Z"
  }, now);
  assert.equal(direction.bias, "mixed");
  assert.ok(direction.currentScore < -90);
});

test("chart analysis prompt includes the screenshot and scanner direction", () => {
  const messages = buildChartMessages("data:image/png;base64,AAAA", "BTCUSDT 15m", {
    label: "ALCISTA",
    score: 32,
    bullishPercent: 65,
    bearishPercent: 20,
    samples: 20
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content[1].type, "image_url");
  assert.equal(messages[1].content[1].image_url.url, "data:image/png;base64,AAAA");
  assert.match(messages[1].content[0].text, /ALCISTA/);
  assert.match(messages[0].content, /Nunca inventes precios/);
});

test("chart analysis defaults to no trade and computes market alignment safely", () => {
  const bullishDirection = {
    bias: "bullish",
    label: "ALCISTA",
    score: 30,
    bullishPercent: 60,
    bearishPercent: 20,
    samples: 20
  };
  const aligned = normalizeChartAnalysis(JSON.stringify({
    signal: "LONG",
    confidence: 76,
    asset: "BTCUSDT",
    timeframe: "15m",
    chartTrend: "ALCISTA",
    entry: "sobre 68000 con cierre",
    stopLoss: "debajo de 67200",
    targets: ["69000", "70000"],
    reasons: ["estructura creciente"]
  }), bullishDirection);
  assert.equal(aligned.signal, "LONG");
  assert.equal(aligned.marketAlignment, "A FAVOR");
  assert.equal(aligned.noAutomaticExecution, true);

  const unclear = normalizeChartAnalysis("The screenshot is unclear", bullishDirection);
  assert.equal(unclear.signal, "NO TRADE");
  assert.equal(unclear.marketAlignment, "NEUTRAL");
  assert.equal(unclear.entry, "Esperar confirmacion");
  assert.doesNotMatch(unclear.summary, /```|\{"signal"/);
});

test("chart analysis rejects generic templates and accepts image-specific evidence", () => {
  const generic = normalizeChartAnalysis(JSON.stringify({
    signal: "NO TRADE",
    confidence: 0,
    asset: "AAVEUSDT",
    timeframe: "1h",
    chartTrend: "INCIERTA",
    reasons: ["Direccion dominante calculada por el scanner: MIXTA"],
    warnings: ["Captura aislada no confirma precio en vivo"],
    summary: ""
  }));
  assert.equal(hasSpecificChartEvidence(generic), false);

  const specific = normalizeChartAnalysis(JSON.stringify({
    signal: "SHORT",
    confidence: 71,
    asset: "AAVEUSDT",
    timeframe: "1h",
    chartTrend: "BAJISTA",
    pattern: "rechazo en resistencia",
    visualEvidence: [
      "El ultimo maximo queda debajo del maximo anterior.",
      "La vela mas reciente rechaza la zona superior con mecha larga.",
      "El volumen aumenta durante la vela bajista."
    ],
    reasons: ["La estructura muestra maximos y minimos descendentes."],
    summary: "La captura muestra continuacion bajista mientras no recupere el ultimo maximo visible."
  }));
  assert.equal(hasSpecificChartEvidence(specific), true);
});

test("chart vision fallbacks remain free and include explicit image models", () => {
  const models = chartVisionModels("paid/model,google/gemma-4-26b-a4b-it:free");
  assert.equal(models[0], "google/gemma-4-26b-a4b-it:free");
  assert.ok(models.every((model) => model.endsWith(":free") || model === "openrouter/free"));
  assert.ok(models.some((model) => model.includes("gemma")));
});
