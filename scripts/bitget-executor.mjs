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
  mode: normalizeMode(process.env.JAMDDMAJ_BITGET_MODE),
  confirmation: String(process.env.JAMDDMAJ_LIVE_CONFIRM || "").trim(),
  apiKey: String(process.env.BITGET_API_KEY || "").trim(),
  apiSecret: String(process.env.BITGET_API_SECRET || "").trim(),
  passphrase: String(process.env.BITGET_PASSPHRASE || "").trim(),
  allowEntryOnly: String(process.env.JAMDDMAJ_LIVE_ENTRY_ONLY || "false").toLowerCase() === "true",
  productType: String(process.env.BITGET_PRODUCT_TYPE || "USDT-FUTURES").trim(),
  marginCoin: String(process.env.BITGET_MARGIN_COIN || "USDT").trim(),
  marginMode: String(process.env.BITGET_MARGIN_MODE || "isolated").trim(),
  maxOpen: clampInt(process.env.JAMDDMAJ_MAX_LIVE_OPEN, 1, 10, 1),
  maxMarginUsd: clampNumber(process.env.JAMDDMAJ_MAX_LIVE_MARGIN_USD, 5, 1000, 5),
  maxNewOrdersPerRun: clampInt(process.env.JAMDDMAJ_MAX_NEW_ORDERS_PER_RUN, 1, 5, 1),
  recentOpenMinutes: clampInt(process.env.JAMDDMAJ_RECENT_OPEN_MINUTES, 1, 120, 20),
  minScore: clampInt(process.env.JAMDDMAJ_MIN_LIVE_SCORE, 8, 20, 14),
  strictRegimeMinScore: clampInt(process.env.JAMDDMAJ_STRICT_REGIME_MIN_SCORE, 8, 20, 16),
  defensiveMaxLeverage: clampInt(process.env.JAMDDMAJ_DEFENSIVE_MAX_LEVERAGE, 1, 20, 5),
  defensiveMaxMarginUsd: clampNumber(process.env.JAMDDMAJ_DEFENSIVE_MAX_MARGIN_USD, 1, 1000, 3),
  allowMeme: String(process.env.JAMDDMAJ_ALLOW_MEME_LIVE || "false").toLowerCase() === "true",
  minLiquidityUsd: clampNumber(process.env.JAMDDMAJ_MIN_LIVE_LIQUIDITY_USD, 0, 1_000_000_000, 3_000_000),
  maxDailyLossUsd: clampNumber(process.env.JAMDDMAJ_MAX_DAILY_LOSS_USD, 1, 100000, 25),
  maxDailyLossPercent: clampNumber(process.env.JAMDDMAJ_MAX_DAILY_LOSS_PERCENT, 0.1, 50, 3),
  maxConsecutiveLosses: clampInt(process.env.JAMDDMAJ_MAX_CONSECUTIVE_LOSSES, 1, 20, 2),
  maxTradesPerDay: clampInt(process.env.JAMDDMAJ_MAX_TRADES_PER_DAY, 1, 100, 3)
};

