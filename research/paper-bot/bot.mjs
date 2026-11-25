// Local paper-signal bot for Bitget USDT futures. No orders, no web, no production imports.
// Usage:
//   node bot.mjs                 # scan + write signals, dry-run
//   node bot.mjs --send          # also send to Telegram if env vars are configured
//   node bot.mjs --top 40        # universe size by 24h quote volume
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "out");
mkdirSync(DATA, { recursive: true });
mkdirSync(OUT, { recursive: true });

const BASE = "https://api.bitget.com";
const COST_PER_SIDE = 0.0005;
const FUNDING_DAILY = 0.0002;
const TARGET_VOL = 0.10;
const MAX_LEVERAGE = 2;
const LOOKBACK = 10;
const LONG_THRESHOLD = Number(process.env.LONG_THRESHOLD || 0.01);
const SHORT_THRESHOLD = Number(process.env.SHORT_THRESHOLD || 0.05);
const MAX_VOL = Number(process.env.MAX_VOL || 0);
const REBALANCE_DAYS = 30;
const MAX_POSITIONS = 8;
const GROSS_CAP = 2;
const MIN_SHORT_FUNDING = Number(process.env.MIN_SHORT_FUNDING || 0);
const TP_ATR = 3;
const SL_ATR = 4;
const LONG_ONLY_LOOKBACK = 7;
const LONG_ONLY_THRESHOLD = 0.05;
const LONG_ONLY_TP_ATR = 2;
const LONG_ONLY_SL_ATR = 5;
const LONG_ONLY_DIP = 0.02;

const TOKENIZED = new Set([
  "AAPL", "AMAT", "AMD", "AMZN", "ARM", "ASML", "AVGO", "BABA", "COIN", "CRCL", "CRWD", "CRWV", "CSCO", "DELL",
  "GOOGL", "HOOD", "IBM", "INTC", "IREN", "KLAC", "LLY", "META", "MRNA", "MRVL", "MSFT", "MSTR", "MU", "NBIS",
  "NET", "NFLX", "NVDA", "ORCL", "PANW", "PLTR", "QCOM", "QQQ", "SKHY", "SKHYNIX", "SNDK", "SPY", "SPCX", "TLT",
  "TSLA", "TSM", "TXN", "XAU", "XAG", "PAXG", "GOLD", "SILVER", "COPPER", "WTIOIL"
]);
const STABLES = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDS", "PYUSD", "BUSD"]);
const CRYPTO_BASES = new Set([
  "BTC","ETH","SOL","XRP","BNB","DOGE","ADA","AVAX","LINK","DOT","TRX","LTC","BCH","SHIB","PEPE","SUI","APT",
  "ARB","OP","TIA","SEI","INJ","WIF","BONK","FLOKI","NEAR","ATOM","FIL","ETC","XLM","HBAR","ICP","VET","ALGO",
  "EGLD","KAVA","STX","KAS","IOTA","ROSE","TON","UNI","AAVE","MKR","CRV","LDO","COMP","CAKE","ONDO","PENDLE",
  "ENA","JTO","SNX","DYDX","1INCH","RPL","FXS","GMX","RAY","JOE","JST","SUSHI","BAL","YFI","ZRX","AEVO","JUP",
  "RUNE","FET","RENDER","TAO","GRT","W","ARKM","WLD","JASMY","AIOZ","AKT","AR","HYPE","IO","GRASS","VIRTUAL",
  "COOKIE","PHA","OCEAN","NMR","PYTH","SAND","MANA","GALA","AXS","APE","CHZ","ENJ","ILV","PIXEL","PORTAL","GMT",
  "YGG","BEAM","IMX","POL","STRK","ZK","ZRO","METIS","BLAST","MNT","CRO","LEO","KCS","GT","BGB","MX","WOO",
  "ZEC","DASH","XMR","QNT","OM","ENA","USUAL","MORPHO","EIGEN","LINEA","SOPH","ZKJ","PROVE","TREE","RESOLV"
]);

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const TOP = Math.max(10, Math.min(80, Number(arg("--top", 40)) || 40));
const SEND = process.argv.includes("--send");
const ALLOW_SHORTS = process.argv.includes("--allow-shorts") || process.env.ALLOW_SHORTS === "1";
const LONG_ONLY = !ALLOW_SHORTS;

