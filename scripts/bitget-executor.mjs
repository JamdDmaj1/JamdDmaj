#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ENV_PATH = process.env.JAMDDMAJ_EXECUTOR_ENV || "/opt/jamddmaj-scanner/.env";
const STATE_PATH = process.env.JAMDDMAJ_EXECUTOR_STATE || "/opt/jamddmaj-scanner/executor-state.json";
const LOG_PREFIX = "[jamddmaj-bitget]";

loadDotEnv(ENV_PATH);

const settings = {
  appUrl: cleanUrl(process.env.JAMDDMAJ_URL || "https://jamd-dmaj.vercel.app"),
  cronSecret: String(process.env.JAMDDMAJ_CRON_SECRET || "").trim(),
  clientConnector: String(process.env.JAMDDMAJ_CLIENT_CONNECTOR || "false").toLowerCase() === "true",
  clientFeedToken: String(process.env.JAMDDMAJ_CLIENT_FEED_TOKEN || "").trim(),
  mode: normalizeMode(process.env.JAMDDMAJ_BITGET_MODE),
  confirmation: String(process.env.JAMDDMAJ_LIVE_CONFIRM || "").trim(),
  apiKey: String(process.env.BITGET_API_KEY || "").trim(),
  apiSecret: String(process.env.BITGET_API_SECRET || "").trim(),
  passphrase: String(process.env.BITGET_PASSPHRASE || "").trim(),
  allowEntryOnly: String(process.env.JAMDDMAJ_LIVE_ENTRY_ONLY || "false").toLowerCase() === "true",
  exitManagerEnabled: String(process.env.JAMDDMAJ_EXIT_MANAGER || "false").toLowerCase() === "true",
  exitProtectionTriggerRoe: clampNumber(process.env.JAMDDMAJ_EXIT_PROTECTION_TRIGGER_ROE, 1, 100, 10),
  exitProtectionLockRoe: clampNumber(process.env.JAMDDMAJ_EXIT_PROTECTION_LOCK_ROE, 0.1, 50, 2),
  exitCloseAtRoe: optionalPositiveNumber(process.env.JAMDDMAJ_EXIT_CLOSE_AT_ROE, 500),
  exitCloseOnReversal: String(process.env.JAMDDMAJ_EXIT_CLOSE_ON_REVERSAL || "true").toLowerCase() !== "false",
  productType: String(process.env.BITGET_PRODUCT_TYPE || "USDT-FUTURES").trim(),
  marginCoin: String(process.env.BITGET_MARGIN_COIN || "USDT").trim(),
  marginMode: String(process.env.BITGET_MARGIN_MODE || "isolated").trim(),
  maxOpen: clampInt(process.env.JAMDDMAJ_MAX_LIVE_OPEN, 1, 10, 1),
  maxMarginUsd: clampNumber(process.env.JAMDDMAJ_MAX_LIVE_MARGIN_USD, 5, 1000, 5),
  fixedMarginUsd: clampNumber(process.env.JAMDDMAJ_FIXED_MARGIN_USD, 0, 1000, 0),
  maxNewOrdersPerRun: clampInt(process.env.JAMDDMAJ_MAX_NEW_ORDERS_PER_RUN, 1, 10, 1),
  autoRisk: String(process.env.JAMDDMAJ_AUTO_RISK || "true").toLowerCase() !== "false",
  autoRiskPerTradePercent: clampNumber(process.env.JAMDDMAJ_AUTO_RISK_PER_TRADE_PERCENT, 0.1, 10, 3),
  autoRiskMinMarginUsd: clampNumber(process.env.JAMDDMAJ_AUTO_RISK_MIN_MARGIN_USD, 1, 1000, 5),
  autoRiskReservePercent: clampNumber(process.env.JAMDDMAJ_AUTO_RISK_RESERVE_PERCENT, 0, 80, 20),
  recentOpenMinutes: clampInt(process.env.JAMDDMAJ_RECENT_OPEN_MINUTES, 1, 120, 20),
  maxExecutionSignalAgeMinutes: clampInt(process.env.JAMDDMAJ_MAX_EXECUTION_SIGNAL_AGE_MINUTES, 5, 240, 30),
  traderProfile: normalizeTraderProfile(process.env.JAMDDMAJ_TRADER_PROFILE),
  maxEntryDriftPercent: optionalPositiveNumber(process.env.JAMDDMAJ_MAX_ENTRY_DRIFT_PERCENT, 50),
  weakPatternCooldownHours: clampNumber(process.env.JAMDDMAJ_WEAK_PATTERN_COOLDOWN_HOURS, 1, 168, 12),
  learningMinSamples: clampInt(process.env.JAMDDMAJ_LEARNING_MIN_SAMPLES, 3, 100, 5),
  rejectedSymbolCooldownMinutes: clampInt(process.env.JAMDDMAJ_REJECTED_SYMBOL_COOLDOWN_MINUTES, 5, 240, 20),
  manualTestMaxAgeMinutes: clampInt(process.env.JAMDDMAJ_MANUAL_TEST_MAX_AGE_MINUTES, 1, 30, 10),
  retrySkippedMinutes: clampInt(process.env.JAMDDMAJ_RETRY_SKIPPED_MINUTES, 1, 120, 15),
  minScore: clampInt(process.env.JAMDDMAJ_MIN_LIVE_SCORE, 8, 20, 14),
  strictRegimeMinScore: clampInt(process.env.JAMDDMAJ_STRICT_REGIME_MIN_SCORE, 8, 20, 16),
  defensiveMaxLeverage: clampInt(process.env.JAMDDMAJ_DEFENSIVE_MAX_LEVERAGE, 1, 20, 5),
  defensiveMaxMarginUsd: clampNumber(process.env.JAMDDMAJ_DEFENSIVE_MAX_MARGIN_USD, 1, 1000, 3),
  allowMeme: String(process.env.JAMDDMAJ_ALLOW_MEME_LIVE || "false").toLowerCase() === "true",
  minLiquidityUsd: clampNumber(process.env.JAMDDMAJ_MIN_LIVE_LIQUIDITY_USD, 0, 1_000_000_000, 3_000_000),
  maxDailyLossUsd: clampNumber(process.env.JAMDDMAJ_MAX_DAILY_LOSS_USD, 1, 100000, 25),
  maxDailyLossPercent: clampNumber(process.env.JAMDDMAJ_MAX_DAILY_LOSS_PERCENT, 0.1, 100, 3),
  maxConsecutiveLosses: clampInt(process.env.JAMDDMAJ_MAX_CONSECUTIVE_LOSSES, 1, 20, 2),
  maxTradesPerDay: clampInt(process.env.JAMDDMAJ_MAX_TRADES_PER_DAY, 1, 100, 3)
};

