// Local research only: signal hit-rate by horizon, momentum, volatility and side.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "out");
const HORIZONS = [1, 3, 5, 10, 20, 30];
const LOOKBACK = 10;
const THRESHOLD = 0.01;

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}
function bucketVol(vol) {
  if (vol < 0.4) return "<40%";
  if (vol < 0.7) return "40-70%";
  if (vol < 1.0) return "70-100%";
  return ">100%";
}
function bucketMom(mom) {
  const abs = Math.abs(mom);
  if (abs < 0.02) return "1-2%";
  if (abs < 0.05) return "2-5%";
  if (abs < 0.10) return "5-10%";
  return ">10%";
}

const files = readdirSync(DATA).filter((f) => f.endsWith(".json"));
const rowsBySymbol = [];
for (const file of files) {
  try {
    const parsed = JSON.parse(readFileSync(join(DATA, file), "utf8"));
    const rows = Array.isArray(parsed.rows) ? parsed.rows : Array.isArray(parsed) ? parsed : [];
    if (rows.length < 45) continue;
    rowsBySymbol.push({ symbol: file.replace(".json", ""), rows });
  } catch {}
}

const samples = [];
for (const { symbol, rows } of rowsBySymbol) {
  for (let i = 20; i < rows.length - 1; i += 1) {
    const closes = rows.map((r) => r.close);
    const mom = closes[i] / closes[i - LOOKBACK] - 1;
    if (Math.abs(mom) < THRESHOLD) continue;
    const side = mom > 0 ? 1 : -1;
    const rets = closes.slice(Math.max(0, i - 20), i + 1).map((v, j, a) => (j ? v / a[j - 1] - 1 : 0)).slice(1);
    const vol = stdev(rets) * Math.sqrt(365);
    const sma50 = i >= 49 ? closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50 : null;
    const regime = sma50 == null ? "unknown" : closes[i] > sma50 ? "above" : "below";
    const entry = closes[i];
    for (const h of HORIZONS) {
      if (i + h >= closes.length) continue;
      const ret = side * (closes[i + h] / entry - 1);
      samples.push({ symbol, i, side, mom, vol, h, ret, hit: ret > 0, regime });
    }
  }
}

function summarize(filter) {
  const out = {};
  for (const h of HORIZONS) {
    const subset = samples.filter((s) => s.h === h && filter(s));
    if (!subset.length) {
      out[h] = { n: 0 };
      continue;
    }
    const wins = subset.filter((s) => s.hit).length;
    const avg = subset.reduce((a, s) => a + s.ret, 0) / subset.length;
    const sorted = [...subset].sort((a, b) => a.ret - b.ret);
    const median = sorted[Math.floor(sorted.length / 2)].ret;
    const winsArr = subset.filter((s) => s.ret > 0).map((s) => s.ret);
    const lossesArr = subset.filter((s) => s.ret <= 0).map((s) => s.ret);
    const avgWin = winsArr.length ? winsArr.reduce((a, b) => a + b, 0) / winsArr.length : 0;
    const avgLoss = lossesArr.length ? Math.abs(lossesArr.reduce((a, b) => a + b, 0) / lossesArr.length) : 0;
    out[h] = {
      n: subset.length,
      hitRatePct: +((wins / subset.length) * 100).toFixed(1),
      avgRetPct: +(avg * 100).toFixed(2),
      medianRetPct: +(median * 100).toFixed(2),
      avgWinPct: +(avgWin * 100).toFixed(2),
      avgLossPct: +(avgLoss * 100).toFixed(2),
      payoff: avgLoss > 0 ? +(avgWin / avgLoss).toFixed(2) : null
    };
  }
  return out;
}

const report = {
  generatedAt: new Date().toISOString(),
  symbols: rowsBySymbol.length,
  samples: samples.length,
  horizon: summarize(() => true),
  bySide: { long: summarize((s) => s.side === 1), short: summarize((s) => s.side === -1) },
  byMomentum: Object.fromEntries(["1-2%", "2-5%", "5-10%", ">10%"].map((b) => [b, summarize((s) => bucketMom(s.mom) === b)])),
  byVol: Object.fromEntries(["<40%", "40-70%", "70-100%", ">100%"].map((b) => [b, summarize((s) => bucketVol(s.vol) === b)])),
  byRegimeSide: { aboveLong: summarize((s) => s.regime === "above" && s.side === 1), aboveShort: summarize((s) => s.regime === "above" && s.side === -1), belowLong: summarize((s) => s.regime === "below" && s.side === 1), belowShort: summarize((s) => s.regime === "below" && s.side === -1) }
};
writeFileSync(join(OUT, "signal-lab.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report.horizon, null, 2));
console.log("\nBY SIDE\n", JSON.stringify(report.bySide, null, 2));
console.log("\nBY MOMENTUM (h=10)\n", Object.fromEntries(Object.entries(report.byMomentum).map(([k, v]) => [k, v[10]])));
console.log("\nBY VOL (h=10)\n", Object.fromEntries(Object.entries(report.byVol).map(([k, v]) => [k, v[10]])));
