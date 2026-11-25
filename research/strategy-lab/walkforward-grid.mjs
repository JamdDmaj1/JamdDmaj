// Local research only: portfolio walk-forward over a parameter grid.
import { readFileSync, writeFileSync } from "node:fs";

const SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"];
const START = Date.UTC(2019, 0, 1);
const END = Date.UTC(2026, 11, 18);
const data = Object.fromEntries(SYMBOLS.map((s) => [s, JSON.parse(readFileSync(`data/${s}.json`, "utf8"))]));

function stdev(a, i, p) {
  if (i + 1 < p) return null;
  const s = a.slice(i - p + 1, i + 1);
  const m = s.reduce((x, y) => x + y, 0) / s.length;
  return Math.sqrt(s.reduce((x, y) => x + (y - m) ** 2, 0) / s.length);
}
function metrics(rows) {
  const n = rows.length;
  if (!n) return null;
  let eq = 1, peak = 1, dd = 0;
  for (const r of rows) { eq *= 1 + r; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  const mean = rows.reduce((a, b) => a + b, 0) / n;
  const v = rows.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const vol = Math.sqrt(v) * Math.sqrt(365);
  const cagr = eq ** (365 / n) - 1;
  return { cagr: +(cagr * 100).toFixed(2), vol: +(vol * 100).toFixed(2), sharpe: +(vol ? (mean * 365) / vol : 0).toFixed(2), dd: +(dd * 100).toFixed(2) };
}
function run(rows, p) {
  const closes = rows.map((r) => r.close);
  const rets = closes.map((v, i) => (i ? v / closes[i - 1] - 1 : 0));
  const series = [];
  let pos = 0;
  for (let i = 1; i < rows.length; i += 1) {
    let desired = pos;
    if (i % p.rebalance === 0 || i === 1) {
      let sig = 0;
      if (i >= p.lookback) {
        const mom = closes[i - 1] / closes[i - 1 - p.lookback] - 1;
        sig = mom > p.th ? 1 : mom < -p.th ? -1 : 0;
      }
      const sd = stdev(rets, i - 1, 20);
      const lev = sd > 0 ? Math.min(2, p.targetVol / (sd * Math.sqrt(365))) : 0;
      desired = sig * lev;
    }
    const trade = Math.abs(desired - pos);
    series.push({ time: rows[i].time, value: desired * rets[i] - trade * 0.0005 - Math.abs(desired) * 0.0002 });
    pos = desired;
  }
  return series;
}
function portfolio(ss) {
  const maps = ss.map((s) => new Map(s.map((x) => [x.time, x.value])));
  const common = [...maps[0].keys()].filter((t) => maps.every((m) => m.has(t))).sort((a, b) => a - b);
  return common.map((t) => ({ time: t, value: maps.reduce((a, m) => a + m.get(t), 0) / maps.length }));
}
const pick = (s, a, b) => s.filter((x) => x.time >= a && x.time < b).map((x) => x.value);

const grid = [];
for (const lookback of [10, 12, 15, 20])
  for (const rebalance of [20, 30])
    for (const th of [0.005, 0.01, 0.015, 0.02])
      for (const targetVol of [0.1, 0.12, 0.15])
        grid.push({ lookback, rebalance, th, targetVol });

const series = grid.map((p) => portfolio(SYMBOLS.map((s) => run(data[s], p))));
const years = [2022, 2023, 2024, 2025, 2026];
const out = { chosen: [], annual: [], oos: [] };

for (const year of years) {
  const ts = Date.UTC(year, 0, 1);
  const te = Date.UTC(year + 1, 0, 1);
  const trainStart = Math.max(START, Date.UTC(year - 3, 0, 1));
  let best = null;
  grid.forEach((p, i) => {
    const m = metrics(pick(series[i], trainStart, ts));
    if (m && (!best || m.sharpe > best.train.sharpe)) best = { ...p, train: m, i };
  });
  const vals = pick(series[best.i], ts, te);
  out.chosen.push({ year, ...best });
  out.annual.push({ year, test: metrics(vals) });
}

const all = [];
for (const year of years) {
  const chosen = out.chosen.find((c) => c.year === year);
  all.push(...pick(series[chosen.i], Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)));
}
out.oos = metrics(all);
writeFileSync("walkforward-grid-results.json", JSON.stringify(out, null, 2), "utf8");

for (const c of out.chosen) {
  console.log(c.year, "lb", c.lookback, "reb", c.rebalance, "th", c.th, "vol", c.targetVol, "train", c.train.sharpe, "test", out.annual.find((x) => x.year === c.year).test);
}
console.log("aggregate", out.oos);