main().catch(async (error) => {
  console.error(`${LOG_PREFIX} fatal ${error?.message || error}`);
  await reportExecutorStatus({ ok: false, lastError: error?.message || String(error) }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  if (!settings.cronSecret && !settings.clientConnector) {
    throw new Error("JAMDDMAJ_CRON_SECRET is required unless JAMDDMAJ_CLIENT_CONNECTOR=true is set.");
  }

  const state = readJson(STATE_PATH, createExecutorState());
  pruneState(state);

  const scan = await runScanner();
  const executorTest = await fetchExecutorTestSignal().catch(() => null);
  const manualSignals = executorTest?.signal ? [{ ...executorTest.signal, executorSource: "manual-test", manualTest: true }] : [];
  const newSignals = Array.isArray(scan?.signals) ? scan.signals : [];
  const recentOpen = selectRecentOpenSignals(scan?.openSignals || scan?.open || [], settings.recentOpenMinutes);
  const signals = mergeSignalSources([...manualSignals, ...newSignals], recentOpen);
  const events = Array.isArray(scan?.events) ? scan.events : [];
  const policy = normalizeExecutorPolicy(scan?.executor);
  state.effectivePolicy = policy;
  const accountRisk = settings.mode === "live" ? await fetchBitgetAccountRisk(policy).catch((error) => {
    console.warn(`${LOG_PREFIX} account risk warning: ${error?.message || error}`);
    return null;
  }) : null;
  applyAutoRiskPolicy(policy, accountRisk);
  state.accountRisk = accountRisk || null;
  let livePositions = [];
  if (settings.mode === "live") {
    validateLiveSecrets();
    livePositions = await reconcileBitgetPositions(state, policy);
  }
  const marketContext = await fetchMarketContext();
  const decisions = createDecisionSummary(signals, events);
  decisions.newSignals = newSignals.length;
  decisions.manualTestSignals = manualSignals.length;
  decisions.recentOpenSignals = recentOpen.length;
  decisions.marketGate = summarizeMarketGate(marketContext, policy);
  decisions.traderProfile = effectiveTraderProfile(policy);
  learnFromOutcomeEvents(state, events, policy);
  state.lastOutcomeEvents = compactOutcomeEvents(events);
  state.lastMarketGate = decisions.marketGate;

  console.log(`${LOG_PREFIX} scan ok. manualTest=${manualSignals.length} newSignals=${newSignals.length} recentOpen=${recentOpen.length} totalSignals=${signals.length} events=${events.length} mode=${settings.mode} maxOpen=${policy.maxOpen} perRun=${policy.maxNewOrdersPerRun}`);

  const executable = [];
  for (const signal of signals) {
    const decision = executableDecision(signal, state, policy, marketContext);
    if (decision.ok) {
      executable.push({
        signal,
        rank: rankExecutionSignal(signal, state, policy, marketContext, accountRisk),
        reason: decision.reason
      });
    } else {
      recordRejection(decisions, decision.reason, signal);
      console.log(`${LOG_PREFIX} reject ${signal?.pair || signal?.symbol || "unknown"} ${signal?.side || ""}: ${decision.reason}`);
    }
  }
  decisions.executableSignals = executable.length;
  const rankedExecutable = sortRankedSignals(executable);
  decisions.topRanked = rankedExecutable.slice(0, 5).map(({ signal, rank, reason }) => ({
    pair: signal?.pair || signal?.symbol || "",
    side: signal?.side || "",
    score: Number(signal?.score || 0),
    rank,
    reason
  }));
  const candidates = rankedExecutable
    .slice(0, Number(policy.maxNewOrdersPerRun) || settings.maxNewOrdersPerRun)
    .map((item) => item.signal);
  state.lastDecisionSummary = decisions;
  if (settings.mode === "live" && isExitManagerEnabled(policy)) {
    await manageLiveExits(state, livePositions, events, policy);
  }

  if (settings.mode === "off" || policy.livePaused) {
    const reason = policy.livePaused ? "remote live pause is active" : "execution off";
    console.log(`${LOG_PREFIX} ${reason}. candidates=${candidates.length}`);
    state.lastAction = reason;
    recordRejection(decisions, reason, candidates[0] || null);
    state.updatedAt = new Date().toISOString();
    writeJson(STATE_PATH, state);
    await reportExecutorStatus(statusPayload(state, { ok: true, livePaused: policy.livePaused, lastAction: reason }));
    return;
  }

  if (!candidates.length) {
    console.log(`${LOG_PREFIX} no executable candidates after filters.`);
    if (!state.lastAction || !String(state.lastAction).startsWith("exit manager")) state.lastAction = "no executable candidates after filters";
    state.updatedAt = new Date().toISOString();
    writeJson(STATE_PATH, state);
    await reportExecutorStatus(statusPayload(state, { ok: true, livePaused: policy.livePaused }));
    return;
  }


  const riskBlock = dailyRiskBlock(state, policy);
  if (riskBlock) {
    console.log(`${LOG_PREFIX} risk block: ${riskBlock}`);
    state.lastAction = `risk block: ${riskBlock}`;
    recordRejection(decisions, state.lastAction, candidates[0] || null);
    state.updatedAt = new Date().toISOString();
    writeJson(STATE_PATH, state);
    await reportExecutorStatus(statusPayload(state, { ok: true, livePaused: true, lastAction: state.lastAction }));
    return;
  }

  const contracts = settings.mode === "live" ? await getContracts() : new Map();
  let cycleOpenCount = settings.mode === "live"
    ? livePositions.length
    : state.orders.filter((order) => order.status === "OPEN" || order.status === "DRY_RUN").length;
  for (const signal of candidates) {
    const maxOpenLimit = Number(policy.maxOpen) || settings.maxOpen;
    if (cycleOpenCount >= maxOpenLimit) {
      console.log(`${LOG_PREFIX} max open reached (${cycleOpenCount}/${maxOpenLimit}).`);
      recordRejection(decisions, `max open reached (${cycleOpenCount}/${maxOpenLimit})`, signal);
      break;
    }
    if (dailyRiskBlock(state, policy)) {
      console.log(`${LOG_PREFIX} daily risk limit reached during run.`);
      recordRejection(decisions, "daily risk limit reached during run", signal);
      break;
    }

    const plan = buildOrderPlan(signal, contracts, marketContext, policy, accountRisk);
    if (!plan.ok) {
      rememberSkip(state, signal, plan.reason);
      recordRejection(decisions, plan.reason, signal);
      console.log(`${LOG_PREFIX} skip ${signal.pair}: ${plan.reason}`);
      continue;
    }

    if (settings.mode === "dry-run") {
      state.orders.unshift(createStateOrder(signal, plan, "DRY_RUN"));
      state.lastDryRunSignal = compactOrder(state.orders[0]);
      state.lastAction = `dry-run ${signal.pair} ${signal.side}`;
      cycleOpenCount += 1;
      console.log(`${LOG_PREFIX} dry-run ${signal.pair} ${signal.side} margin=$${plan.marginUsd} notional=$${plan.notionalUsd} size=${plan.size}`);
      continue;
    }

    await prepareBitgetLeverage(plan).catch((error) => {
      console.warn(`${LOG_PREFIX} leverage setup warning ${plan.pair}: ${error?.message || error}`);
    });
    try {
      const placed = await placeMarketOrder(plan);
      state.orders.unshift(createStateOrder(signal, plan, "OPEN", placed));
      state.lastLiveSignal = compactOrder(state.orders[0]);
      incrementDailyTrades(state);
      state.lastAction = `LIVE order sent ${signal.pair} ${signal.side}`;
      cycleOpenCount += 1;
      console.log(`${LOG_PREFIX} LIVE order sent ${signal.pair} ${signal.side} clientOid=${plan.clientOid}`);
    } catch (error) {
      const reason = error?.message || String(error);
      rememberSkip(state, signal, reason);
      recordRejection(decisions, reason, signal);
      state.lastAction = reason;
      console.warn(`${LOG_PREFIX} reject ${plan.pair}: ${reason}`);
      continue;
    }
  }

  state.updatedAt = new Date().toISOString();
  state.orders = state.orders.slice(0, 250);
  writeJson(STATE_PATH, state);
  await reportExecutorStatus(statusPayload(state, { ok: true, livePaused: policy.livePaused }));
}

async function runScanner() {
  if (settings.clientConnector) return fetchClientFeed();
  const response = await fetch(`${settings.appUrl}/api/pro-cron`, {
    headers: { Authorization: `Bearer ${settings.cronSecret}` }
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || body?.error) {
    throw new Error(body?.error?.message || body?.message || `scanner returned ${response.status}`);
  }
  return body;
}

async function fetchClientFeed() {
  const headers = settings.clientFeedToken ? { "X-JamdDmaj-Client-Token": settings.clientFeedToken } : {};
  const response = await fetch(`${settings.appUrl}/api/pro-client-feed`, { headers });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok || body?.error) {
    throw new Error(body?.error?.message || body?.message || `client feed returned ${response.status}`);
  }
  return body;
}

function selectRecentOpenSignals(openSignals, minutes) {
  if (!Array.isArray(openSignals)) return [];
  const now = Date.now();
  const cutoff = now - (Number(minutes) || 20) * 60000;
  return openSignals
    .filter((signal) => signal && signal.status === "OPEN")
    .filter((signal) => {
      const monitoredUntil = Date.parse(signal.monitoredUntil || signal.validUntil || signal.expiresAt || "");
      if (Number.isFinite(monitoredUntil) && monitoredUntil >= now) return true;
      const created = Date.parse(signal.createdAt || signal.checkedAt || signal.updatedAt || "");
      if (Number.isFinite(created) && created >= cutoff) return true;
      return signal.executionAllowed === true && signal.bitgetEligible !== false;
    })
    .map((signal) => ({ ...signal, executorSource: "open-signal" }));
}

function mergeSignalSources(newSignals, recentOpen) {
  const merged = new Map();
  for (const signal of [...(Array.isArray(newSignals) ? newSignals : []), ...(Array.isArray(recentOpen) ? recentOpen : [])]) {
    if (!signal?.id) continue;
    if (!merged.has(signal.id)) merged.set(signal.id, signal);
  }
  return [...merged.values()];
}
async function fetchExecutorTestSignal() {
  if (settings.clientConnector || !settings.cronSecret) return null;
  const response = await fetch(`${settings.appUrl}/api/pro-executor-test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.cronSecret}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) return null;
  return body?.executorTest || null;
}

async function fetchMarketContext() {
  try {
    const response = await fetch(`${settings.appUrl}/api/pro-news`, {
      headers: { "User-Agent": "JamdDmaj-Pro-Executor/1.37.32" }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) return null;
    return body?.context || null;
  } catch {
    return null;
  }
}

function summarizeMarketGate(context = {}, policy = {}) {
  const effectiveMinScore = clampInt(policy?.minScore, 8, 20, settings.minScore);
  const effectiveStrictScore = clampInt(policy?.strictRegimeMinScore, 8, 20, settings.strictRegimeMinScore);
  const effectiveLiquidity = clampNumber(policy?.minLiquidityUsd, 0, 1_000_000_000, settings.minLiquidityUsd);
  const effectiveAllowMeme = policy?.allowMemeLive === undefined ? settings.allowMeme : policy.allowMemeLive === true;
  const effectiveDefensiveLeverage = clampInt(policy?.defensiveMaxLeverage, 1, 20, settings.defensiveMaxLeverage);
  const effectiveDefensiveMargin = clampNumber(policy?.defensiveMaxMarginUsd, 1, 1000, settings.defensiveMaxMarginUsd);
  const fearGreed = Number(context?.fearGreed?.value);
  const marketCapChange24h = Number(context?.marketCapChange24h);
  const bitcoinDominance = Number(context?.bitcoinDominance);
  const regime = String(context?.regime || "unknown");
  const riskOff = /risk-off/i.test(regime)
    || (Number.isFinite(fearGreed) && fearGreed <= 30)
    || (Number.isFinite(marketCapChange24h) && marketCapChange24h <= -1);
  const extremeFear = Number.isFinite(fearGreed) && fearGreed <= 20;
  const strictMinScore = riskOff
    ? Math.max(effectiveMinScore, effectiveStrictScore)
    : effectiveMinScore;
  return {
    regime,
    fearGreed: Number.isFinite(fearGreed) ? fearGreed : null,
    marketCapChange24h: Number.isFinite(marketCapChange24h) ? marketCapChange24h : null,
    bitcoinDominance: Number.isFinite(bitcoinDominance) ? bitcoinDominance : null,
    riskOff,
    extremeFear,
    strictMinScore,
    defensiveMaxLeverage: riskOff ? effectiveDefensiveLeverage : null,
    defensiveMaxMarginUsd: riskOff ? effectiveDefensiveMargin : null,
    allowMemeLive: effectiveAllowMeme,
    minLiquidityUsd: effectiveLiquidity,
    updatedAt: new Date().toISOString()
  };
}

function marketGateDecision(signal, gate) {
  const side = String(signal.side || "").toUpperCase();
  const base = String(signal.baseSymbol || signal.pair || signal.symbol || "").replace(/[^A-Z0-9]/gi, "").replace(/USDT.*$/i, "").toUpperCase();
  const coreAsset = ["BTC", "ETH"].includes(base);
  const score = Number(signal.score || 0);
  const liquidity = Number(signal.quoteVolume || signal.liquidity24h || 0);
  const riskFlags = Array.isArray(signal.riskFlags) ? signal.riskFlags : [];
  const category = String(signal.category || "");
  if (!gate?.riskOff) return { ok: true, reason: "market gate passed" };
  if (gate.extremeFear && side === "LONG" && !coreAsset) {
    return { ok: false, reason: "extreme fear blocks non-core longs" };
  }
  if (side === "LONG" && !coreAsset && score < gate.strictMinScore + 1) {
    return { ok: false, reason: `risk-off long needs score ${gate.strictMinScore + 1}` };
  }
  if (!gate.allowMemeLive && (/meme/i.test(category) || riskFlags.includes("MARKET_CAP_UNAVAILABLE"))) {
    return { ok: false, reason: "risk-off blocks meme/unknown-cap assets" };
  }
  const minLiquidity = Number(gate.minLiquidityUsd || settings.minLiquidityUsd);
  if (liquidity && liquidity < minLiquidity * 2) {
    return { ok: false, reason: `risk-off liquidity below ${minLiquidity * 2}` };
  }
  return { ok: true, reason: "market gate passed" };
}

function executionFreshnessDecision(signal, policy = {}) {
  const maxAgeMinutes = signal?.manualTest === true
    ? settings.manualTestMaxAgeMinutes
    : clampInt(policy?.maxExecutionSignalAgeMinutes, 5, 240, settings.maxExecutionSignalAgeMinutes);
  const expiresAt = latestFiniteDate(signal?.validUntil, signal?.expiresAt, signal?.monitoredUntil);
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return { ok: false, reason: "stale signal expired" };
  const startedAt = earliestFiniteDate(signal?.executorQueuedAt, signal?.createdAt, signal?.openedAt, signal?.telegramSentAt, signal?.detectedAt, signal?.receivedAt);
  if (!Number.isFinite(startedAt)) return { ok: true, reason: "freshness unknown" };
  const ageMinutes = (Date.now() - startedAt) / 60000;
  if (ageMinutes > maxAgeMinutes) return { ok: false, reason: `stale signal older than ${maxAgeMinutes}m` };
  return { ok: true, reason: "fresh signal" };
}

function earliestFiniteDate(...values) {
  const stamps = values.map((value) => Date.parse(value || "")).filter(Number.isFinite);
  return stamps.length ? Math.min(...stamps) : NaN;
}

function latestFiniteDate(...values) {
  const stamps = values.map((value) => Date.parse(value || "")).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : NaN;
}

function executableDecision(signal, state, policy = {}, marketContext = null) {
  if (!signal) return { ok: false, reason: "missing signal" };
  if (!signal.id || !signal.pair || !signal.side) return { ok: false, reason: "missing id/pair/side" };
  const freshness = executionFreshnessDecision(signal, policy);
  if (!freshness.ok) return freshness;
  const rejectionBlock = recentSymbolRejectionDecision(signal, state);
  if (!rejectionBlock.ok) return rejectionBlock;
  const seenBlock = seenSignalBlockReason(state, signal);
  if (seenBlock) return { ok: false, reason: seenBlock };
  const gate = summarizeMarketGate(marketContext, policy);
  const minScore = gate.strictMinScore;
  if (signal.manualTest === true) {
    if (Number(signal.score || 0) < 8) return { ok: false, reason: "manual test score below 8" };
  } else if (Number(signal.score) < minScore) {
    return { ok: false, reason: `score below ${minScore}` };
  }
  if (!gate.allowMemeLive && /meme/i.test(String(signal.category || ""))) return { ok: false, reason: "meme live disabled" };
  const liquidity = Number(signal.quoteVolume || signal.liquidityUsd || signal.liquidity24h || 0);
  const minLiquidity = Number(gate.minLiquidityUsd || settings.minLiquidityUsd);
  if (liquidity && liquidity < minLiquidity) return { ok: false, reason: `liquidity below ${minLiquidity}` };
  if (!["LONG", "SHORT"].includes(String(signal.side).toUpperCase())) return { ok: false, reason: "invalid side" };
  const gateDecision = marketGateDecision(signal, gate);
  if (!gateDecision.ok) return gateDecision;
  const weakDecision = weakPatternDecision(signal, state, policy);
  if (!weakDecision.ok) return weakDecision;
  const categoryDecision = categoryLearningDecision(signal, state, policy);
  if (!categoryDecision.ok) return categoryDecision;
  const timing = entryTimingDecision(signal, policy);
  if (!timing.ok) return timing;
  return { ok: true, reason: gate.riskOff ? "passed strict regime filters" : "passed executor filters" };
}

function recentSymbolRejectionDecision(signal, state) {
  const symbol = bitgetSymbolForSignal(signal);
  if (!symbol) return { ok: true, reason: "no symbol rejection history" };
  const item = state.rejectedSymbols?.[symbol];
  const blockedUntil = Date.parse(item?.blockedUntil || "");
  if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
    return { ok: false, reason: `recent Bitget rejection cooldown ${symbol}` };
  }
  return { ok: true, reason: "no recent Bitget rejection" };
}
function seenSignalBlockReason(state, signal) {
  const seen = state.seen?.[signal.id];
  if (!seen) return "";
  if (isDuplicateClientOidReason(seen.reason)) {
    delete state.seen[signal.id];
    return "";
  }
  const signalSymbol = bitgetSymbolForSignal(signal);
  const liveSymbols = new Set(Array.isArray(state.liveSymbols) ? state.liveSymbols : []);
  if (seen.orderedAt) {
    if ((settings.mode === "live" || state.bitgetSynced === true) && signalSymbol && !liveSymbols.has(signalSymbol)) {
      delete state.seen[signal.id];
      return "";
    }
    return "already ordered";
  }
  const skippedAt = Date.parse(seen.skippedAt || "");
  const retryMs = settings.retrySkippedMinutes * 60000;
  const canRetry = signal.status === "OPEN" || signal.executorSource === "open-signal" || signal.executorSource === "manual-test";
  if (canRetry && Number.isFinite(skippedAt) && Date.now() - skippedAt >= retryMs) {
    delete state.seen[signal.id];
    return "";
  }
  if (canRetry && Number.isFinite(skippedAt)) return `retry cooldown after ${seen.reason || "skip"}`;
  return "already seen";
}

function bitgetSymbolForSignal(signal = {}) {
  const raw = String(
    signal.bitgetPair
    || signal.pair
    || signal.symbol
    || ""
  ).toUpperCase();
  return raw
    .replace(/\s*PERP\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .replace(/USDTUSDT$/g, "USDT");
}

function exchangePrice(value, multiplier = 1) {
  const number = Number(value);
  const scale = Number(multiplier) || 1;
  return Number.isFinite(number) && number > 0 ? number * scale : number;
}
function buildOrderPlan(signal, contracts, marketContext = null, policy = {}, accountRisk = null) {
  const symbol = bitgetSymbolForSignal(signal);
  const displayPrice = Number(signal.entry || signal.currentPrice || signal.lastPrice);
  const multiplier = clampNumber(signal.contractMultiplier, 1, 1_000_000, 1);
  const price = exchangePrice(displayPrice, multiplier);
  if (!symbol.endsWith("USDT")) return { ok: false, reason: "only USDT futures are allowed" };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "missing price" };

  const gate = summarizeMarketGate(marketContext, policy);
  const maxMarginUsd = clampNumber(policy?.maxLiveMarginUsd || policy?.maxMarginUsd, 1, 1000, settings.maxMarginUsd);
  const fixedMarginUsd = clampNumber(policy?.fixedMarginUsd, 0, 1000, settings.fixedMarginUsd);
  const manualCap = gate.riskOff ? Math.min(maxMarginUsd, gate.defensiveMaxMarginUsd || maxMarginUsd) : maxMarginUsd;
  const marginCap = Math.min(manualCap, autoRiskMarginCap(accountRisk, manualCap));
  const leverageCap = gate.riskOff ? Math.min(50, gate.defensiveMaxLeverage || 5) : 50;
  const requestedMarginUsd = fixedMarginUsd > 0 ? fixedMarginUsd : Number(signal.plannedUsd);
  const marginUsd = Math.min(requestedMarginUsd || marginCap, marginCap);
  const leverage = clampInt(signal.leverage, 1, leverageCap, Math.min(10, leverageCap));
  const notionalUsd = roundMoney(marginUsd * leverage);
  const rawSize = notionalUsd / price;
  const contract = contracts.get(symbol);
  if (settings.mode === "live" && !contract) return { ok: false, reason: `Bitget contract not found ${symbol}` };
  const volumePlace = contract ? clampInt(contract.volumePlace, 0, 12, 4) : 4;
  const pricePlace = contract ? clampInt(contract.pricePlace, 0, 12, 4) : 4;
  const priceEndStep = contract ? clampNumber(contract.priceEndStep, 1, 1000000, 1) : 1;
  const minTradeNum = Number(contract?.minTradeNum || 0);
  const size = floorToPlace(rawSize, volumePlace);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: "calculated size is too small" };
  if (minTradeNum && size < minTradeNum) return { ok: false, reason: `size below Bitget minimum ${minTradeNum}` };

  return {
    ok: true,
    signalId: signal.id,
    pair: signal.pair,
    symbol,
    side: signal.side === "LONG" ? "buy" : "sell",
    marginUsd: roundMoney(marginUsd),
    leverage,
    notionalUsd,
    price,
    sl: exchangePrice(Number(signal.sl), multiplier),
    tp1: exchangePrice(Number(signal.tp1), multiplier),
    pricePlace,
    priceEndStep,
    size: String(size),
    clientOid: makeClientOid(signal),
    policy
  };
}

function makeClientOid(signal = {}) {
  const base = String(signal.id || signal.pair || signal.symbol || "sig").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 26) || "sig";
  const stamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString("hex");
  return `jamd-${base}-${stamp}-${random}`.slice(0, 60);
}

function signalLearningKey(signal = {}) {
  const symbol = bitgetSymbolForSignal(signal).replace(/USDT$/i, "");
  return symbol || String(signal.baseSymbol || signal.pair || signal.symbol || "unknown").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function signalCategoryKey(signal = {}) {
  const category = String(signal.category || signal.theme || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
  const side = String(signal.side || "ANY").toUpperCase();
  return `${category}:${side}`;
}

function normalizeTraderProfile(value) {
  const profile = String(value || "balanced").trim().toLowerCase();
  return ["conservative", "balanced", "aggressive"].includes(profile) ? profile : "balanced";
}

function effectiveTraderProfile(policy = {}) {
  const name = normalizeTraderProfile(policy?.traderProfile || settings.traderProfile);
  const presets = {
    conservative: { name, label: "conservative", maxEntryDriftPercent: 0.7, weakWinRateMin: 48, weakMinSamples: 5, cooldownHours: 18 },
    balanced: { name, label: "balanced", maxEntryDriftPercent: 1.2, weakWinRateMin: 42, weakMinSamples: 5, cooldownHours: 12 },
    aggressive: { name, label: "aggressive", maxEntryDriftPercent: 2.0, weakWinRateMin: 35, weakMinSamples: 4, cooldownHours: 6 }
  };
  const preset = presets[name] || presets.balanced;
  return {
    ...preset,
    maxEntryDriftPercent: optionalPositiveNumber(policy?.maxEntryDriftPercent, 50, settings.maxEntryDriftPercent ?? preset.maxEntryDriftPercent) || preset.maxEntryDriftPercent,
    weakMinSamples: clampInt(policy?.learningMinSamples, 3, 100, settings.learningMinSamples || preset.weakMinSamples),
    cooldownHours: clampNumber(policy?.weakPatternCooldownHours, 1, 168, settings.weakPatternCooldownHours || preset.cooldownHours)
  };
}

function entryTimingDecision(signal, policy = {}) {
  const profile = effectiveTraderProfile(policy);
  const entry = Number(signal.entry);
  const current = firstFiniteNumber(signal.currentPrice, signal.lastPrice, signal.markPrice, signal.entry);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(current) || current <= 0) return { ok: true, reason: "entry timing unknown" };
  const side = String(signal.side || "").toUpperCase();
  const drift = side === "SHORT" ? ((entry - current) / entry) * 100 : ((current - entry) / entry) * 100;
  if (drift > profile.maxEntryDriftPercent) {
    return { ok: false, reason: `entry drift ${drift.toFixed(2)}% > ${profile.maxEntryDriftPercent}%` };
  }
  return { ok: true, reason: `entry drift ${drift.toFixed(2)}%` };
}

function weakPatternDecision(signal, state, policy = {}) {
  const profile = effectiveTraderProfile(policy);
  const key = signalLearningKey(signal);
  const learning = state.symbolLearning?.[key];
  if (!learning) return { ok: true, reason: "no weak-pattern history" };
  const weakUntil = Date.parse(learning.weakUntil || "");
  if (Number.isFinite(weakUntil) && weakUntil > Date.now()) {
    return { ok: false, reason: `weak learned pattern cooldown ${key}` };
  }
  const samples = Number(learning.samples || 0);
  const winRate = Number(learning.winRate || 0);
  if (samples >= profile.weakMinSamples && winRate > 0 && winRate < profile.weakWinRateMin) {
    learning.weakUntil = new Date(Date.now() + profile.cooldownHours * 3600000).toISOString();
    return { ok: false, reason: `weak learned pattern ${key} ${winRate.toFixed(1)}%` };
  }
  return { ok: true, reason: "learned pattern passed" };
}

function categoryLearningDecision(signal, state, policy = {}) {
  const profile = effectiveTraderProfile(policy);
  const key = signalCategoryKey(signal);
  const learning = state.categoryLearning?.[key];
  if (!learning) return { ok: true, reason: "no category history" };
  const weakUntil = Date.parse(learning.weakUntil || "");
  if (Number.isFinite(weakUntil) && weakUntil > Date.now()) {
    return { ok: false, reason: `weak learned category cooldown ${key}` };
  }
  const samples = Number(learning.samples || 0);
  const winRate = Number(learning.winRate || 0);
  const minSamples = Math.max(profile.weakMinSamples * 2, 8);
  const weakRate = Math.max(20, profile.weakWinRateMin - 5);
  if (samples >= minSamples && winRate > 0 && winRate < weakRate) {
    learning.weakUntil = new Date(Date.now() + profile.cooldownHours * 3600000).toISOString();
    return { ok: false, reason: `weak learned category ${key} ${winRate.toFixed(1)}%` };
  }
  return { ok: true, reason: "category learning passed" };
}

function learnFromOutcomeEvents(state, events, policy = {}) {
  state.symbolLearning = state.symbolLearning && typeof state.symbolLearning === "object" ? state.symbolLearning : {};
  state.categoryLearning = state.categoryLearning && typeof state.categoryLearning === "object" ? state.categoryLearning : {};
  state.learnedEvents = state.learnedEvents && typeof state.learnedEvents === "object" ? state.learnedEvents : {};
  for (const event of Array.isArray(events) ? events : []) {
    const signal = event?.signal || event || {};
    const outcome = outcomeFromEvent(event);
    if (!outcome) continue;
    const eventKey = String(event?.id || signal.id || `${signal.pair || signal.symbol}:${event?.type || ""}:${event?.closedAt || event?.createdAt || ""}`).slice(0, 180);
    if (!eventKey || state.learnedEvents[eventKey]) continue;
    state.learnedEvents[eventKey] = new Date().toISOString();
    learnFromSignalOutcome(state, signal, outcome, policy, "server-event");
  }
  pruneLearningState(state);
}

function learnFromSignalOutcome(state, signal, outcome, policy = {}, source = "executor") {
  if (!["win", "loss"].includes(outcome)) return;
  state.symbolLearning = state.symbolLearning && typeof state.symbolLearning === "object" ? state.symbolLearning : {};
  state.categoryLearning = state.categoryLearning && typeof state.categoryLearning === "object" ? state.categoryLearning : {};
  const profile = effectiveTraderProfile(policy);
  const symbolKey = signalLearningKey(signal);
  const categoryKey = signalCategoryKey(signal);
  updateLearningBucket(state.symbolLearning, symbolKey, { symbol: symbolKey }, outcome, profile, source);
  updateLearningBucket(state.categoryLearning, categoryKey, { category: categoryKey }, outcome, profile, source, Math.max(profile.weakMinSamples * 2, 8), Math.max(20, profile.weakWinRateMin - 5));
}

function updateLearningBucket(store, key, base, outcome, profile, source, minSamples = profile.weakMinSamples, weakWinRateMin = profile.weakWinRateMin) {
  if (!key) return;
  const item = store[key] || { ...base, wins: 0, losses: 0, samples: 0, winRate: 0 };
  if (outcome === "win") item.wins = Number(item.wins || 0) + 1;
  if (outcome === "loss") item.losses = Number(item.losses || 0) + 1;
  item.samples = Number(item.wins || 0) + Number(item.losses || 0);
  item.winRate = item.samples ? (Number(item.wins || 0) / item.samples) * 100 : 0;
  item.lastOutcome = outcome;
  item.lastSource = source;
  item.lastOutcomeAt = new Date().toISOString();
  if (item.samples >= minSamples && item.winRate < weakWinRateMin) {
    item.weakUntil = new Date(Date.now() + profile.cooldownHours * 3600000).toISOString();
  }
  store[key] = item;
}

function rankExecutionSignal(signal, state, policy = {}, marketContext = null, accountRisk = null) {
  const profile = effectiveTraderProfile(policy);
  const gate = summarizeMarketGate(marketContext, policy);
  let rank = Number(signal.score || 0);
  if (signal.manualTest === true) rank += 50;
  rank += liquidityRankBonus(signal);
  rank += marketAlignmentRank(signal, gate);
  rank += learningRankBonus(state.symbolLearning?.[signalLearningKey(signal)]);
  rank += learningRankBonus(state.categoryLearning?.[signalCategoryKey(signal)]) * 0.65;
  rank -= entryDriftRankPenalty(signal, profile);
  rank -= spreadRankPenalty(signal);
  rank -= recentRejectionRankPenalty(signal, state);
  if (accountRisk?.enabled && Number(accountRisk.marginCapUsd || 0) > 0) rank += 0.25;
  return Number(rank.toFixed(2));
}

function sortRankedSignals(items = []) {
  return [...items].sort((a, b) => (
    Number(b.rank || 0) - Number(a.rank || 0)
    || Number(b.signal?.score || 0) - Number(a.signal?.score || 0)
    || String(b.signal?.createdAt || "").localeCompare(String(a.signal?.createdAt || ""))
  ));
}

function liquidityRankBonus(signal = {}) {
  const liquidity = Number(signal.quoteVolume || signal.liquidityUsd || signal.liquidity24h || 0);
  if (!Number.isFinite(liquidity) || liquidity <= 0) return -0.4;
  return Math.min(2.5, Math.max(0, Math.log10(liquidity / 1_000_000 + 1)));
}

function marketAlignmentRank(signal = {}, gate = {}) {
  const side = String(signal.side || "").toUpperCase();
  const base = signalLearningKey(signal);
  const core = ["BTC", "ETH", "SOL", "BNB"].includes(base);
  if (gate?.riskOff) {
    if (side === "SHORT") return core ? 0.8 : 0.45;
    return core ? 0.1 : -1.25;
  }
  if (/btc-led|risk-on/i.test(String(gate?.regime || "")) && side === "LONG") return core ? 0.75 : 0.35;
  return 0;
}

function learningRankBonus(item = null) {
  if (!item || !Number(item.samples || 0)) return 0;
  const samples = Math.min(20, Number(item.samples || 0));
  const winRate = Number(item.winRate || 0);
  const centered = (winRate - 50) / 25;
  return Math.max(-2.5, Math.min(2.5, centered * Math.log2(samples + 1)));
}

function entryDriftRankPenalty(signal = {}, profile = {}) {
  const entry = Number(signal.entry);
  const current = firstFiniteNumber(signal.currentPrice, signal.lastPrice, signal.markPrice, signal.entry);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(current) || current <= 0) return 0.2;
  const side = String(signal.side || "").toUpperCase();
  const drift = side === "SHORT" ? ((entry - current) / entry) * 100 : ((current - entry) / entry) * 100;
  if (drift <= 0) return 0;
  const maxDrift = Number(profile.maxEntryDriftPercent || 1.2);
  return Math.max(0, (drift / Math.max(0.1, maxDrift)) * 1.4);
}

function spreadRankPenalty(signal = {}) {
  const spread = Number(signal.spreadPercent || signal.spread || 0);
  if (!Number.isFinite(spread) || spread <= 0) return 0;
  return Math.min(2, spread * 18);
}

function recentRejectionRankPenalty(signal = {}, state = {}) {
  const symbol = bitgetSymbolForSignal(signal);
  const item = symbol ? state.rejectedSymbols?.[symbol] : null;
  if (!item) return 0;
  const attempts = Number(item.attempts || 0);
  return Math.min(4, attempts * 0.75);
}

function outcomeFromEvent(event = {}) {
  const type = String(event.type || event.status || event.outcome || "").toUpperCase();
  if (/(PROTECTED_WIN|TP|WIN)/.test(type)) return "win";
  if (/(INVALIDATED|REVERSAL|SL|LOSS)/.test(type)) return "loss";
  return null;
}

function compactOutcomeEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .map((event) => {
      const signal = event?.signal || event || {};
      const outcome = outcomeFromEvent(event);
      const type = String(event?.type || signal.status || event?.status || event?.outcome || "").slice(0, 40);
      if (!outcome && !type) return null;
      return {
        id: String(event?.id || signal.id || `${signal.pair || signal.symbol}:${type}:${signal.closedAt || event?.closedAt || signal.createdAt || ""}`).slice(0, 180),
        pair: String(signal.pair || signal.symbol || "").slice(0, 40),
        side: String(signal.side || "").slice(0, 10),
        type,
        outcome: outcome || "",
        score: Number(signal.score || 0),
        category: String(signal.category || "").slice(0, 80),
        entry: Number(signal.entry || 0),
        closePrice: Number(signal.closePrice || 0),
        createdAt: signal.createdAt || event?.createdAt || "",
        closedAt: signal.closedAt || event?.closedAt || ""
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function pruneLearningState(state) {
  const learnedEntries = Object.entries(state.learnedEvents || {}).sort((a, b) => String(b[1]).localeCompare(String(a[1])));
  state.learnedEvents = Object.fromEntries(learnedEntries.slice(0, 500));
  const learningEntries = Object.entries(state.symbolLearning || {}).sort((a, b) => String(b[1]?.lastOutcomeAt || "").localeCompare(String(a[1]?.lastOutcomeAt || "")));
  state.symbolLearning = Object.fromEntries(learningEntries.slice(0, 120));
  const categoryEntries = Object.entries(state.categoryLearning || {}).sort((a, b) => String(b[1]?.lastOutcomeAt || "").localeCompare(String(a[1]?.lastOutcomeAt || "")));
  state.categoryLearning = Object.fromEntries(categoryEntries.slice(0, 80));
}

function pruneRejectedSymbols(state) {
  const now = Date.now();
  const entries = Object.entries(state.rejectedSymbols || {})
    .filter(([, item]) => {
      const rejectedAt = Date.parse(item?.lastRejectedAt || "");
      const blockedUntil = Date.parse(item?.blockedUntil || "");
      if (Number.isFinite(blockedUntil) && blockedUntil > now) return true;
      return Number.isFinite(rejectedAt) && now - rejectedAt < 6 * 3600000;
    })
    .sort((a, b) => String(b[1]?.lastRejectedAt || "").localeCompare(String(a[1]?.lastRejectedAt || "")));
  state.rejectedSymbols = Object.fromEntries(entries.slice(0, 80));
}

async function getContracts() {
  const response = await fetch(`https://api.bitget.com/api/v2/mix/market/contracts?productType=${encodeURIComponent(settings.productType)}`);
  const body = await response.json();
  const contracts = new Map();
  for (const item of Array.isArray(body?.data) ? body.data : []) {
    if (item?.symbol) contracts.set(String(item.symbol), item);
  }
  return contracts;
}

async function placeMarketOrder(plan) {
  let result = await submitMarketOrder(plan);
  if (result?.code !== "00000" && /duplicate clientoid/i.test(String(result?.msg || ""))) {
    plan.clientOid = makeClientOid({ id: plan.signalId, pair: plan.pair, symbol: plan.symbol });
    console.warn(`${LOG_PREFIX} retrying ${plan.pair} with fresh clientOid after duplicate rejection`);
    result = await submitMarketOrder(plan);
  }
  if (result?.code !== "00000") {
    throw new Error(`Bitget rejected ${plan.pair}: ${result?.msg || JSON.stringify(result)}`);
  }
  return result;
}

async function submitMarketOrder(plan) {
  const body = {
    symbol: plan.symbol,
    productType: settings.productType,
    marginMode: settings.marginMode,
    marginCoin: settings.marginCoin,
    size: plan.size,
    side: plan.side,
    tradeSide: "open",
    orderType: "market",
    clientOid: plan.clientOid
  };
  if (Number.isFinite(plan.sl) && plan.sl > 0) body.presetStopLossPrice = formatBitgetPrice(plan.sl, plan.pricePlace, plan.priceEndStep);
  if (Number.isFinite(plan.tp1) && plan.tp1 > 0) body.presetStopSurplusPrice = formatBitgetPrice(plan.tp1, plan.pricePlace, plan.priceEndStep);
  return bitgetRequest("POST", "/api/v2/mix/order/place-order", body);
}

async function prepareBitgetLeverage(plan) {
  const body = {
    symbol: plan.symbol,
    productType: settings.productType,
    marginCoin: settings.marginCoin,
    leverage: String(plan.leverage),
    holdSide: plan.side === "buy" ? "long" : "short"
  };
  const result = await bitgetRequest("POST", "/api/v2/mix/account/set-leverage", body);
  if (result?.code && result.code !== "00000") {
    throw new Error(result?.msg || `Bitget leverage ${result.code}`);
  }
}

async function fetchBitgetAccountRisk(policy = {}) {
  if (!settings.autoRisk || policy?.autoRisk === false) return null;
  validateLiveSecrets();
  const result = await bitgetRequest("GET", `/api/v2/mix/account/accounts?productType=${encodeURIComponent(settings.productType)}`);
  if (result?.code && result.code !== "00000") {
    throw new Error(`Bitget account rejected: ${result?.msg || result.code}`);
  }
  const rows = Array.isArray(result?.data) ? result.data : [];
  const account = rows.find((item) => String(item.marginCoin || item.marginCoinName || "").toUpperCase() === settings.marginCoin.toUpperCase()) || rows[0] || null;
  if (!account) return null;
  const equity = firstFiniteNumber(account.accountEquity, account.equity, account.marginBalance, account.usdtEquity, account.crossedEquity);
  const modeAvailable = settings.marginMode.toLowerCase().startsWith("cross")
    ? account.crossedMaxAvailable
    : account.isolatedMaxAvailable;
  const available = firstFiniteNumber(modeAvailable, account.available, account.availableBalance, account.availableMargin, account.crossedMaxAvailable, account.isolatedMaxAvailable);
  if (!Number.isFinite(equity) || equity <= 0) return null;
  const riskPercent = clampNumber(policy?.autoRiskPerTradePercent, 0.1, 10, settings.autoRiskPerTradePercent);
  const reservePercent = clampNumber(policy?.autoRiskReservePercent, 0, 80, settings.autoRiskReservePercent);
  const minMarginUsd = clampNumber(policy?.autoRiskMinMarginUsd, 1, 1000, settings.autoRiskMinMarginUsd);
  const desiredMaxOpen = clampInt(policy?.maxOpen, 1, 10, settings.maxOpen);
  const fixedMarginUsd = clampNumber(policy?.fixedMarginUsd, 0, 1000, settings.fixedMarginUsd);
  const maxLiveMarginUsd = clampNumber(policy?.maxLiveMarginUsd || policy?.maxMarginUsd, 1, 1000, settings.maxMarginUsd);
  const reserve = Math.max(0, Math.min(equity, equity * reservePercent / 100));
  const availableBase = Number.isFinite(available) && available > 0 ? available : equity;
  const equitySpendable = Math.max(0, equity - reserve);
  const spendable = Math.max(0, Math.min(availableBase, equitySpendable));
  const marginCap = roundMoney(Math.max(minMarginUsd, equitySpendable * riskPercent / 100));
  const positionBudgetUsd = Math.max(minMarginUsd, fixedMarginUsd > 0 ? fixedMarginUsd : maxLiveMarginUsd);
  const maxOpenByEquity = Math.max(1, Math.min(desiredMaxOpen, Math.floor(equitySpendable / positionBudgetUsd) || 1));
  const maxTradesByEquity = equity < 100 ? 2 : equity < 500 ? 3 : equity < 2000 ? 5 : 8;
  return {
    enabled: true,
    source: "bitget-account",
    marginCoin: String(account.marginCoin || settings.marginCoin),
    equity: roundMoney(equity),
    available: Number.isFinite(available) ? roundMoney(available) : null,
    equitySpendable: roundMoney(equitySpendable),
    spendable: roundMoney(spendable),
    positionBudgetUsd: roundMoney(positionBudgetUsd),
    reservePercent,
    perTradePercent: riskPercent,
    marginCapUsd: marginCap,
    maxOpenByEquity,
    maxTradesByEquity,
    updatedAt: new Date().toISOString()
  };
}

function applyAutoRiskPolicy(policy, accountRisk) {
  if (!accountRisk?.enabled || !Number.isFinite(Number(accountRisk.equity))) return policy;
  const equity = Number(accountRisk.equity);
  const maxDailyLossPercent = Number(policy.maxDailyLossPercent) || settings.maxDailyLossPercent;
  policy.maxDailyLossUsd = roundMoney(Math.max(1, equity * maxDailyLossPercent / 100));
  const desiredMaxOpen = Number(policy.maxOpen) || settings.maxOpen;
  const desiredPerRun = Number(policy.maxNewOrdersPerRun) || settings.maxNewOrdersPerRun;
  policy.maxOpen = Math.max(1, Math.min(desiredMaxOpen, Number(accountRisk.maxOpenByEquity) || desiredMaxOpen));
  policy.maxNewOrdersPerRun = Math.max(1, Math.min(desiredPerRun, policy.maxOpen));
  const desiredMaxTrades = Number(policy.maxTradesPerDay) || settings.maxTradesPerDay;
  policy.maxTradesPerDay = Math.max(1, desiredMaxTrades);
  accountRisk.suggestedMaxTradesByEquity = accountRisk.maxTradesByEquity;
  accountRisk.maxTradesPerDay = policy.maxTradesPerDay;
  policy.autoRisk = accountRisk;
  return policy;
}

function autoRiskMarginCap(accountRisk, fallbackCap) {
  if (!accountRisk?.enabled) return fallbackCap;
  const cap = Number(accountRisk.marginCapUsd);
  if (!Number.isFinite(cap) || cap <= 0) return fallbackCap;
  return Math.min(fallbackCap, cap);
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

async function reconcileBitgetPositions(state, policy = {}) {
  const result = await bitgetRequest("GET", `/api/v2/mix/position/all-position?productType=${encodeURIComponent(settings.productType)}&marginCoin=${encodeURIComponent(settings.marginCoin)}`);
  if (result?.code && result.code !== "00000") {
    throw new Error(`Bitget positions rejected: ${result?.msg || result.code}`);
  }
  const positions = (Array.isArray(result?.data) ? result.data : [])
    .filter((item) => Math.abs(Number(item.total || item.available || item.size || 0)) > 0);
  const liveSymbols = new Set(positions.map((item) => String(item.symbol || "")));
  state.liveSymbols = [...liveSymbols];
  for (const order of state.orders) {
    if (order.status !== "OPEN" || !order.symbol) continue;
    if (!liveSymbols.has(order.symbol)) {
      order.status = "CLOSED_UNKNOWN";
      order.closedAt = new Date().toISOString();
      const inferredOutcome = inferClosedOrderOutcome(order, policy);
      if (inferredOutcome) learnFromSignalOutcome(state, order, inferredOutcome, policy, "bitget-position-sync");
      if (order.id) delete state.seen[order.id];
    }
  }
  state.bitgetSynced = true;
  state.liveOpenCount = positions.length;
  state.remotePositions = positions.slice(0, 20).map((item) => ({
    symbol: item.symbol,
    holdSide: item.holdSide,
    total: item.total,
    available: item.available,
    unrealizedPL: item.unrealizedPL,
    marginSize: item.marginSize,
    leverage: item.leverage,
    marginMode: item.marginMode,
    breakEvenPrice: item.breakEvenPrice,
    markPrice: item.markPrice
  }));
  state.liveUnrealizedPnl = positions.reduce((sum, item) => sum + (Number(item.unrealizedPL) || 0), 0);
  return positions;
}

async function bitgetRequest(method, requestPath, body) {
  const timestamp = Date.now().toString();
  const payload = body ? JSON.stringify(body) : "";
  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}${payload}`;
  const signature = crypto.createHmac("sha256", settings.apiSecret).update(prehash).digest("base64");
  const response = await fetch(`https://api.bitget.com${requestPath}`, {
    method,
    headers: {
      "ACCESS-KEY": settings.apiKey,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": settings.passphrase,
      "Content-Type": "application/json",
      locale: "en-US"
    },
    ...(payload ? { body: payload } : {})
  });
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { code: String(response.status), msg: text };
  }
}

