// Local research only: long-only precision entry filters.
import { readFileSync, writeFileSync } from "node:fs";
const S = ["BTC-USD", "ETH-USD", "SOL-USD"];
const H = 30;
const SPLIT = Date.UTC(2023, 0, 1);
const data = Object.fromEntries(S.map((s) => [s, JSON.parse(readFileSync(`data/${s}.json`, "utf8"))]));

function atr(rows, i, p = 14) {
  const t = [];
  for (let j = Math.max(1, i - p + 1); j <= i; j += 1) {
    const prev = rows[j - 1].close;
    t.push(Math.max(rows[j].high - rows[j].low, Math.abs(rows[j].high - prev), Math.abs(rows[j].low - prev)));
  }
  return t.reduce((a, b) => a + b, 0) / t.length;
}
function sma(c, i, p) {
  return i + 1 < p ? null : c.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p;
}
function out(rows, i, e, a) {
  const tp = e + a * 2;
  const sl = e - a * 5;
  for (let j = i + 1; j <= i + H; j += 1) {
    const r = rows[j];
    if (r.low <= sl) return { ret: -5 * a / e - 0.001, hit: false };
    if (r.high >= tp) return { ret: 2 * a / e - 0.001, hit: true };
  }
  const last = rows[i + H].close;
  return { ret: last / e - 1 - 0.001, hit: last > e };
}
function stats(arr) {
  if (!arr.length) return null;
  return {
    n: arr.length,
    hit: +((arr.filter((x) => x.hit).length / arr.length) * 100).toFixed(1),
    avg: +((arr.reduce((a, x) => a + x.ret, 0) / arr.length) * 100).toFixed(2)
  };
}

const filters = {
  all: () => true,
  red: (r, i) => r[i].close < r[i - 1].close,
  pull3: (r, i) => r[i].close < r[i - 3].close,
  above20: (r, i) => { const m = sma(r.map((x) => x.close), i, 20); return m && r[i].close > m; },
  above50: (r, i) => { const m = sma(r.map((x) => x.close), i, 50); return m && r[i].close > m; },
  dip05: (r, i) => r[i].close / r[i - 1].close - 1 < -0.005,
  dip1: (r, i) => r[i].close / r[i - 1].close - 1 < -0.01,
  dip2: (r, i) => r[i].close / r[i - 1].close - 1 < -0.02,
  dip3: (r, i) => r[i].close / r[i - 1].close - 1 < -0.03,
  dip1_above20: (r, i) => {
    const m = sma(r.map((x) => x.close), i, 20);
    return m && r[i].close > m && r[i].close / r[i - 1].close - 1 < -0.01;
  }
};

const outObj = {};
for (const [name, fn] of Object.entries(filters)) {
  const all = [];
  const val = [];
  for (const s of S) {
    const rows = data[s];
    for (let i = 30; i < rows.length - H; i += 1) {
      const mom = rows[i].close / rows[i - 7].close - 1;
      if (mom <= 0.05 || !fn(rows, i)) continue;
      const x = out(rows, i, rows[i].close, atr(rows, i));
      all.push(x);
      if (rows[i].time >= SPLIT) val.push(x);
    }
  }
  outObj[name] = { all: stats(all), val: stats(val) };
}
writeFileSync("pullback-results.json", JSON.stringify(outObj, null, 2), "utf8");
for (const [k, v] of Object.entries(outObj)) console.log(k, "all", v.all, "val", v.val);
