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
  minScore: clampInt(process.env.JAMDDMAJ_MIN_LIVE_SCORE, 8, 13, 10),
  allowMeme: String(process.env.JAMDDMAJ_ALLOW_MEME_LIVE || "false").toLowerCase() === "true",
  minLiquidityUsd: clampNumber(process.env.JAMDDMAJ_MIN_LIVE_LIQUIDITY_USD, 0, 1_000_000_000, 3_000_000)
};

main().catch((error) => {
  console.error(`${LOG_PREFIX} fatal ${error?.message || error}`);
  process.exitCode = 1;
});

async function main() {
  if (!settings.cronSecret) {
    throw new Error("JAMDDMAJ_CRON_SECRET is required.");
  }

  const state = readJson(STATE_PATH, createExecutorState());
  pruneState(state);

  const scan = await runScanner();
  const signals = Array.isArray(scan?.signals) ? scan.signals : [];
  const events = Array.isArray(scan?.events) ? scan.events : [];

  console.log(`${LOG_PREFIX} scan ok. newSignals=${signals.length} events=${events.length} mode=${settings.mode}`);

  const candidates = signals
    .filter((signal) => isExecutableSignal(signal, state))
    .slice(0, settings.maxNewOrdersPerRun);

  if (settings.mode === "off") {
    console.log(`${LOG_PREFIX} execution off. candidates=${candidates.length}`);
    writeJson(STATE_PATH, state);
    return;
  }

  if (!candidates.length) {
    console.log(`${LOG_PREFIX} no executable candidates after filters.`);
    writeJson(STATE_PATH, state);
    return;
  }

  if (settings.mode === "live") {
    validateLiveSecrets();
  }

  const contracts = settings.mode === "live" ? await getContracts() : new Map();
  for (const signal of candidates) {
    const openCount = state.orders.filter((order) => order.status === "OPEN").length;
    if (openCount >= settings.maxOpen) {
      console.log(`${LOG_PREFIX} max open reached (${openCount}/${settings.maxOpen}).`);
      break;
    }

    const plan = buildOrderPlan(signal, contracts);
    if (!plan.ok) {
      rememberSkip(state, signal, plan.reason);
      console.log(`${LOG_PREFIX} skip ${signal.pair}: ${plan.reason}`);
      continue;
    }

    if (settings.mode === "dry-run") {
      state.orders.unshift(createStateOrder(signal, plan, "DRY_RUN"));
      console.log(`${LOG_PREFIX} dry-run ${signal.pair} ${signal.side} margin=$${plan.marginUsd} notional=$${plan.notionalUsd} size=${plan.size}`);
      continue;
    }

    const placed = await placeMarketOrder(plan);
    state.orders.unshift(createStateOrder(signal, plan, "OPEN", placed));
    console.log(`${LOG_PREFIX} LIVE order sent ${signal.pair} ${signal.side} clientOid=${plan.clientOid}`);
  }

  state.updatedAt = new Date().toISOString();
  state.orders = state.orders.slice(0, 250);
  writeJson(STATE_PATH, state);
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

function isExecutableSignal(signal, state) {
  if (!signal || !signal.id || !signal.pair || !signal.side) return false;
  if (state.seen[signal.id]) return false;
  if (Number(signal.score) < settings.minScore) return false;
  if (!settings.allowMeme && /meme/i.test(String(signal.category || ""))) return false;
  const liquidity = Number(signal.quoteVolume || signal.liquidityUsd || 0);
  if (liquidity && liquidity < settings.minLiquidityUsd) return false;
  if (!["LONG", "SHORT"].includes(String(signal.side).toUpperCase())) return false;
  return true;
}

function buildOrderPlan(signal, contracts) {
  const symbol = String(signal.symbol || signal.pair || "").replace("/", "").replace(" PERP", "").replace("USDTUSDT", "USDT");
  const price = Number(signal.entry || signal.currentPrice || signal.lastPrice);
  if (!symbol.endsWith("USDT")) return { ok: false, reason: "only USDT futures are allowed" };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "missing price" };

  const marginUsd = Math.min(Number(signal.plannedUsd) || settings.maxMarginUsd, settings.maxMarginUsd);
  const leverage = clampInt(signal.leverage, 1, 50, 10);
  const notionalUsd = roundMoney(marginUsd * leverage);
  const rawSize = notionalUsd / price;
  const contract = contracts.get(symbol);
  const volumePlace = contract ? clampInt(contract.volumePlace, 0, 12, 4) : 4;
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
  const result = await bitgetRequest("POST", "/api/v2/mix/order/place-order", body);
  if (result?.code !== "00000") {
    throw new Error(`Bitget rejected ${plan.pair}: ${result?.msg || JSON.stringify(result)}`);
  }
  return result;
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
    body: payload
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
    side: signal.side,
    status,
    clientOid: plan.clientOid,
    marginUsd: plan.marginUsd,
    leverage: plan.leverage,
    notionalUsd: plan.notionalUsd,
    size: plan.size,
    response,
    createdAt: new Date().toISOString()
  };
}

function rememberSkip(state, signal, reason) {
  state.seen[signal.id] = { skippedAt: new Date().toISOString(), reason };
}

function pruneState(state) {
  state.orders = Array.isArray(state.orders) ? state.orders : [];
  state.seen = state.seen && typeof state.seen === "object" ? state.seen : {};
  for (const order of state.orders) {
    if (order?.id) state.seen[order.id] = state.seen[order.id] || { orderedAt: order.createdAt || new Date().toISOString() };
  }
}

function createExecutorState() {
  return { version: 1, updatedAt: null, seen: {}, orders: [] };
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
