// Local research only: evaluate the paper bot strategy on the same Bitget universe.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "out");
const COST = 0.0005;
const FUNDING = 0.0002;
const TARGET_VOL = 0.10;
const MAX_LEVERAGE = 2;
const LOOKBACK = 10;
const LONG_THRESHOLD = Number(process.env.LONG_THRESHOLD || 0.01);
const SHORT_THRESHOLD = Number(process.env.SHORT_THRESHOLD || 0.05);
const MAX_VOL = Number(process.env.MAX_VOL || 0);
const REBALANCE = 30;

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}
function metrics(returns) {
  const n = returns.length;
  if (!n) return null;
  let eq = 1, peak = 1, dd = 0;
  for (const r of returns) { eq *= 1 + r; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const vol = Math.sqrt(variance) * Math.sqrt(365);
  const cagr = eq ** (365 / n) - 1;
  return { days: n, returnPct: +((eq - 1) * 100).toFixed(2), cagr: +(cagr * 100).toFixed(2), volPct: +(vol * 100).toFixed(2), sharpe: +(vol ? (mean * 365) / vol : 0).toFixed(2), maxDD: +(dd * 100).toFixed(2) };
}

const latest = JSON.parse(readFileSync(join(OUT, "latest.json"), "utf8"));
const universe = latest.universe.filter((row) => !row.error && row.symbol).slice(0, 30);
const series = [];
for (const item of universe) {
  const file = join(DATA, item.symbol + ".json");
  if (!existsSync(file)) continue;
  const rows = JSON.parse(readFileSync(file, "utf8")).rows || [];
  if (rows.length < 45) continue;
  series.push({ symbol: item.symbol, base: item.base, rows });
}
const commonTimes = [...new Set(series.flatMap((s) => s.rows.map((r) => r.time)))].sort((a, b) => a - b);
const times = commonTimes.slice(-Math.min(90, commonTimes.length));
const maps = series.map((s) => ({ ...s, map: new Map(s.rows.map((r) => [r.time, r])) }));

function positionAt(item, time) {
  const rows = item.rows.filter((r) => r.time <= time);
  if (rows.length < 31) return 0;
  const closes = rows.map((r) => r.close);
  const rets = closes.slice(-21).map((v, i, a) => (i ? v / a[i - 1] - 1 : 0)).slice(1);
  const vol = stdev(rets) * Math.sqrt(365);
  const mom = closes[closes.length - 1] / closes[closes.length - 1 - LOOKBACK] - 1;
  const sig = MAX_VOL > 0 && vol > MAX_VOL ? 0 : mom > LONG_THRESHOLD ? 1 : mom < -SHORT_THRESHOLD ? -1 : 0;
  const lev = vol > 0 ? Math.min(MAX_LEVERAGE, TARGET_VOL / vol) : 0;
  return sig * lev;
}

function portfolioVolAt(pos, time) {
  const active = maps.filter((m) => (pos.get(m.symbol) || 0) !== 0);
  if (!active.length) return 0;
  const count = 30;
  const values = [];
  for (let j = count; j >= 1; j -= 1) {
    let value = 0;
    for (const item of active) {
      const rows = item.rows.filter((r) => r.time <= time);
      if (rows.length <= j) continue;
      value += pos.get(item.symbol) * (rows[rows.length - j].close / rows[rows.length - j - 1].close - 1);
    }
    values.push(value);
  }
  return stdev(values) * Math.sqrt(365);
}

const equity = [1];
const buyHold = [1];
const strategyReturns = [];
let positions = new Map();
let lastRebalance = null;
for (let index = 1; index < times.length; index += 1) {
  const time = times[index];
  let turnover = 0;
  if (!lastRebalance || time - lastRebalance >= REBALANCE * 86400000) {
    const active = maps.map((item) => ({ symbol: item.symbol, size: positionAt(item, times[index - 1]) })).filter((x) => x.size !== 0);
    const gross = active.reduce((a, x) => a + Math.abs(x.size), 0);
    const scale = gross > 2 ? 2 / gross : 1;
    const next = new Map(active.map((x) => [x.symbol, x.size * scale]));
    const estimatedVol = portfolioVolAt(next, times[index - 1]);
    const volScale = estimatedVol > TARGET_VOL ? TARGET_VOL / estimatedVol : 1;
    for (const key of next.keys()) next.set(key, next.get(key) * volScale);
    for (const key of new Set([...positions.keys(), ...next.keys()])) turnover += Math.abs((next.get(key) || 0) - (positions.get(key) || 0));
    positions = next;
    lastRebalance = time;
  }
  let pnl = 0;
  let activeCount = 0;
  for (const item of maps) {
    const prev = item.map.get(times[index - 1]);
    const now = item.map.get(time);
    if (!prev || !now) continue;
    const assetReturn = now.close / prev.close - 1;
    const pos = positions.get(item.symbol) || 0;
    pnl += pos * assetReturn;
    if (pos !== 0) activeCount += 1;
  }
  const gross = [...positions.values()].reduce((a, x) => a + Math.abs(x), 0);
  pnl -= gross * FUNDING;
  const net = pnl - turnover * COST;
  strategyReturns.push(net);
  equity.push(equity[equity.length - 1] * (1 + net));
  let bh = 0;
  for (const item of maps) {
    const prev = item.map.get(times[index - 1]);
    const now = item.map.get(time);
    if (prev && now) bh += now.close / prev.close - 1;
  }
  bh /= maps.length;
  buyHold.push(buyHold[buyHold.length - 1] * (1 + bh));
}

const result = {
  generatedAt: new Date().toISOString(),
  universe: series.length,
  period: { from: new Date(times[0]).toISOString().slice(0, 10), to: new Date(times[times.length - 1]).toISOString().slice(0, 10), days: times.length - 1 },
  assumptions: { costPerSide: COST, fundingDaily: FUNDING, targetVol: TARGET_VOL, maxLeverage: MAX_LEVERAGE, lookback: LOOKBACK, longThreshold: LONG_THRESHOLD, shortThreshold: SHORT_THRESHOLD, rebalanceDays: REBALANCE },
  strategy: metrics(strategyReturns),
  buyHold: metrics(buyHold.slice(1).map((v, i) => v / buyHold[i] - 1)),
  lastPositions: Object.fromEntries(positions)
};
writeFileSync(join(OUT, "efficiency.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