function validateLiveSecrets() {
  if (settings.confirmation !== "I_ACCEPT_REAL_RISK") {
    throw new Error("Live mode is blocked until JAMDDMAJ_LIVE_CONFIRM=I_ACCEPT_REAL_RISK is set.");
  }
  if (!settings.allowEntryOnly) {
    throw new Error("Live market entries are blocked until JAMDDMAJ_LIVE_ENTRY_ONLY=true is set. Keep dry-run until the exit manager is tested.");
  }
  if (!settings.apiKey || !settings.apiSecret || !settings.passphrase) {
    throw new Error("BITGET_API_KEY, BITGET_API_SECRET, and BITGET_PASSPHRASE are required for live mode.");
  }
}

function createStateOrder(signal, plan, status, response = null) {
  return {
    id: signal.id,
    pair: signal.pair,
    symbol: plan.symbol,
    side: signal.side,
    status,
    source: signal.manualTest ? "manual-test" : (signal.executorSource || "scan"),
    manualTest: signal.manualTest === true,
    category: signal.category || "",
    score: Number(signal.score || 0),
    rawScore: Number(signal.rawScore || signal.score || 0),
    quoteVolume: Number(signal.quoteVolume || signal.liquidityUsd || signal.liquidity24h || 0),
    clientOid: plan.clientOid,
    marginUsd: plan.marginUsd,
    leverage: plan.leverage,
    notionalUsd: plan.notionalUsd,
    size: plan.size,
    entry: plan.price,
    pricePlace: plan.pricePlace,
    priceEndStep: plan.priceEndStep,
    displayEntry: Number(signal.entry || 0),
    contractMultiplier: Number(signal.contractMultiplier || 1),
    tp1: plan.tp1,
    sl: plan.sl,
    exitPlan: buildExitPlan(signal, plan, plan.policy || {}),
    response,
    createdAt: new Date().toISOString()
  };
}