async function get(path) {
  const response = await fetch(BASE + path, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  const body = await response.json();
  if (body.code !== "00000") throw new Error(`${path} ${body.msg || body.code}`);
  return body.data;
}

async function loadUniverse() {
  const [contracts, tickers] = await Promise.all([
    get("/api/v2/mix/market/contracts?productType=USDT-FUTURES"),
    get("/api/v2/mix/market/tickers?productType=USDT-FUTURES")
  ]);
  const contractMap = new Map(contracts.map((c) => [c.symbol, c]));
  const rows = [];
  for (const ticker of tickers) {
    const contract = contractMap.get(ticker.symbol);
    if (!contract) continue;
    const base = String(contract.baseCoin || "").toUpperCase();
    if (!base || STABLES.has(base) || TOKENIZED.has(base)) continue;
    const norm = base.replace(/^(1000|1M)/, "");
    if (!CRYPTO_BASES.has(norm)) continue;
    if (/^(USDT|USDC|DAI|FDUSD|TUSD|USDE|USDS|PYUSD|BUSD)/.test(base)) continue;
    const volume = Number(ticker.quoteVolume);
    if (!Number.isFinite(volume) || volume < 3_000_000) continue;
    rows.push({ symbol: ticker.symbol, base, volume, fundingRate: Number(ticker.fundingRate), contract });
  }
  rows.sort((a, b) => b.volume - a.volume);
  return rows.slice(0, TOP);
}

function candles(symbol) {
  const cache = join(DATA, `${symbol}.json`);
  if (existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache, "utf8"));
    if (Date.now() - Number(cached.savedAt || 0) < 6 * 3600_000 && Array.isArray(cached.rows) && cached.rows.length >= 40) return cached.rows;
  }
  return null;
}

async function fetchCandles(symbol) {
  const data = await get(`/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1D&limit=90`);
  const rows = (Array.isArray(data) ? data : []).map((r) => ({
    time: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    quoteVolume: Number(r[6])
  })).filter((r) => r.time && r.close > 0).sort((a, b) => a.time - b.time);
  writeFileSync(join(DATA, `${symbol}.json`), JSON.stringify({ savedAt: Date.now(), rows }), "utf8");
  return rows;
}

function atr(rows, period = 14) {
  const trs = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    trs.push(Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - prev), Math.abs(rows[i].low - prev)));
  }
  const slice = trs.slice(-period);
  return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
}
function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}
function analyze(rows) {
  if (rows.length < 30) return null;
  const lookback = LONG_ONLY ? LONG_ONLY_LOOKBACK : LOOKBACK;
  const longThreshold = LONG_ONLY ? LONG_ONLY_THRESHOLD : LONG_THRESHOLD;
  const shortThreshold = LONG_ONLY ? Infinity : SHORT_THRESHOLD;
  const tpMult = LONG_ONLY ? LONG_ONLY_TP_ATR : TP_ATR;
  const slMult = LONG_ONLY ? LONG_ONLY_SL_ATR : SL_ATR;
  const closes = rows.map((r) => r.close);
  const returns = closes.slice(-21).map((v, i, a) => (i ? v / a[i - 1] - 1 : 0)).slice(1);
  const vol = stdev(returns) * Math.sqrt(365);
  const momentum = closes[closes.length - 1] / closes[closes.length - 1 - lookback] - 1;
  const dayReturn = closes[closes.length - 1] / closes[closes.length - 2] - 1;
  const longReady = momentum > longThreshold && (!LONG_ONLY || dayReturn < -LONG_ONLY_DIP);
  const signal = longReady ? 1 : momentum < -shortThreshold ? -1 : 0;
  const leverage = vol > 0 ? Math.min(MAX_LEVERAGE, TARGET_VOL / vol) : 0;
  const last = rows[rows.length - 1];
  const atrValue = atr(rows);
  const stopDistance = atrValue * slMult;
  const takeDistance = atrValue * tpMult;
  return {
    close: last.close,
    atr: +stopDistance.toFixed(8),
    momentumPct: +(momentum * 100).toFixed(2),
    volPct: +(vol * 100).toFixed(2),
    signal,
    effectiveLeverage: +(signal * leverage).toFixed(2),
    suggestedStop: signal === 1 ? +(last.close - stopDistance).toFixed(8) : signal === -1 ? +(last.close + stopDistance).toFixed(8) : null,
    takeProfit: signal === 1 ? +(last.close + takeDistance).toFixed(8) : signal === -1 ? +(last.close - takeDistance).toFixed(8) : null,
    riskPct: last.close > 0 ? +((stopDistance / last.close) * 100).toFixed(2) : null,
    lastTime: last.time
  };
}

