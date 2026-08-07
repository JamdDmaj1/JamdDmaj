import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import chatHandler from "../api/chat.js";
import {
  buildChartMessages,
  chartVisionModels,
  hasSpecificChartEvidence,
  normalizeChartAnalysis
} from "../api/chart-analysis.js";
import proClientFeedHandler from "../api/pro-client-feed.js";
import { buildOutcomeCohortComparison, dayKey, executorRejectionSnapshot } from "../api/pro-executor.js";
import {
  FAIR_LAUNCH_DEFAULTS,
  assessFairLaunch,
  buildFairLaunchManifest,
  calculateFairLaunchVesting,
  normalizeFairLaunchDraft
} from "../lib/fair-launch.js";
import {
  getCompatibleSolanaWallets,
  getSolanaAccount,
  sanitizeWalletName,
  shortenWalletAddress
} from "../lib/wallet-security.js";
import { createWalletRegistry, walletEvent } from "../lib/wallet-standard-registry.js";
import { buildBoostPlan, JDMAJ_BOOST_CATALOG } from "../lib/fair-launch-boost.js";
import { FAIR_LAUNCH_LOCALES, FAIR_LAUNCH_LOCALE_KEYS } from "../lib/fair-launch-locales.js";
import { FAIR_LAUNCH_UI_KEYS, fairLaunchUiText } from "../lib/fair-launch-ui-copy.js";
import { validateDevnetTokenRequest } from "../lib/solana-devnet-token.js";
import {
  evaluateAiSimulationVariant,
  isAiSimulationMode,
  recordAiSimulationCycle,
  recordAiSimulationOutcome
} from "../scripts/bitget-executor.mjs";
import { corsHeaders, enforceRateLimits } from "../lib/server.js";
import { calculateMarketDirection, dailyReportKey, saveExecutorHeartbeat, shouldReuseRecentCycle } from "../lib/pro-signals.js";

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

test("the official JamdDmaj domain is allowed without reflecting unknown origins", () => {
  const official = corsHeaders(new Request("https://example.test", {
    headers: { origin: "https://www.jamddmaj.com" }
  }));
  const unknown = corsHeaders(new Request("https://example.test", {
    headers: { origin: "https://wallet-drainer.example" }
  }));
  assert.equal(official["Access-Control-Allow-Origin"], "https://www.jamddmaj.com");
  assert.equal(unknown["Access-Control-Allow-Origin"], "https://www.jamddmaj.com");
});

test("the official web app declares installability and baseline edge protections", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const headers = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]));
  assert.match(html, /rel="manifest" href="\/manifest\.json"/);
  assert.equal(manifest.id, "/");
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === "/?view=fair-launch"));
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
});

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

test("executor learning deduplicates repeated rejection snapshots", () => {
  const first = {
    decisions: {
      totalSignals: 2,
      newSignals: 1,
      recentOpenSignals: 1,
      executableSignals: 0,
      rejected: { "stale signal older than 5m": 2 },
      examples: [
        { pair: "BTCUSDT", side: "LONG", score: 8.1, reason: "stale signal older than 5m" },
        { pair: "ETHUSDT", side: "SHORT", score: 7.9, reason: "stale signal older than 5m" }
      ]
    }
  };
  const reordered = {
    decisions: {
      ...first.decisions,
      examples: [...first.decisions.examples].reverse()
    }
  };
  const fresh = {
    decisions: {
      ...first.decisions,
      newSignals: 2
    }
  };

  assert.equal(executorRejectionSnapshot(first), executorRejectionSnapshot(reordered));
  assert.notEqual(executorRejectionSnapshot(first), executorRejectionSnapshot(fresh));
});

test("AI recommendations run only as a stricter simulation variant", () => {
  const now = Date.parse("2026-08-04T20:00:00.000Z");
  const aligned = {
    id: "btc-long-1",
    pair: "BTCUSDT",
    side: "LONG",
    score: 13,
    createdAt: new Date(now - 60_000).toISOString(),
    higherTrend: "bullish 4h alignment",
    volumeRatio: 1.25,
    entry: 100,
    currentPrice: 100.2,
    adx: 24,
    spreadPercent: 0.0005,
    category: "majors",
    marketAlignment: "with-market"
  };
  const counter = {
    ...aligned,
    id: "btc-short-1",
    side: "SHORT",
    higherTrend: "bearish 4h alignment",
    volumeRatio: 1.2,
    marketAlignment: "counter-market"
  };

  assert.equal(evaluateAiSimulationVariant(aligned, { ok: true }, {}, now).ok, true);
  assert.match(evaluateAiSimulationVariant(counter, { ok: true }, {}, now).reason, /volume below 1\.35x/);
  assert.match(evaluateAiSimulationVariant(aligned, { ok: false, reason: "score below 14" }, {}, now).reason, /baseline rejected/);
  assert.equal(isAiSimulationMode("dry-run"), true);
  assert.equal(isAiSimulationMode("live"), false);
  assert.equal(isAiSimulationMode("off"), false);
});

