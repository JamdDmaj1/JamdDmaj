// Local research only. No production imports, no web deployment.
// Compares simple, auditable crypto futures strategies on daily data.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DATA = join(ROOT, "data");
mkdirSync(DATA, { recursive: true });

const SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"];
const START = Date.UTC(2019, 0, 1) / 1000;
const END = Date.UTC(2026, 10, 17) / 1000;
const SPLIT = Date.UTC(2023, 0, 1) / 1000;
const COST = Number(process.env.COST || 0.0005);
const FUNDING_DAILY = Number(process.env.FUNDING_DAILY || 0.0002);
const TARGET_VOL = 0.22;
const MAX_LEVERAGE = 3;

async function loadPrices(symbol) {
  const cache = join(DATA, symbol + ".json");
  if (existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache, "utf8"));
    if (cached[0]?.high != null) return cached;
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${START}&period2=${END}&interval=1d`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${symbol} ${response.status}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const rows = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = Number(quote.close?.[i]);
    const high = Number(quote.high?.[i]);
    const low = Number(quote.low?.[i]);
    if (![close, high, low].every((v) => Number.isFinite(v) && v > 0)) continue;
    rows.push({ time: Number(timestamps[i]) * 1000, high, low, close });
  }
  writeFileSync(cache, JSON.stringify(rows), "utf8");
  return rows;
}

function sma(values, index, period) {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i += 1) sum += values[i];
  return sum / period;
}
function stdev(values, index, period) {
  if (index + 1 < period) return null;
  const slice = values.slice(index - period + 1, index + 1);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance);
}
function maxDrawdown(equity) {
  let peak = equity[0] || 1;
  let worst = 0;
  for (const value of equity) {
    if (value > peak) peak = value;
    worst = Math.min(worst, value / peak - 1);
  }
  return worst;
}
function metrics(returns, equity) {
  const n = returns.length;
  if (!n) return null;
  const total = equity[n] / equity[0] - 1;
  const years = n / 365;
  const cagr = (equity[n] / equity[0]) ** (1 / years) - 1;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const vol = Math.sqrt(variance) * Math.sqrt(365);
  const sharpe = vol > 0 ? (mean * 365) / vol : 0;
  const dd = maxDrawdown(equity);
  return {
    days: n,
    totalReturn: +(total * 100).toFixed(2),
    cagr: +(cagr * 100).toFixed(2),
    vol: +(vol * 100).toFixed(2),
    sharpe: +sharpe.toFixed(2),
    maxDrawdown: +(dd * 100).toFixed(2),
    calmar: dd < 0 ? +(cagr / Math.abs(dd)).toFixed(2) : null,
    winDays: +((returns.filter((r) => r > 0).length / n) * 100).toFixed(1)
  };
}

function buildSignal(kind, rows, params = {}) {
  const closes = rows.map((row) => row.close);
  const highs = rows.map((row) => row.high);
  const lows = rows.map((row) => row.low);
  const signals = new Array(rows.length).fill(0);
  for (let i = 0; i < rows.length; i += 1) {
    if (kind === "tsmom") {
      const look = params.lookback || 30;
      if (i < look) continue;
      signals[i] = closes[i] > closes[i - look] ? 1 : -1;
    } else if (kind === "ma") {
      const fast = sma(closes, i, params.fast || 50);
      const slow = sma(closes, i, params.slow || 200);
      if (fast == null || slow == null) continue;
      signals[i] = fast > slow ? 1 : -1;
    } else if (kind === "combo") {
      const look = params.lookback || 30;
      if (i < look) continue;
      const tsmom = closes[i] > closes[i - look] ? 1 : -1;
      const slow = sma(closes, i, params.slow || 200);
      signals[i] = slow == null ? 0 : (tsmom === (closes[i] > slow ? 1 : -1) ? tsmom : 0);
    } else if (kind === "donchian") {
      const entry = params.entry || 55;
      const exit = params.exit || 20;
      if (i < Math.max(entry, exit)) continue;
      const previous = signals[i - 1] || 0;
      if (previous === 0) {
        const priorHigh = Math.max(...highs.slice(i - entry, i));
        const priorLow = Math.min(...lows.slice(i - entry, i));
        signals[i] = highs[i] > priorHigh ? 1 : lows[i] < priorLow ? -1 : 0;
      } else if (previous === 1) {
        const exitLow = Math.min(...lows.slice(i - exit, i));
        signals[i] = lows[i] < exitLow ? 0 : 1;
      } else {
        const exitHigh = Math.max(...highs.slice(i - exit, i));
        signals[i] = highs[i] > exitHigh ? 0 : -1;
      }
    } else if (kind === "buyhold") {
      signals[i] = 1;
    }
  }
  return signals;
}

function backtest(rows, kind, params = {}, { rebalance = 7 } = {}) {
  const closes = rows.map((row) => row.close);
  const returns = closes.map((value, i) => (i === 0 ? 0 : value / closes[i - 1] - 1));
  const signals = buildSignal(kind, rows, params);
  const equity = [1];
  const series = [];
  let position = 0;
  let turnover = 0;
  for (let i = 1; i < closes.length; i += 1) {
    let desired = position;
    if (i % rebalance === 0 || i === 1) {
      const sigma = stdev(returns, i - 1, 20);
      const leverage = sigma && sigma > 0 ? Math.min(MAX_LEVERAGE, TARGET_VOL / (sigma * Math.sqrt(365))) : 0;
      desired = (signals[i - 1] || 0) * leverage;
    }
    const trade = Math.abs(desired - position);
    turnover += trade;
    const cost = trade * COST;
    const funding = Math.abs(desired) * FUNDING_DAILY;
    const net = desired * returns[i] - cost - funding;
    position = desired;
    series.push({ time: rows[i].time, value: net });
    equity.push(equity[equity.length - 1] * (1 + net));
  }
  return { equity, series, turnover };
}

function windowMetrics(series, start, end) {
  const values = series.filter((row) => row.time >= start && row.time < end).map((row) => row.value);
  const equity = [1];
  for (const value of values) equity.push(equity[equity.length - 1] * (1 + value));
  return metrics(values, equity);
}

const strategies = [
  ["Buy & hold", "buyhold", {}],
  ["TSMOM 30d", "tsmom", { lookback: 30 }],
  ["TSMOM 60d", "tsmom", { lookback: 60 }],
  ["MA 50/200", "ma", { fast: 50, slow: 200 }],
  ["Donchian 55/20", "donchian", { entry: 55, exit: 20 }],
  ["TSMOM + MA200", "combo", { lookback: 30, slow: 200 }]
];

const all = {};
for (const symbol of SYMBOLS) {
  const rows = await loadPrices(symbol);
  all[symbol] = {};
  for (const [label, kind, params] of strategies) {
    const result = backtest(rows, kind, params);
    all[symbol][label] = {
      full: windowMetrics(result.series, START * 1000, END * 1000),
      inSample: windowMetrics(result.series, START * 1000, SPLIT * 1000),
      outOfSample: windowMetrics(result.series, SPLIT * 1000, END * 1000),
      turnoverPerYear: +(result.turnover / (rows.length / 365)).toFixed(1),
      series: result.series
    };
  }
  console.log(symbol, rows.length);
}

const report = { generatedAt: new Date().toISOString(), assumptions: { costPerSide: COST, fundingDaily: FUNDING_DAILY, targetVol: TARGET_VOL, maxLeverage: MAX_LEVERAGE, rebalanceDays: 7 }, all };
writeFileSync(join(ROOT, process.env.OUT || "results.json"), JSON.stringify(report, null, 2), "utf8");
console.log("wrote", process.env.OUT || "results.json");