async function scan() {
  const universe = await loadUniverse();
  const results = [];
  for (const item of universe) {
    try {
      let rows = candles(item.symbol);
      if (!rows) rows = await fetchCandles(item.symbol);
      const analysis = analyze(rows);
      if (!analysis) continue;
      results.push({ ...item, ...analysis, rows });
    } catch (error) {
      results.push({ ...item, error: String(error?.message || error).slice(0, 140) });
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return results;
}

function portfolioVol(active) {
  if (!active.length) return 0;
  const count = Math.min(30, ...active.map((r) => r.rows.length - 1));
  if (count < 5) return 0;
  const values = [];
  for (let j = count; j >= 1; j -= 1) {
    let value = 0;
    for (const r of active) {
      const rows = r.rows;
      const prev = rows[rows.length - 1 - j].close;
      const now = rows[rows.length - j].close;
      value += r.effectiveLeverage * (now / prev - 1);
    }
    values.push(value);
  }
  return stdev(values) * Math.sqrt(365);
}

function fmt(n, digits = 6) {
  if (!Number.isFinite(n)) return "n/a";
  return String(Number(n.toFixed(digits)));
}
function signalLine(r) {
  const side = r.signal === 1 ? "LONG" : "SHORT";
  return [
    `${side} ${r.base}USDT`,
    `Entry ${fmt(r.close)}`,
    `10d ${r.momentumPct > 0 ? "+" : ""}${r.momentumPct}% | Vol ${r.volPct}%`,
    `Size ${r.effectiveLeverage}x | TP ${fmt(r.takeProfit)} | SL ${fmt(r.suggestedStop)} (${r.riskPct}%)`,
    `Paper only · rebalance ${REBALANCE_DAYS}d`
  ].join("\n");
}

function writeOutputs(payload, active, errors) {
  const stamp = new Date().toISOString();
  const text = [
    `JamdDmaj Paper Signals · ${stamp}`,
    `Universe: top ${TOP} Bitget crypto USDT futures by 24h volume`,
    `Selected: ${active.length}/${MAX_POSITIONS} · gross ${active.reduce((s, r) => s + Math.abs(r.effectiveLeverage), 0).toFixed(2)}x (cap ${GROSS_CAP}x)`,
    `Portfolio vol before scaling: ${portfolioVolPct}% · scale ${volScale.toFixed(2)} · target ${TARGET_VOL * 100}%`,
    `Strategy: TSMOM ${LONG_ONLY ? LONG_ONLY_LOOKBACK : LOOKBACK}d · long >${(LONG_ONLY ? LONG_ONLY_THRESHOLD : LONG_THRESHOLD) * 100}%${LONG_ONLY ? " + dip >2%" : ""}${LONG_ONLY ? " · LONG-ONLY" : ` / short <-${SHORT_THRESHOLD * 100}%`} · vol target ${TARGET_VOL * 100}% · max ${MAX_LEVERAGE}x`,
    "",
    ...(active.length ? active.map(signalLine) : ["No active signals."]),
    ...(active.length ? [] : ["Watchlist (not signals):", ...watchlist.map((r) => `${r.base} 7d ${r.momentumPct > 0 ? "+" : ""}${r.momentumPct}% | Vol ${r.volPct}%`)]),
    "",
    `Active: ${active.length} · scanned: ${payload.scanned} · errors: ${errors}`,
    "No orders. No web. Paper research only."
  ].join("\n\n");
  writeFileSync(join(OUT, "latest.json"), JSON.stringify({ ...payload, active, text }, null, 2), "utf8");
  writeFileSync(join(OUT, "latest.txt"), text, "utf8");
  appendFileSync(join(OUT, "signals.jsonl"), JSON.stringify({ stamp, active, scanned: payload.scanned, errors }) + "\n", "utf8");
  return text;
}

async function telegram(text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chat = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  const thread = Number(process.env.TELEGRAM_THREAD_ID || 0);
  if (!token || !chat) return { sent: false, reason: "TELEGRAM_NOT_CONFIGURED" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true, ...(thread ? { message_thread_id: thread } : {}) }),
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => ({}));
  return { sent: response.ok && body.ok === true, messageId: body?.result?.message_id || null, error: body?.description || null };
}