test("AI simulation A/B deduplicates candidates and outcomes", () => {
  const now = Date.parse("2026-08-04T20:00:00.000Z");
  const signal = {
    id: "eth-long-1",
    pair: "ETHUSDT",
    side: "LONG",
    score: 13,
    createdAt: new Date(now - 30_000).toISOString(),
    higherTrend: "bullish 4h alignment",
    volumeRatio: 1.3,
    entry: 3000,
    currentPrice: 3001,
    adx: 28,
    spreadPercent: 0.0004,
    category: "majors",
    marketAlignment: "with-market"
  };
  let experiment = recordAiSimulationCycle(null, [{ signal, decision: { ok: true } }], {}, now);
  experiment = recordAiSimulationCycle(experiment, [{ signal, decision: { ok: true } }], {}, now);
  assert.equal(experiment.baseline.candidates, 1);
  assert.equal(experiment.ai.candidates, 1);

  experiment = recordAiSimulationOutcome(experiment, { key: "event-1", signalId: signal.id, outcome: "win" });
  experiment = recordAiSimulationOutcome(experiment, { key: "event-1", signalId: signal.id, outcome: "win" });
  assert.equal(experiment.baseline.wins, 1);
  assert.equal(experiment.ai.wins, 1);
});

test("daily learning compares winners against losses without changing strategy", () => {
  const comparison = buildOutcomeCohortComparison({
    winExamples: [
      { score: 13, volumeRatio: 1.5, adx: 28, marketAlignment: "with-market" },
      { score: 12, volumeRatio: 1.3, adx: 24, marketAlignment: "counter-market" }
    ],
    lossExamples: [
      { score: 11, volumeRatio: 1.1, adx: 19, marketAlignment: "counter-market" }
    ]
  });
  assert.deepEqual(comparison.winners, {
    samples: 2,
    averageScore: 12.5,
    averageVolumeRatio: 1.4,
    averageAdx: 26,
    counterMarketPercent: 50
  });
  assert.equal(comparison.losses.counterMarketPercent, 100);
});

test("executor heartbeat stores state and expiry in one Redis command", { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const requests = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify([{ result: "OK" }]), { status: 200 });
  };
  try {
    const result = await saveExecutorHeartbeat({ mode: "dry-run", ok: true });
    assert.equal(result.mode, "dry-run");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://redis.example.test/pipeline");
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.length, 1);
    assert.equal(body[0][0], "SET");
    assert.equal(body[0][3], "EX");
    assert.equal(body[0][4], 21600);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});

test("Fair Launch defaults enforce the requested anti-rug floor", () => {
  const draft = normalizeFairLaunchDraft(FAIR_LAUNCH_DEFAULTS);
  const assessment = assessFairLaunch(draft);
  assert.equal(draft.creatorLockPercent, 85);
  assert.equal(draft.earlyHolderCount, 2000);
  assert.equal(draft.holderLockPercent, 85);
  assert.equal(draft.cliffMonths, 24);
  assert.equal(assessment.score, 100);
  assert.equal(assessment.readyForAudit, true);
});

test("Fair Launch imported drafts cannot weaken mandatory JamdDmaj rules", () => {
  const draft = normalizeFairLaunchDraft({
    creatorLockPercent: 0,
    earlyHolderCount: 1,
    holderLockPercent: 10,
    cliffMonths: 0,
    releaseMonths: 0,
    liquidityLockMonths: 1,
    maxWalletPercent: 99,
    revokeMintAuthority: false,
    disableFreezeAuthority: false,
    immutableMetadata: false,
    multisigTimelock: false,
    auditRequired: false,
    antiSybilEligibility: false
  });
  assert.equal(draft.creatorLockPercent, 85);
  assert.equal(draft.earlyHolderCount, 2_000);
  assert.equal(draft.holderLockPercent, 85);
  assert.equal(draft.cliffMonths, 24);
  assert.equal(draft.releaseMonths, 12);
  assert.equal(draft.liquidityLockMonths, 24);
  assert.equal(draft.maxWalletPercent, 1);
  assert.equal(draft.revokeMintAuthority, true);
  assert.equal(draft.disableFreezeAuthority, true);
  assert.equal(draft.immutableMetadata, true);
  assert.equal(draft.multisigTimelock, true);
  assert.equal(draft.auditRequired, true);
  assert.equal(draft.antiSybilEligibility, true);
});