main().catch(async (error) => {
  console.error(`${LOG_PREFIX} fatal ${error?.message || error}`);
  await reportExecutorStatus({ ok: false, lastError: error?.message || String(error) }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  if (!settings.cronSecret) {
    throw new Error("JAMDDMAJ_CRON_SECRET is required.");
  }

  const state = readJson(STATE_PATH, createExecutorState());
  pruneState(state);

  const scan = await runScanner();
  const newSignals = Array.isArray(scan?.signals) ? scan.signals : [];
  const recentOpen = selectRecentOpenSignals(scan?.openSignals || scan?.open || [], settings.recentOpenMinutes);
  const signals = mergeSignalSources(newSignals, recentOpen);
  const events = Array.isArray(scan?.events) ? scan.events : [];
  const policy = normalizeExecutorPolicy(scan?.executor);
  const marketContext = await fetchMarketContext();
  const decisions = createDecisionSummary(signals, events);
  decisions.newSignals = newSignals.length;
  decisions.recentOpenSignals = recentOpen.length;
  decisions.marketGate = summarizeMarketGate(marketContext, policy);
  state.lastMarketGate = decisions.marketGate;

  console.log(`${LOG_PREFIX} scan ok. newSignals=${newSignals.length} recentOpen=${recentOpen.length} totalSignals=${signals.length} events=${events.length} mode=${settings.mode}`);

  const executable = [];
  for (const signal of signals) {
    const decision = executableDecision(signal, state, policy, marketContext);
    if (decision.ok) {
      executable.push(signal);
    } else {
      recordRejection(decisions, decision.reason, signal);
      console.log(`${LOG_PREFIX} reject ${signal?.pair || signal?.symbol || "unknown"} ${signal?.side || ""}: ${decision.reason}`);
    }
  }
  decisions.executableSignals = executable.length;
  const candidates = executable.slice(0, settings.maxNewOrdersPerRun);
  state.lastDecisionSummary = decisions;

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
    state.lastAction = "no executable candidates after filters";
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

  if (settings.mode === "live") {
    validateLiveSecrets();
  }

  const contracts = settings.mode === "live" ? await getContracts() : new Map();
  const livePositions = settings.mode === "live" ? await reconcileBitgetPositions(state) : [];
  for (const signal of candidates) {
    const openCount = settings.mode === "live"
      ? livePositions.length
      : state.orders.filter((order) => order.status === "OPEN" || order.status === "DRY_RUN").length;
    if (openCount >= settings.maxOpen) {
      console.log(`${LOG_PREFIX} max open reached (${openCount}/${settings.maxOpen}).`);
      recordRejection(decisions, `max open reached (${openCount}/${settings.maxOpen})`, signal);
      break;
    }
    if (dailyRiskBlock(state, policy)) {
      console.log(`${LOG_PREFIX} daily risk limit reached during run.`);
      recordRejection(decisions, "daily risk limit reached during run", signal);
      break;
    }

    const plan = buildOrderPlan(signal, contracts, marketContext);
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
      console.log(`${LOG_PREFIX} dry-run ${signal.pair} ${signal.side} margin=$${plan.marginUsd} notional=$${plan.notionalUsd} size=${plan.size}`);
      continue;
    }

    await prepareBitgetLeverage(plan).catch((error) => {
      console.warn(`${LOG_PREFIX} leverage setup warning ${plan.pair}: ${error?.message || error}`);
    });
    const placed = await placeMarketOrder(plan);
    state.orders.unshift(createStateOrder(signal, plan, "OPEN", placed));
    state.lastLiveSignal = compactOrder(state.orders[0]);
    incrementDailyTrades(state);
    state.lastAction = `LIVE order sent ${signal.pair} ${signal.side}`;
    console.log(`${LOG_PREFIX} LIVE order sent ${signal.pair} ${signal.side} clientOid=${plan.clientOid}`);
  }

  state.updatedAt = new Date().toISOString();
  state.orders = state.orders.slice(0, 250);
  writeJson(STATE_PATH, state);
  await reportExecutorStatus(statusPayload(state, { ok: true, livePaused: policy.livePaused }));
}

async function runScanner() {
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

function selectRecentOpenSignals(openSignals, minutes) {
  if (!Array.isArray(openSignals)) return [];
  const cutoff = Date.now() - (Number(minutes) || 20) * 60000;
  return openSignals
    .filter((signal) => signal && signal.status === "OPEN")
    .filter((signal) => {
      const created = Date.parse(signal.createdAt || "");
      return Number.isFinite(created) && created >= cutoff;
    })
    .map((signal) => ({ ...signal, executorSource: "recent-open" }));
}

function mergeSignalSources(newSignals, recentOpen) {
  const merged = new Map();
  for (const signal of [...(Array.isArray(newSignals) ? newSignals : []), ...(Array.isArray(recentOpen) ? recentOpen : [])]) {
    if (!signal?.id) continue;
    if (!merged.has(signal.id)) merged.set(signal.id, signal);
  }
  return [...merged.values()];
}
async function fetchMarketContext() {
  try {
    const response = await fetch(`${settings.appUrl}/api/pro-news`, {
      headers: { "User-Agent": "JamdDmaj-Pro-Executor/1.36.4" }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) return null;
    return body?.context || null;
  } catch {
    return null;
  }
}

function summarizeMarketGate(context = {}, policy = {}) {
  const fearGreed = Number(context?.fearGreed?.value);
  const marketCapChange24h = Number(context?.marketCapChange24h);
  const bitcoinDominance = Number(context?.bitcoinDominance);
  const regime = String(context?.regime || "unknown");
  const riskOff = /risk-off/i.test(regime)
    || (Number.isFinite(fearGreed) && fearGreed <= 30)
    || (Number.isFinite(marketCapChange24h) && marketCapChange24h <= -1);
  const extremeFear = Number.isFinite(fearGreed) && fearGreed <= 20;
  const strictMinScore = riskOff
    ? Math.max(settings.minScore, settings.strictRegimeMinScore)
    : settings.minScore;
  return {
    regime,
    fearGreed: Number.isFinite(fearGreed) ? fearGreed : null,
    marketCapChange24h: Number.isFinite(marketCapChange24h) ? marketCapChange24h : null,
    bitcoinDominance: Number.isFinite(bitcoinDominance) ? bitcoinDominance : null,
    riskOff,
    extremeFear,
    strictMinScore,
    defensiveMaxLeverage: riskOff ? settings.defensiveMaxLeverage : null,
    defensiveMaxMarginUsd: riskOff ? settings.defensiveMaxMarginUsd : null,
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
  if (/meme/i.test(category) || riskFlags.includes("MARKET_CAP_UNAVAILABLE")) {
    return { ok: false, reason: "risk-off blocks meme/unknown-cap assets" };
  }
  if (liquidity && liquidity < settings.minLiquidityUsd * 2) {
    return { ok: false, reason: `risk-off liquidity below ${settings.minLiquidityUsd * 2}` };
  }
  return { ok: true, reason: "market gate passed" };
}

function executableDecision(signal, state, policy = {}, marketContext = null) {
  if (!signal) return { ok: false, reason: "missing signal" };
  if (!signal.id || !signal.pair || !signal.side) return { ok: false, reason: "missing id/pair/side" };
  if (state.seen[signal.id]) return { ok: false, reason: "already seen" };
  const gate = summarizeMarketGate(marketContext, policy);
  const minScore = gate.strictMinScore;
  if (Number(signal.score) < minScore) return { ok: false, reason: `score below ${minScore}` };
  if (!settings.allowMeme && /meme/i.test(String(signal.category || ""))) return { ok: false, reason: "meme live disabled" };
  const liquidity = Number(signal.quoteVolume || signal.liquidityUsd || signal.liquidity24h || 0);
  if (liquidity && liquidity < settings.minLiquidityUsd) return { ok: false, reason: `liquidity below ${settings.minLiquidityUsd}` };
  if (!["LONG", "SHORT"].includes(String(signal.side).toUpperCase())) return { ok: false, reason: "invalid side" };
  const gateDecision = marketGateDecision(signal, gate);
  if (!gateDecision.ok) return gateDecision;
  return { ok: true, reason: gate.riskOff ? "passed strict regime filters" : "passed executor filters" };
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

function bitgetPriceStep(contract) {
  const place = clampInt(contract?.pricePlace, 0, 12, 4);
  const endStep = Number(contract?.priceEndStep || 1);
  const step = (Number.isFinite(endStep) && endStep > 0 ? endStep : 1) * (10 ** -place);
  return Number.isFinite(step) && step > 0 ? step : 10 ** -place;
}

function roundBitgetPrice(value, contract) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return number;
  const place = clampInt(contract?.pricePlace, 0, 12, 8);
  const step = bitgetPriceStep(contract);
  const rounded = Math.round(number / step) * step;
  return Number(rounded.toFixed(place));
}
function buildOrderPlan(signal, contracts, marketContext = null) {
  const symbol = bitgetSymbolForSignal(signal);
  const displayPrice = Number(signal.entry || signal.currentPrice || signal.lastPrice);
  const multiplier = clampNumber(signal.contractMultiplier, 1, 1_000_000, 1);
  const price = exchangePrice(displayPrice, multiplier);
  if (!symbol.endsWith("USDT")) return { ok: false, reason: "only USDT futures are allowed" };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "missing price" };

  const gate = summarizeMarketGate(marketContext, {});
  const marginCap = gate.riskOff ? Math.min(settings.maxMarginUsd, gate.defensiveMaxMarginUsd || settings.maxMarginUsd) : settings.maxMarginUsd;
  const leverageCap = gate.riskOff ? Math.min(50, gate.defensiveMaxLeverage || 5) : 50;
  const marginUsd = Math.min(Number(signal.plannedUsd) || marginCap, marginCap);
  const leverage = clampInt(signal.leverage, 1, leverageCap, Math.min(10, leverageCap));
  const notionalUsd = roundMoney(marginUsd * leverage);
  const rawSize = notionalUsd / price;
  const contract = contracts.get(symbol);
  if (settings.mode === "live" && !contract) return { ok: false, reason: `Bitget contract not found ${symbol}` };
  const volumePlace = contract ? clampInt(contract.volumePlace, 0, 12, 4) : 4;
  const minTradeNum = Number(contract?.minTradeNum || 0);
  const roundedPrice = roundBitgetPrice(price, contract);
  const roundedSl = roundBitgetPrice(exchangePrice(Number(signal.sl), multiplier), contract);
  const roundedTp1 = roundBitgetPrice(exchangePrice(Number(signal.tp1), multiplier), contract);
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
    price: roundedPrice,
    sl: roundedSl,
    tp1: roundedTp1,
    size: String(size),
    clientOid: `jamd-${String(signal.id).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40)}`
  };
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
  if (Number.isFinite(plan.sl) && plan.sl > 0) body.presetStopLossPrice = formatBitgetPrice(plan.sl);
  if (Number.isFinite(plan.tp1) && plan.tp1 > 0) body.presetStopSurplusPrice = formatBitgetPrice(plan.tp1);
  const result = await bitgetRequest("POST", "/api/v2/mix/order/place-order", body);
  if (result?.code !== "00000") {
    throw new Error(`Bitget rejected ${plan.pair}: ${result?.msg || JSON.stringify(result)}`);
  }
  return result;
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

async function reconcileBitgetPositions(state) {
  const result = await bitgetRequest("GET", `/api/v2/mix/position/all-position?productType=${encodeURIComponent(settings.productType)}&marginCoin=${encodeURIComponent(settings.marginCoin)}`);
  if (result?.code && result.code !== "00000") {
    throw new Error(`Bitget positions rejected: ${result?.msg || result.code}`);
  }
  const positions = (Array.isArray(result?.data) ? result.data : [])
    .filter((item) => Math.abs(Number(item.total || item.available || item.size || 0)) > 0);
  const liveSymbols = new Set(positions.map((item) => String(item.symbol || "")));
  for (const order of state.orders) {
    if (order.status !== "OPEN" || !order.symbol) continue;
    if (!liveSymbols.has(order.symbol)) {
      order.status = "CLOSED_UNKNOWN";
      order.closedAt = new Date().toISOString();
    }
  }
  state.bitgetSynced = true;
  state.remotePositions = positions.slice(0, 20).map((item) => ({
    symbol: item.symbol,
    holdSide: item.holdSide,
    total: item.total,
    unrealizedPL: item.unrealizedPL,
    marginSize: item.marginSize
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
    clientOid: plan.clientOid,
    marginUsd: plan.marginUsd,
    leverage: plan.leverage,
    notionalUsd: plan.notionalUsd,
    size: plan.size,
    entry: plan.price,
    displayEntry: Number(signal.entry || 0),
    contractMultiplier: Number(signal.contractMultiplier || 1),
    tp1: plan.tp1,
    sl: plan.sl,
    exitPlan: buildExitPlan(signal, plan),
    response,
    createdAt: new Date().toISOString()
  };
}

function buildExitPlan(signal, plan) {
  return {
    ready: true,
    entryOnly: settings.allowEntryOnly,
    tp1: Number(plan.tp1) || null,
    sl: Number(plan.sl) || null,
    note: settings.allowEntryOnly
      ? "Entry-only live guard is active; monitor TP/SL before enabling full exits."
      : "TP1/SL are planned and positions are reconciled; full automatic exits remain guarded."
  };
}

function rememberSkip(state, signal, reason) {
  state.seen[signal.id] = { skippedAt: new Date().toISOString(), reason };
}

function pruneState(state) {
  state.orders = Array.isArray(state.orders) ? state.orders : [];
  state.seen = state.seen && typeof state.seen === "object" ? state.seen : {};
  state.daily = normalizeDailyState(state.daily);
  for (const order of state.orders) {
    if (order?.id) state.seen[order.id] = state.seen[order.id] || { orderedAt: order.createdAt || new Date().toISOString() };
  }
}

function createExecutorState() {
  return { version: 3, updatedAt: null, seen: {}, orders: [], daily: normalizeDailyState({}), lastDecisionSummary: createDecisionSummary([], []) };
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
    ok: overrides.ok === true,
    livePaused: overrides.livePaused === true,
    lastRunAt: new Date().toISOString(),
    openCount: state.orders.filter((order) => order.status === "OPEN").length,
    dailyRealizedPnl: daily.realizedPnl,
    liveUnrealizedPnl: Number(state.liveUnrealizedPnl || 0),
    dailyTrades: daily.trades,
    consecutiveLosses: daily.consecutiveLosses,
    lastAction: overrides.lastAction || state.lastAction || "",
    lastError: overrides.lastError || "",
    bitgetSynced: state.bitgetSynced === true,
        decisions: state.lastDecisionSummary || createDecisionSummary([], []),
    marketGate: state.lastMarketGate || summarizeMarketGate(null, {}),
    recentOrders: state.orders.slice(0, 8).map(compactOrder),
    remotePositions: Array.isArray(state.remotePositions) ? state.remotePositions.slice(0, 8) : [],
    lastDryRunSignal: state.lastDryRunSignal || null,
    lastLiveSignal: state.lastLiveSignal || null,
    exitManager: {
      ready: true,
      entryOnly: settings.allowEntryOnly,
      note: "Prepared TP1/SL planning and position reconciliation. Full automatic close manager remains guarded."
    }
  };
}

function createDecisionSummary(signals, events) {
  return {
    totalSignals: Array.isArray(signals) ? signals.length : 0,
    newSignals: 0,
    recentOpenSignals: 0,
    totalEvents: Array.isArray(events) ? events.length : 0,
        executableSignals: 0,
    marketGate: summarizeMarketGate(null, {}),
    rejected: {},
    examples: [],
    updatedAt: new Date().toISOString()
  };
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
    createdAt: order.createdAt || "",
    exitPlanReady: order.exitPlan?.ready === true
  };
}

function normalizeExecutorPolicy(value = {}) {
  return {
    livePaused: value?.livePaused === true,
        minScore: clampInt(value?.minScore, 8, 20, settings.minScore),
    strictRegimeMinScore: clampInt(value?.strictRegimeMinScore, 8, 20, settings.strictRegimeMinScore),
    maxDailyLossUsd: clampNumber(value?.maxDailyLossUsd, 1, 100000, settings.maxDailyLossUsd),
    maxDailyLossPercent: clampNumber(value?.maxDailyLossPercent, 0.1, 50, settings.maxDailyLossPercent),
    maxConsecutiveLosses: clampInt(value?.maxConsecutiveLosses, 1, 20, settings.maxConsecutiveLosses),
    maxTradesPerDay: clampInt(value?.maxTradesPerDay, 1, 100, settings.maxTradesPerDay)
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

function formatBitgetPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return String(number).includes("e")
    ? number.toFixed(12).replace(/0+$/, "").replace(/\.$/, "")
    : String(number);
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