function buildExitPlan(signal, plan, policy = {}) {
  const exit = effectiveExitSettings(policy);
  return {
    ready: true,
    entryOnly: settings.allowEntryOnly,
    tp1: Number(plan.tp1) || null,
    sl: Number(plan.sl) || null,
    protectionTriggerRoe: exit.protectionTriggerRoe,
    protectionLockRoe: exit.protectionLockRoe,
    note: settings.allowEntryOnly
      ? "Entry-only live guard is active; monitor TP/SL before enabling full exits."
      : "TP1/SL are planned and positions are reconciled; full automatic exits remain guarded."
  };
}

async function manageLiveExits(state, positions, events = [], policy = {}) {
  if (!isExitManagerEnabled(policy) || settings.mode !== "live") return;
  const exit = effectiveExitSettings(policy);
  const exitTypes = new Set(["REVERSAL", "REVERSAL_PROFIT", "INVALIDATED", "SL"]);
  const exitEvents = (Array.isArray(events) ? events : []).filter((event) => exitTypes.has(String(event?.type || "")));
  for (const order of state.orders.filter((item) => item?.status === "OPEN" && item.symbol)) {
    const position = findMatchingPosition(order, positions);
    if (!position) continue;
    const roe = positionRoe(position, order);
    if (Number.isFinite(roe)) {
      order.currentRoe = Number(roe.toFixed(2));
      order.maxRoe = Math.max(Number(order.maxRoe || -999), order.currentRoe);
      if (exit.closeAtRoe > 0 && order.currentRoe >= exit.closeAtRoe) {
        try {
          await closeLivePosition(order, `ROE take profit ${exit.closeAtRoe}%`, position);
          state.lastExitAction = `exit manager closed ${order.pair || order.symbol}: ROE take profit ${exit.closeAtRoe}%`;
          state.lastAction = state.lastExitAction;
          continue;
        } catch (error) {
          state.lastExitAction = `exit manager take-profit close failed ${order.pair || order.symbol}: ${error?.message || error}`;
          state.lastAction = state.lastExitAction;
          console.warn(`${LOG_PREFIX} ${state.lastExitAction}`);
        }
      }
      if ((!order.protectionActive || !order.protectionBitgetConfirmedAt) && order.currentRoe >= exit.protectionTriggerRoe) {
        try {
          const protection = await placeProtectedStopLoss(order, position, exit);
          order.protectionActive = true;
          order.protectionActivatedAt = order.protectionActivatedAt || new Date().toISOString();
          order.protectionBitgetConfirmedAt = new Date().toISOString();
          order.protectionPrice = protection.price;
          order.protectionResponse = protection.result;
          state.lastExitAction = `exit manager protected ${order.pair || order.symbol} on Bitget at ${order.currentRoe}% ROE`;
          state.lastAction = state.lastExitAction;
          console.log(`${LOG_PREFIX} ${state.lastExitAction} price=${protection.price}`);
        } catch (error) {
          order.protectionActive = false;
          order.protectionError = error?.message || String(error);
          state.lastExitAction = `exit manager protection failed ${order.pair || order.symbol}: ${order.protectionError}`;
          state.lastAction = state.lastExitAction;
          console.warn(`${LOG_PREFIX} ${state.lastExitAction}`);
        }
      }
      if (order.protectionActive && order.currentRoe > 0 && order.currentRoe <= exit.protectionLockRoe) {
        try {
          await closeLivePosition(order, "protected ROE lock", position);
          state.lastExitAction = `exit manager closed ${order.pair || order.symbol}: protected ROE lock`;
          state.lastAction = state.lastExitAction;
        } catch (error) {
          state.lastExitAction = `exit manager close failed ${order.pair || order.symbol}: ${error?.message || error}`;
          state.lastAction = state.lastExitAction;
          console.warn(`${LOG_PREFIX} ${state.lastExitAction}`);
        }
        continue;
      }
      if (order.protectionActive && order.currentRoe <= 0 && order.lastNegativeProtectionSkipRoe !== order.currentRoe) {
        order.lastNegativeProtectionSkipRoe = order.currentRoe;
        state.lastExitAction = `exit manager skipped negative protected-lock close ${order.pair || order.symbol}: ${order.currentRoe}% ROE`;
        state.lastAction = state.lastExitAction;
        console.warn(`${LOG_PREFIX} ${state.lastExitAction}`);
      }
    }
    const event = exitEvents.find((item) => eventMatchesOrder(item, order));
    if (exit.closeOnReversal && event) {
      try {
        await closeLivePosition(order, `server ${event.type}`, position);
        state.lastExitAction = `exit manager closed ${order.pair || order.symbol}: server ${event.type}`;
        state.lastAction = state.lastExitAction;
      } catch (error) {
        state.lastExitAction = `exit manager close failed ${order.pair || order.symbol}: ${error?.message || error}`;
        state.lastAction = state.lastExitAction;
        console.warn(`${LOG_PREFIX} ${state.lastExitAction}`);
      }
    }
  }
}