test("Fair Launch additions have complete locale parity", () => {
  assert.deepEqual(Object.keys(FAIR_LAUNCH_LOCALES).sort(), ["ar", "de", "en", "es", "fr", "it", "ja", "ko", "pt", "zh"]);
  for (const [locale, catalog] of Object.entries(FAIR_LAUNCH_LOCALES)) {
    assert.deepEqual(Object.keys(catalog).sort(), [...FAIR_LAUNCH_LOCALE_KEYS].sort(), `${locale} locale keys differ`);
    assert.ok(Object.values(catalog).every((value) => typeof value === "string" && value.trim()), `${locale} has an empty translation`);
  }
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const usedKeys = [...html.matchAll(/data-fl-(?:key|aria)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(usedKeys.length > 0);
  usedKeys.forEach((key) => assert.ok(FAIR_LAUNCH_LOCALE_KEYS.includes(key), `Unknown Fair Launch locale key: ${key}`));
});

test("Fair Launch UI exposes a guided flow and non-disableable safety policy", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal((html.match(/data-fair-step="[0-4]"/g) || []).length, 5);
  assert.match(html, /id="fairCreatorLock"[^>]+min="85"[^>]+max="100"/);
  assert.match(html, /id="fairHolderCount"[^>]+min="2000"/);
  assert.match(html, /id="fairCliffMonths"[^>]+min="24"/);
  assert.match(html, /id="fairMaxWallet"[^>]+max="1"/);
  for (const id of ["fairRevokeMint", "fairDisableFreeze", "fairImmutableMetadata", "fairMultisig", "fairAuditRequired", "fairAntiSybil"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]+checked disabled`));
  }
  assert.match(html, /id="fairTransactionPreview"/);
  assert.match(html, /Mainnet bloqueado/);
  assert.match(html, /no auditado/);
  for (const id of ["fairLogoUrl", "fairBannerUrl", "fairWebsiteUrl", "fairXUrl", "fairTelegramUrl", "fairDiscordUrl"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="fairWalletCard"[^>]+hidden/);
  assert.ok(FAIR_LAUNCH_UI_KEYS.includes("creditsNote"));
  assert.match(fairLaunchUiText("en", "creditsNote"), /JamdDmaj credits/);
  assert.match(fairLaunchUiText("es", "creditsNote"), /créditos JamdDmaj/);
});

test("Fair Launch vesting keeps 85% locked for two years and releases gradually", () => {
  assert.deepEqual(calculateFairLaunchVesting(FAIR_LAUNCH_DEFAULTS, 0), {
    month: 0,
    liquidPercent: 15,
    lockedPercent: 85,
    phase: "cliff"
  });
  assert.equal(calculateFairLaunchVesting(FAIR_LAUNCH_DEFAULTS, 24).liquidPercent, 15);
  assert.equal(calculateFairLaunchVesting(FAIR_LAUNCH_DEFAULTS, 30).liquidPercent, 57.5);
  assert.equal(calculateFairLaunchVesting(FAIR_LAUNCH_DEFAULTS, 36).liquidPercent, 100);
});

test("Fair Launch manifest cannot silently authorize a real deployment", () => {
  const manifest = buildFairLaunchManifest({
    ...FAIR_LAUNCH_DEFAULTS,
    projectName: "<script>Bad</script>",
    symbol: "jd maj!",
    logoUrl: "javascript:alert(1)",
    websiteUrl: "https://example.com/project",
    xUrl: "http://insecure.example"
  }, "2026-08-05T20:00:00.000Z");
  assert.equal(manifest.simulationOnly, true);
  assert.equal(manifest.policy.mandatory, true);
  assert.equal(manifest.releaseGate.automaticDeployment, false);
  assert.equal(manifest.releaseGate.explicitMainnetApprovalRequired, true);
  assert.equal(manifest.token.symbol, "JDMAJ");
  assert.doesNotMatch(manifest.token.name, /[<>]/);
  assert.equal(manifest.token.branding.logoUrl, "");
  assert.equal(manifest.token.links.website, "https://example.com/project");
  assert.equal(manifest.token.links.x, "");
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
  assert.equal(chartVisionModels()[0], "openrouter/free");
  const models = chartVisionModels("paid/model,google/gemma-4-26b-a4b-it:free");
  assert.equal(models[0], "google/gemma-4-26b-a4b-it:free");
  assert.ok(models.every((model) => model.endsWith(":free") || model === "openrouter/free"));
  assert.ok(models.some((model) => model.includes("gemma")));
});

test("wallet discovery accepts only Solana Wallet Standard providers", () => {
  const connect = async () => ({ accounts: [] });
  const wallets = getCompatibleSolanaWallets([
    { name: "Phantom", chains: ["solana:mainnet"], features: { "standard:connect": { connect } } },
    { name: "EVM only", chains: ["eip155:1"], features: { "standard:connect": { connect } } },
    { name: "Missing connect", chains: ["solana:mainnet"], features: {} }
  ]);
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0].name, "Phantom");
});

test("wallet account validation rejects malformed or non-Solana addresses", () => {
  const address = "9xQeWvG816bUx9EPjHmaT23yvVMbK4zZ7uQh7s9WfJpN";
  assert.equal(getSolanaAccount([{ address, chains: ["solana:mainnet"] }])?.address, address);
  assert.equal(getSolanaAccount([{ address: "not-an-address", chains: ["solana:mainnet"] }]), null);
  assert.equal(getSolanaAccount([{ address, chains: ["eip155:1"] }]), null);
});

test("wallet labels are bounded and addresses are privacy shortened", () => {
  assert.equal(sanitizeWalletName("Safe\u0000Wallet"), "Safe Wallet");
  assert.equal(sanitizeWalletName("x".repeat(80)).length, 50);
  assert.equal(shortenWalletAddress("12345678901234567890"), "123456…567890");
});

test("boost plans use fixed JamdDmaj credits and reject incompatible services", () => {
  const plan = buildBoostPlan({
    stage: "before",
    days: 7,
    services: ["featured", "analytics", "featured", "unknown"]
  });
  assert.equal(plan.paymentEnabled, false);
  assert.deepEqual(plan.services.map((item) => item.key), ["featured"]);
  assert.equal(plan.totalCredits, JDMAJ_BOOST_CATALOG.featured.creditsPerDay * 7);
  assert.equal(plan.currency, "JamdDmaj platform credits");
  assert.equal(plan.safeguards.noFakeVolume, true);
  assert.equal(plan.safeguards.noPriceManipulation, true);
});

test("devnet token creation stays gated to safe fixed-supply Token-2022 requests", () => {
  const account = { address: "11111111111111111111111111111111", chains: ["solana:devnet"] };
  const wallet = {
    features: {
      "solana:signAndSendTransaction": {
        supportedTransactionVersions: [0],
        signAndSendTransaction() {}
      }
    }
  };
  const safe = {
    network: "solana-token-2022",
    totalSupply: 1_000_000,
    decimals: 6,
    revokeMintAuthority: true,
    disableFreezeAuthority: true
  };
  assert.deepEqual(validateDevnetTokenRequest(safe, wallet, account), []);
  assert.ok(validateDevnetTokenRequest({ ...safe, network: "base-erc20" }, wallet, account).length > 0);
  assert.ok(validateDevnetTokenRequest({ ...safe, revokeMintAuthority: false }, wallet, account).length > 0);
  assert.ok(validateDevnetTokenRequest({ ...safe, decimals: 18 }, wallet, account).length > 0);
});

test("Wallet Standard registry discovers providers before and after app startup", () => {
  const target = new EventTarget();
  const earlyWallet = { name: "Early" };
  const lateWallet = { name: "Late" };
  target.addEventListener("wallet-standard:app-ready", (event) => event.detail.register(earlyWallet));
  const registry = createWalletRegistry(target);
  assert.deepEqual(registry.get(), [earlyWallet]);

  target.dispatchEvent(walletEvent("wallet-standard:register-wallet", (api) => api.register(lateWallet)));
  assert.deepEqual(registry.get(), [earlyWallet, lateWallet]);
});