const started = Date.now();
const results = await scan();
const candidates = results.filter((r) => r.signal !== 0 && (r.signal === 1 || !Number.isFinite(r.fundingRate) || r.fundingRate >= MIN_SHORT_FUNDING)).sort((a, b) => (Math.abs(b.momentumPct) / Math.max(1, b.volPct)) - (Math.abs(a.momentumPct) / Math.max(1, a.volPct)));
const active = candidates.slice(0, MAX_POSITIONS).map((r) => ({ ...r }));
const gross = active.reduce((sum, r) => sum + Math.abs(r.effectiveLeverage), 0);
const grossScale = gross > GROSS_CAP ? GROSS_CAP / gross : 1;
for (const r of active) r.effectiveLeverage = +(r.effectiveLeverage * grossScale).toFixed(2);
const estimatedVol = portfolioVol(active);
const volScale = estimatedVol > TARGET_VOL ? TARGET_VOL / estimatedVol : 1;
for (const r of active) r.effectiveLeverage = +(r.effectiveLeverage * volScale).toFixed(2);
const portfolioVolPct = +(estimatedVol * 100).toFixed(2);
const errors = results.filter((r) => r.error).length;
const watchlist = results.filter((r) => r.signal === 0).sort((a, b) => b.momentumPct - a.momentumPct).slice(0, 3).map((r) => ({ symbol: r.symbol, base: r.base, momentumPct: r.momentumPct, volPct: r.volPct }));
const payload = { stamp: new Date().toISOString(), watchlist, strategy: { lookback: LOOKBACK, longThreshold: LONG_THRESHOLD, shortThreshold: SHORT_THRESHOLD, targetVol: TARGET_VOL, maxLeverage: MAX_LEVERAGE, rebalanceDays: REBALANCE_DAYS }, scanned: results.length, top: TOP, elapsedMs: Date.now() - started, universe: results.map(({ rows, ...r }) => r) };
const text = writeOutputs(payload, active, errors);
let telegramResult = { sent: false, reason: "DRY_RUN" };
if (SEND) telegramResult = await telegram(text).catch((error) => ({ sent: false, error: String(error?.message || error) }));
writeFileSync(join(OUT, "telegram-result.json"), JSON.stringify(telegramResult, null, 2), "utf8");

console.log(text);
if (SEND) console.log("\nTelegram:", JSON.stringify(telegramResult));