async function placeProtectedStopLoss(order, position = {}, exit = {}) {
  const price = protectedStopPrice(order, position, exit);
  const holdSide = String(position.holdSide || (order.side === "LONG" ? "long" : "short")).toLowerCase();
  const triggerPrice = formatBitgetPrice(price, order.pricePlace, order.priceEndStep);
  if (!triggerPrice) throw new Error("missing protected stop price");
  const body = {
    marginCoin: settings.marginCoin,
    productType: settings.productType,
    symbol: order.symbol,
    holdSide,
    triggerType: "mark_price",
    planType: "pos_loss",
    stopLossTriggerPrice: triggerPrice,
    stopLossExecutePrice: "0"
  };
  let result = await bitgetRequest("POST", "/api/v2/mix/order/place-pos-tpsl", body);
  if (result?.code && result.code !== "00000") {
    const fallback = {
      marginCoin: settings.marginCoin,
      productType: settings.productType,
      symbol: order.symbol,
      holdSide,
      triggerType: "mark_price",
      planType: "loss_plan",
      triggerPrice,
      executePrice: "0",
      size: String(position.available || position.total || order.size || "")
    };
    result = await bitgetRequest("POST", "/api/v2/mix/order/place-tpsl-order", fallback);
  }
  if (result?.code && result.code !== "00000") throw new Error(`Bitget protection rejected ${order.pair || order.symbol}: ${result?.msg || result.code}`);
  return { price: Number(triggerPrice), result };
}

