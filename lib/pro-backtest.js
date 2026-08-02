import { redisRequest } from "./server.js";
import { analyzeCandlesticks, candlestickDecision } from "../candlesticks.js";

const BACKTEST_KEY = "jamd:pro:backtest:last";
const CACHE_MS = 6 * 3600000;
const STORAGE_TTL_SECONDS = 48 * 3600;
const FETCH_TIMEOUT_MS = 9000;
const MIN_VOLUME = 3_000_000;

export async function runProBacktest({ force = false } = {}) {
  if (!force) {
    const cached = await readCachedBacktest();
    if (cached && Date.now() - Date.parse(cached.completedAt) < CACHE_MS) return cached;
  }
  const startedAt = new Date();
  const tickersResponse = await fetchJson("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES");
  const tickers = Array.isArray(tickersResponse?.data) ? tickersResponse.data : [];
  const assets = tickers
    .map((ticker) => ({
      pair: String(ticker.symbol || ""),
      quoteVolume: Number(ticker.usdtVolume || ticker.quoteVolume || ticker.turnover24h),
      ...normalizeContract(String(ticker.symbol || "").replace(/USDT$/i, ""))
    }))
    .filter((asset) => asset.pair && asset.quoteVolume >= MIN_VOLUME)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, 12);
  const rows = await mapWithConcurrency(assets, 4, async (asset) => {
    try {
      const response = await fetchJson(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${encodeURIComponent(asset.pair)}&productType=USDT-FUTURES&granularity=1H&limit=1000`);
      const candles = Array.isArray(response?.data) ? response.data.sort((a, b) => Number(a[0]) - Number(b[0])) : [];
      return candles.length >= 260 ? backtestAsset(asset, candles) : null;
    } catch {
      return null;
    }
  });
  const perSymbol = rows.filter(Boolean);
  const result = summarizeBacktest(perSymbol, startedAt);
  await redisRequest("pipeline", [
    ["SET", BACKTEST_KEY, JSON.stringify(result)],
    ["EXPIRE", BACKTEST_KEY, STORAGE_TTL_SECONDS]
  ]).catch(() => {});
  return result;
}

export async function getCachedProBacktest() {
  return readCachedBacktest();
}

async function readCachedBacktest() {
  try {
    const response = await redisRequest("pipeline", [["GET", BACKTEST_KEY]]);
    return parseJson(response?.[0]?.result);
  } catch {
    return null;
  }
}

function backtestAsset(asset, rows) {
  const multiplier = asset.multiplier || 1;
  const candles = rows.map((row) => ({
    time: Number(row[0]),
    open: Number(row[1]) / multiplier,
    high: Number(row[2]) / multiplier,
    low: Number(row[3]) / multiplier,
    close: Number(row[4]) / multiplier,
    volume: Number(row[5])
  })).filter((row) => Object.values(row).every(Number.isFinite));
  const trades = [];
  for (let index = 220; index < candles.length - 13; index += 4) {
    const history = candles.slice(0, index + 1);
    const setup = historicalSetup(history);
    if (!setup) continue;
    const future = candles.slice(index + 1, index + 13);
    const outcome = evaluateSetup(setup, future);
    trades.push({ ...outcome, side: setup.side, entry: setup.entry, time: candles[index].time, candleDecision: setup.candleDecision, candlePatterns: setup.candlePatterns });
    index += 8;
  }
  const decided = trades.filter((trade) => ["WIN", "INVALIDATED"].includes(trade.outcome));
  const wins = decided.filter((trade) => trade.outcome === "WIN").length;
  const losses = decided.filter((trade) => trade.outcome === "INVALIDATED").length;
  const pnl = decided.map((trade) => trade.estimatedRoe);
  const candleFiltered = decided.filter((trade) => trade.candleDecision !== "strong-opposition");
  const candleWins = candleFiltered.filter((trade) => trade.outcome === "WIN").length;
  const candlePnl = candleFiltered.map((trade) => trade.estimatedRoe);
  return {
    symbol: asset.symbol,
    pair: asset.pair,
    samples: trades.length,
    decided: decided.length,
    wins,
    losses,
    ambiguous: trades.filter((trade) => trade.outcome === "AMBIGUOUS").length,
    unresolved: trades.filter((trade) => trade.outcome === "UNRESOLVED").length,
    winRate: decided.length ? round((wins / decided.length) * 100) : 0,
    expectancyRoe: pnl.length ? round(pnl.reduce((sum, value) => sum + value, 0) / pnl.length) : 0,
    maxDrawdownRoe: calculateDrawdown(pnl),
    candlestickStudy: {
      decided: candleFiltered.length,
      rejected: decided.length - candleFiltered.length,
      wins: candleWins,
      losses: candleFiltered.length - candleWins,
      winRate: candleFiltered.length ? round((candleWins / candleFiltered.length) * 100) : 0,
      expectancyRoe: candlePnl.length ? round(candlePnl.reduce((sum, value) => sum + value, 0) / candlePnl.length) : 0,
      maxDrawdownRoe: calculateDrawdown(candlePnl)
    }
  };
}

function historicalSetup(candles) {
  const closes = candles.map((item) => item.close);
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const volumes = candles.map((item) => item.volume);
  const ema12Values = emaSeries(closes, 12);
  const ema26Values = emaSeries(closes, 26);
  const macdValues = closes.map((_, index) => ema12Values[index] - ema26Values[index]).filter(Number.isFinite);
  const macdSignal = emaSeries(macdValues, 9).filter(Number.isFinite).at(-1);
  const macd = macdValues.at(-1);
  const price = closes.at(-1);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsiValue = rsi(closes, 14);
  const adxValue = adx(highs, lows, closes, 14);
  const recentVolume = sma(volumes, 3);
  const averageVolume = sma(volumes.slice(0, -3), 20);
  const volumeRatio = averageVolume ? recentVolume / averageVolume : 0;
  const fourHour = closes.filter((_, index) => (index + 1) % 4 === 0);
  const higher20 = sma(fourHour, 20);
  const higher50 = sma(fourHour, 50);
  const higherPrice = fourHour.at(-1);
  const longChecks = [price > sma20 && sma20 > sma50, higherPrice > higher20 && higher20 > higher50, ema12Values.at(-1) > ema26Values.at(-1), macd > macdSignal, rsiValue >= 45 && rsiValue <= 65, volumeRatio >= 0.9, adxValue >= 18];
  const shortChecks = [price < sma20 && sma20 < sma50, higherPrice < higher20 && higher20 < higher50, ema12Values.at(-1) < ema26Values.at(-1), macd < macdSignal, rsiValue <= 55 && rsiValue >= 35, volumeRatio >= 0.9, adxValue >= 18];
  const longScore = longChecks.filter(Boolean).length;
  const shortScore = shortChecks.filter(Boolean).length;
  if (Math.max(longScore, shortScore) < 7) return null;
  const side = longScore >= shortScore ? "LONG" : "SHORT";
  const candlestick = analyzeCandlesticks(candles);
  const candleDecision = candlestickDecision(candlestick, side);
  const direction = side === "LONG" ? 1 : -1;
  const atrPercent = atr(highs, lows, closes, 14) / price;
  if (!Number.isFinite(atrPercent)) return null;
  const distance = clamp(atrPercent * 1.3, 0.006, 0.038);
  return {
    side,
    entry: price,
    target: price * (1 + direction * distance * 1.2),
    invalidation: price * (1 - direction * distance),
    targetMove: distance * 1.2,
    invalidationMove: distance,
    candleDecision,
    candlePatterns: candlestick.patterns
  };
}

function evaluateSetup(setup, future) {
  const long = setup.side === "LONG";
  let maxFavorable = 0;
  let maxAdverse = 0;
  for (const candle of future) {
    const targetTouched = long ? candle.high >= setup.target : candle.low <= setup.target;
    const invalidated = long ? candle.low <= setup.invalidation : candle.high >= setup.invalidation;
    maxFavorable = Math.max(maxFavorable, long ? (candle.high - setup.entry) / setup.entry : (setup.entry - candle.low) / setup.entry);
    maxAdverse = Math.max(maxAdverse, long ? (setup.entry - candle.low) / setup.entry : (candle.high - setup.entry) / setup.entry);
    if (targetTouched && invalidated) return { outcome: "AMBIGUOUS", estimatedRoe: 0, maxFavorable: round(maxFavorable * 100), maxAdverse: round(maxAdverse * 100) };
    if (targetTouched) return { outcome: "WIN", estimatedRoe: round(setup.targetMove * 1000 - 1.2), maxFavorable: round(maxFavorable * 100), maxAdverse: round(maxAdverse * 100) };
    if (invalidated) return { outcome: "INVALIDATED", estimatedRoe: round(-setup.invalidationMove * 1000 - 1.2), maxFavorable: round(maxFavorable * 100), maxAdverse: round(maxAdverse * 100) };
  }
  return { outcome: "UNRESOLVED", estimatedRoe: 0, maxFavorable: round(maxFavorable * 100), maxAdverse: round(maxAdverse * 100) };
}

function summarizeBacktest(perSymbol, startedAt) {
  const decided = perSymbol.reduce((sum, item) => sum + item.decided, 0);
  const wins = perSymbol.reduce((sum, item) => sum + item.wins, 0);
  const weightedExpectancy = decided
    ? perSymbol.reduce((sum, item) => sum + item.expectancyRoe * item.decided, 0) / decided
    : 0;
  const candleDecided = perSymbol.reduce((sum, item) => sum + item.candlestickStudy.decided, 0);
  const candleWins = perSymbol.reduce((sum, item) => sum + item.candlestickStudy.wins, 0);
  const candleWeightedExpectancy = candleDecided
    ? perSymbol.reduce((sum, item) => sum + item.candlestickStudy.expectancyRoe * item.candlestickStudy.decided, 0) / candleDecided
    : 0;
  return {
    ok: true,
    methodology: "Walk-forward 1h entries, 4h confirmation, next 12h TP1 versus suggested invalidation; ambiguous candles excluded; estimated 10x ROE includes 0.12% round-trip notional fees.",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    assetsTested: perSymbol.length,
    samples: perSymbol.reduce((sum, item) => sum + item.samples, 0),
    decided,
    wins,
    losses: perSymbol.reduce((sum, item) => sum + item.losses, 0),
    winRate: decided ? round((wins / decided) * 100) : 0,
    expectancyRoe: round(weightedExpectancy),
    candlestickStudy: {
      mode: "Strong opposing candlestick patterns are rejected; neutral or aligned contexts keep the baseline setup.",
      decided: candleDecided,
      rejected: decided - candleDecided,
      wins: candleWins,
      losses: candleDecided - candleWins,
      winRate: candleDecided ? round((candleWins / candleDecided) * 100) : 0,
      expectancyRoe: round(candleWeightedExpectancy),
      winRateDelta: round((candleDecided ? (candleWins / candleDecided) * 100 : 0) - (decided ? (wins / decided) * 100 : 0)),
      expectancyDeltaRoe: round(candleWeightedExpectancy - weightedExpectancy)
    },
    perSymbol
  };
}

function normalizeContract(base) {
  const match = String(base || "").match(/^(\d{2,})([A-Z][A-Z0-9]*)$/);
  return match ? { symbol: match[2], multiplier: Number(match[1]) || 1 } : { symbol: String(base || ""), multiplier: 1 };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "JamdDmaj-Pro-Backtest/1.32" } });
    if (!response.ok) throw new Error(`Backtest source ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

function sma(values, period) {
  const slice = values.slice(-period);
  return slice.length === period ? slice.reduce((sum, value) => sum + value, 0) / period : NaN;
}

function emaSeries(values, period) {
  const result = Array(values.length).fill(NaN);
  if (values.length < period) return result;
  const factor = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  result[period - 1] = value;
  for (let index = period; index < values.length; index += 1) {
    value = (values[index] - value) * factor + value;
    result[index] = value;
  }
  return result;
}

function rsi(values, period) {
  if (values.length <= period) return NaN;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gain = changes.slice(0, period).reduce((sum, change) => sum + Math.max(change, 0), 0) / period;
  let loss = changes.slice(0, period).reduce((sum, change) => sum + Math.max(-change, 0), 0) / period;
  for (const change of changes.slice(period)) {
    gain = ((gain * (period - 1)) + Math.max(change, 0)) / period;
    loss = ((loss * (period - 1)) + Math.max(-change, 0)) / period;
  }
  return loss ? 100 - (100 / (1 + gain / loss)) : 100;
}

function atr(highs, lows, closes, period) {
  return sma(highs.slice(1).map((high, index) => Math.max(high - lows[index + 1], Math.abs(high - closes[index]), Math.abs(lows[index + 1] - closes[index]))), period);
}

function adx(highs, lows, closes, period) {
  if (highs.length < period * 2 + 1) return NaN;
  const tr = [], plus = [], minus = [];
  for (let index = 1; index < highs.length; index += 1) {
    tr.push(Math.max(highs[index] - lows[index], Math.abs(highs[index] - closes[index - 1]), Math.abs(lows[index] - closes[index - 1])));
    const up = highs[index] - highs[index - 1];
    const down = lows[index - 1] - lows[index];
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  let smoothTr = tr.slice(0, period).reduce((sum, value) => sum + value, 0);
  let smoothPlus = plus.slice(0, period).reduce((sum, value) => sum + value, 0);
  let smoothMinus = minus.slice(0, period).reduce((sum, value) => sum + value, 0);
  const dx = [];
  for (let index = period; index < tr.length; index += 1) {
    smoothTr = smoothTr - smoothTr / period + tr[index];
    smoothPlus = smoothPlus - smoothPlus / period + plus[index];
    smoothMinus = smoothMinus - smoothMinus / period + minus[index];
    const plusDi = smoothTr ? 100 * smoothPlus / smoothTr : 0;
    const minusDi = smoothTr ? 100 * smoothMinus / smoothTr : 0;
    dx.push(plusDi + minusDi ? 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi) : 0);
  }
  return sma(dx, period);
}

function calculateDrawdown(values) {
  let equity = 0, peak = 0, drawdown = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return round(drawdown);
}

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function round(value) { return Number.isFinite(value) ? Number(value.toFixed(2)) : 0; }
function parseJson(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