function protectedStopPrice(order, position = {}, exit = {}) {
  const entry = firstFiniteNumber(position.averageOpenPrice, position.openPriceAvg, position.openPrice, position.entryPrice, position.breakEvenPrice, order.entry);
  const leverage = Math.max(1, firstFiniteNumber(position.leverage, order.leverage, 10));
  const lockRoe = clampNumber(exit.protectionLockRoe, 0.1, 50, settings.exitProtectionLockRoe);
  if (!Number.isFinite(entry) || entry <= 0) return NaN;
  const move = lockRoe / 100 / leverage;
  return order.side === "SHORT" ? entry * (1 - move) : entry * (1 + move);
}

function findMatchingPosition(order, positions) {
  const wantedHold = order.side === "LONG" ? "long" : order.side === "SHORT" ? "short" : "";
  return (Array.isArray(positions) ? positions : []).find((item) => (
    String(item.symbol || "") === String(order.symbol || "")
    && (!wantedHold || !item.holdSide || String(item.holdSide).toLowerCase() === wantedHold)
  )) || null;
}

function positionRoe(position, order) {
  const pnl = Number(position.unrealizedPL || position.unrealizedPnl || 0);
  const margin = Number(position.marginSize || position.margin || order.marginUsd || 0);
  return margin > 0 ? (pnl / margin) * 100 : NaN;
}

function inferClosedOrderOutcome(order = {}, policy = {}) {
  const exit = effectiveExitSettings(policy);
  const currentRoe = Number(order.currentRoe || 0);
  const maxRoe = Number(order.maxRoe || 0);
  if (order.protectionActive === true || maxRoe >= Number(exit.protectionTriggerRoe || settings.exitProtectionTriggerRoe)) return "win";
  if (Number.isFinite(currentRoe) && currentRoe <= -1) return "loss";
  if (/WIN|TP/i.test(String(order.status || order.exitReason || ""))) return "win";
  if (/LOSS|SL|INVALID/i.test(String(order.status || order.exitReason || ""))) return "loss";
  return "";
}

function eventMatchesOrder(event, order) {
  const signal = event?.signal || {};
  const eventId = String(signal.id || "");
  const eventPair = String(signal.pair || signal.symbol || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const orderPair = String(order.pair || order.symbol || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return (eventId && eventId === String(order.id || "")) || (eventPair && orderPair && eventPair === orderPair);
}

async function closeLivePosition(order, reason, position = {}) {
  const holdSide = String(position.holdSide || (order.side === "LONG" ? "long" : "short")).toLowerCase();
  const body = {
    symbol: order.symbol,
    productType: settings.productType,
    holdSide
  };
  const result = await bitgetRequest("POST", "/api/v2/mix/order/close-positions", body);
  if (result?.code && result.code !== "00000") throw new Error(`Bitget close rejected ${order.pair || order.symbol}: ${result?.msg || result.code}`);
  order.status = "CLOSED_BY_EXIT_MANAGER";
  order.exitReason = reason;
  order.closedAt = new Date().toISOString();
  order.closeResponse = result;
  console.log(`${LOG_PREFIX} exit manager closed ${order.pair || order.symbol}: ${reason}`);
  return result;
}

function rememberSkip(state, signal, reason) {
  if (isDuplicateClientOidReason(reason)) {
    delete state.seen[signal.id];
    return;
  }
  state.seen[signal.id] = { skippedAt: new Date().toISOString(), reason };
  rememberSymbolRejection(state, signal, reason);
}

function rememberSymbolRejection(state, signal, reason = "") {
  if (!isCoolingRejection(reason)) return;
  const symbol = bitgetSymbolForSignal(signal);
  if (!symbol) return;
  state.rejectedSymbols = state.rejectedSymbols && typeof state.rejectedSymbols === "object" ? state.rejectedSymbols : {};
  const current = state.rejectedSymbols[symbol] || { symbol, attempts: 0 };
  current.attempts = Number(current.attempts || 0) + 1;
  current.lastReason = String(reason || "").slice(0, 180);
  current.lastRejectedAt = new Date().toISOString();
  if (current.attempts >= 2 || /bitget rejected|take profit price|should be|does not exist|price you enter/i.test(String(reason))) {
    current.blockedUntil = new Date(Date.now() + settings.rejectedSymbolCooldownMinutes * 60000).toISOString();
  }
  state.rejectedSymbols[symbol] = current;
}

function isCoolingRejection(reason = "") {
  return /bitget rejected|take profit price|price you enter|does not exist|contract not found|calculated size|size below/i.test(String(reason || ""));
}

function isDuplicateClientOidReason(reason = "") {
  return /duplicate\s+clientoid/i.test(String(reason));
}

function pruneState(state) {
  state.orders = Array.isArray(state.orders) ? state.orders : [];
  state.seen = state.seen && typeof state.seen === "object" ? state.seen : {};
  for (const [id, seen] of Object.entries(state.seen)) {
    if (isDuplicateClientOidReason(seen?.reason)) delete state.seen[id];
  }
  state.daily = normalizeDailyState(state.daily);
  state.symbolLearning = state.symbolLearning && typeof state.symbolLearning === "object" ? state.symbolLearning : {};
  state.categoryLearning = state.categoryLearning && typeof state.categoryLearning === "object" ? state.categoryLearning : {};
  state.learnedEvents = state.learnedEvents && typeof state.learnedEvents === "object" ? state.learnedEvents : {};
  state.rejectedSymbols = state.rejectedSymbols && typeof state.rejectedSymbols === "object" ? state.rejectedSymbols : {};
  pruneRejectedSymbols(state);
  pruneLearningState(state);
  for (const order of state.orders) {
    if (order?.id) state.seen[order.id] = state.seen[order.id] || { orderedAt: order.createdAt || new Date().toISOString() };
  }
}

function createExecutorState() {
  return { version: 5, updatedAt: null, seen: {}, orders: [], daily: normalizeDailyState({}), symbolLearning: {}, categoryLearning: {}, rejectedSymbols: {}, learnedEvents: {}, lastOutcomeEvents: [], lastDecisionSummary: createDecisionSummary([], []) };
}

async function reportExecutorStatus(payload) {
  if (!settings.cronSecret) return;
  await fetch(`${settings.appUrl}/api/pro-executor`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.cronSecret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function statusPayload(state, overrides = {}) {
  const daily = normalizeDailyState(state.daily);
  return {
    mode: settings.mode,
    clientConnector: settings.clientConnector,
    ok: overrides.ok === true,
    livePaused: overrides.livePaused === true,
    lastRunAt: new Date().toISOString(),
    openCount: state.bitgetSynced === true ? Number(state.liveOpenCount || 0) : state.orders.filter((order) => order.status === "OPEN").length,
    dailyRealizedPnl: daily.realizedPnl,
    liveUnrealizedPnl: Number(state.liveUnrealizedPnl || 0),
    dailyTrades: daily.trades,
    consecutiveLosses: daily.consecutiveLosses,
    lastAction: overrides.lastAction || state.lastAction || "",
    lastError: overrides.lastError || "",
    bitgetSynced: state.bitgetSynced === true,
    effectivePolicy: {
      maxOpen: Number(state.effectivePolicy?.maxOpen || settings.maxOpen),
      maxNewOrdersPerRun: Number(state.effectivePolicy?.maxNewOrdersPerRun || settings.maxNewOrdersPerRun),
      maxLiveMarginUsd: Number(state.effectivePolicy?.maxLiveMarginUsd || settings.maxMarginUsd),
      fixedMarginUsd: Number(state.effectivePolicy?.fixedMarginUsd || settings.fixedMarginUsd),
      minScore: Number(state.effectivePolicy?.minScore || settings.minScore),
      strictRegimeMinScore: Number(state.effectivePolicy?.strictRegimeMinScore || settings.strictRegimeMinScore),
      traderProfile: normalizeTraderProfile(state.effectivePolicy?.traderProfile || settings.traderProfile),
      maxEntryDriftPercent: Number(state.effectivePolicy?.maxEntryDriftPercent || effectiveTraderProfile(state.effectivePolicy || {}).maxEntryDriftPercent)
    },
        decisions: state.lastDecisionSummary || createDecisionSummary([], []),
    symbolLearning: compactSymbolLearning(state.symbolLearning),
    categoryLearning: compactCategoryLearning(state.categoryLearning),
    rejectedSymbols: compactRejectedSymbols(state.rejectedSymbols),
    marketGate: state.lastMarketGate || summarizeMarketGate(null, {}),
    recentOrders: state.orders.slice(0, 8).map(compactOrder),
    recentOutcomeEvents: Array.isArray(state.lastOutcomeEvents) ? state.lastOutcomeEvents.slice(0, 12) : [],
    remotePositions: Array.isArray(state.remotePositions) ? state.remotePositions.slice(0, 8) : [],
    accountRisk: state.accountRisk || null,
    lastDryRunSignal: state.lastDryRunSignal || null,
    lastLiveSignal: state.lastLiveSignal || null,
    exitManager: {
      ready: true,
      enabled: isExitManagerEnabled(state.effectivePolicy || {}),
      entryOnly: settings.allowEntryOnly,
      protectionTriggerRoe: effectiveExitSettings(state.effectivePolicy || {}).protectionTriggerRoe,
      protectionLockRoe: effectiveExitSettings(state.effectivePolicy || {}).protectionLockRoe,
      closeAtRoe: effectiveExitSettings(state.effectivePolicy || {}).closeAtRoe,
      closeOnReversal: effectiveExitSettings(state.effectivePolicy || {}).closeOnReversal,
      lastAction: state.lastExitAction || "",
      note: isExitManagerEnabled(state.effectivePolicy || {})
        ? "Automatic protection and reversal exits are enabled on the VPS."
        : "Prepared TP1/SL planning and position reconciliation. Automatic close manager is opt-in."
    }
  };
}

function createDecisionSummary(signals, events) {
  return {
    totalSignals: Array.isArray(signals) ? signals.length : 0,
    newSignals: 0,
    recentOpenSignals: 0,
    manualTestSignals: 0,
    totalEvents: Array.isArray(events) ? events.length : 0,
    executableSignals: 0,
    topRanked: [],
    marketGate: summarizeMarketGate(null, {}),
    rejected: {},
    examples: [],
    updatedAt: new Date().toISOString()
  };
}

function compactSymbolLearning(value = {}) {
  return Object.values(value || {})
    .sort((a, b) => Number(b.samples || 0) - Number(a.samples || 0))
    .slice(0, 8)
    .map((item) => ({
      symbol: item.symbol || "",
      samples: Number(item.samples || 0),
      winRate: Number(item.winRate || 0),
      weakUntil: item.weakUntil || null
    }));
}

function compactCategoryLearning(value = {}) {
  return Object.values(value || {})
    .sort((a, b) => Number(b.samples || 0) - Number(a.samples || 0))
    .slice(0, 8)
    .map((item) => ({
      category: item.category || "",
      samples: Number(item.samples || 0),
      winRate: Number(item.winRate || 0),
      weakUntil: item.weakUntil || null
    }));
}

function compactRejectedSymbols(value = {}) {
  return Object.values(value || {})
    .sort((a, b) => String(b.lastRejectedAt || "").localeCompare(String(a.lastRejectedAt || "")))
    .slice(0, 8)
    .map((item) => ({
      symbol: item.symbol || "",
      attempts: Number(item.attempts || 0),
      lastReason: item.lastReason || "",
      blockedUntil: item.blockedUntil || null
    }));
}

function recordRejection(summary, reason, signal = null) {
  if (!summary) return;
  const key = String(reason || "unknown").slice(0, 120);
  summary.rejected[key] = (summary.rejected[key] || 0) + 1;
  if (signal && summary.examples.length < 6) {
    summary.examples.push({
      pair: signal.pair || signal.symbol || "",
      side: signal.side || "",
      score: Number(signal.score || 0),
      reason: key
    });
  }
}

function compactOrder(order) {
  if (!order) return null;
  return {
    id: order.id || "",
    pair: order.pair || "",
    symbol: order.symbol || "",
    side: order.side || "",
    status: order.status || "",
    marginUsd: Number(order.marginUsd || 0),
    notionalUsd: Number(order.notionalUsd || 0),
    size: order.size || "",
    entry: Number(order.entry || 0),
    tp1: Number(order.tp1 || 0),
    sl: Number(order.sl || 0),
    currentRoe: Number(order.currentRoe || 0),
    maxRoe: Number(order.maxRoe || 0),
    protectionActive: order.protectionActive === true,
    exitReason: order.exitReason || "",
    createdAt: order.createdAt || "",
    exitPlanReady: order.exitPlan?.ready === true
  };
}

function normalizeExecutorPolicy(value = {}) {
  return {
    livePaused: value?.livePaused === true,
    maxOpen: clampInt(value?.maxOpen ?? value?.maxLiveOpen, 1, 10, settings.maxOpen),
    maxNewOrdersPerRun: clampInt(value?.maxNewOrdersPerRun, 1, 10, settings.maxNewOrdersPerRun),
    maxLiveMarginUsd: clampNumber(value?.maxLiveMarginUsd || value?.maxMarginUsd, 1, 1000, settings.maxMarginUsd),
    fixedMarginUsd: clampNumber(value?.fixedMarginUsd, 0, 1000, settings.fixedMarginUsd),
    minScore: clampInt(value?.minScore, 8, 20, settings.minScore),
    strictRegimeMinScore: clampInt(value?.strictRegimeMinScore, 8, 20, settings.strictRegimeMinScore),
    minLiquidityUsd: clampNumber(value?.minLiquidityUsd, 0, 1_000_000_000, settings.minLiquidityUsd),
    maxExecutionSignalAgeMinutes: clampInt(value?.maxExecutionSignalAgeMinutes, 5, 240, settings.maxExecutionSignalAgeMinutes),
    traderProfile: normalizeTraderProfile(value?.traderProfile || settings.traderProfile),
    maxEntryDriftPercent: optionalPositiveNumber(value?.maxEntryDriftPercent, 50, settings.maxEntryDriftPercent),
    weakPatternCooldownHours: clampNumber(value?.weakPatternCooldownHours, 1, 168, settings.weakPatternCooldownHours),
    learningMinSamples: clampInt(value?.learningMinSamples, 3, 100, settings.learningMinSamples),
    allowMemeLive: value?.allowMemeLive === undefined ? settings.allowMeme : value.allowMemeLive === true,
    defensiveMaxLeverage: clampInt(value?.defensiveMaxLeverage, 1, 20, settings.defensiveMaxLeverage),
    defensiveMaxMarginUsd: clampNumber(value?.defensiveMaxMarginUsd, 1, 1000, settings.defensiveMaxMarginUsd),
    exitManager: value?.exitManager === undefined ? settings.exitManagerEnabled : value.exitManager === true,
    exitProtectionTriggerRoe: clampNumber(value?.exitProtectionTriggerRoe, 1, 100, settings.exitProtectionTriggerRoe),
    exitProtectionLockRoe: clampNumber(value?.exitProtectionLockRoe, 0.1, 50, settings.exitProtectionLockRoe),
    exitCloseOnReversal: value?.exitCloseOnReversal === undefined ? settings.exitCloseOnReversal : value.exitCloseOnReversal !== false,
    maxDailyLossUsd: clampNumber(value?.maxDailyLossUsd, 1, 100000, settings.maxDailyLossUsd),
    maxDailyLossPercent: clampNumber(value?.maxDailyLossPercent, 0.1, 100, settings.maxDailyLossPercent),
    maxConsecutiveLosses: clampInt(value?.maxConsecutiveLosses, 1, 20, settings.maxConsecutiveLosses),
    maxTradesPerDay: clampInt(value?.maxTradesPerDay, 1, 100, settings.maxTradesPerDay)
  };
}

function isExitManagerEnabled(policy = {}) {
  return policy?.exitManager === undefined ? settings.exitManagerEnabled : policy.exitManager === true;
}

function effectiveExitSettings(policy = {}) {
  return {
    protectionTriggerRoe: clampNumber(policy?.exitProtectionTriggerRoe, 1, 100, settings.exitProtectionTriggerRoe),
    protectionLockRoe: clampNumber(policy?.exitProtectionLockRoe, 0.1, 50, settings.exitProtectionLockRoe),
    closeAtRoe: optionalPositiveNumber(policy?.exitCloseAtRoe, 500, settings.exitCloseAtRoe),
    closeOnReversal: policy?.exitCloseOnReversal === undefined ? settings.exitCloseOnReversal : policy.exitCloseOnReversal !== false
  };
}

function normalizeDailyState(value = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (value.day !== today) {
    return { day: today, trades: 0, realizedPnl: 0, consecutiveLosses: 0 };
  }
  return {
    day: today,
    trades: Number(value.trades || 0),
    realizedPnl: Number(value.realizedPnl || 0),
    consecutiveLosses: Number(value.consecutiveLosses || 0)
  };
}

function incrementDailyTrades(state) {
  state.daily = normalizeDailyState(state.daily);
  state.daily.trades += 1;
}

function dailyRiskBlock(state, policy) {
  state.daily = normalizeDailyState(state.daily);
  const daily = state.daily;
  const startingBalance = Number(process.env.JAMDDMAJ_LIVE_RISK_BALANCE_USD || 0);
  const percentLossLimit = startingBalance > 0
    ? -(startingBalance * (Number(policy.maxDailyLossPercent) || settings.maxDailyLossPercent) / 100)
    : -Infinity;
  const usdLossLimit = -(Number(policy.maxDailyLossUsd) || settings.maxDailyLossUsd);
  const lossLimit = Math.max(usdLossLimit, percentLossLimit);
  const combinedPnl = daily.realizedPnl + Math.min(0, Number(state.liveUnrealizedPnl || 0));
  if (combinedPnl <= lossLimit) return `daily/live loss ${combinedPnl} <= ${lossLimit}`;
  if (daily.consecutiveLosses >= (Number(policy.maxConsecutiveLosses) || settings.maxConsecutiveLosses)) return "consecutive loss limit";
  if (daily.trades >= (Number(policy.maxTradesPerDay) || settings.maxTradesPerDay)) return "daily trade limit";
  return "";
}

function formatBitgetPrice(value, pricePlace = null, priceEndStep = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  const places = Number.isFinite(Number(pricePlace)) ? clampInt(pricePlace, 0, 12, 4) : inferredPricePlaces(number);
  const stepUnits = Math.max(1, Number(priceEndStep) || 1);
  const tick = stepUnits / (10 ** places);
  const rounded = Math.round(number / tick) * tick;
  return rounded.toFixed(places).replace(/0+$/, "").replace(/\.$/, "");
}

function inferredPricePlaces(number) {
  if (number >= 100) return 2;
  if (number >= 1) return 4;
  if (number >= 0.01) return 6;
  return 10;
}

function loadDotEnv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function readJson(filePath, fallback) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function normalizeMode(value) {
  const mode = String(value || "off").trim().toLowerCase();
  return ["off", "dry-run", "live"].includes(mode) ? mode : "off";
}

function cleanUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function optionalPositiveNumber(value, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(max, number);
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function floorToPlace(value, places) {
  const scale = 10 ** places;
  return Math.floor(value * scale) / scale;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}
