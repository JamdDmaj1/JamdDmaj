// Local research only. Grid + portfolio simulation with train/validation split.
import { readFileSync, writeFileSync } from "node:fs";

const SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"];
const START = Date.UTC(2019, 0, 1);
const TRAIN_END = Date.UTC(2023, 0, 1);
const END = Date.UTC(2026, 10, 17);
const COST = 0.0005;
const FUNDING = 0.0002;

const data = Object.fromEntries(SYMBOLS.map((s) => [s, JSON.parse(readFileSync(`data/${s}.json`, "utf8"))]));

function stdev(values, index, period) {
  if (index + 1 < period) return null;
  const slice = values.slice(index - period + 1, index + 1);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
}
function metrics(rows) {
  const n = rows.length;
  if (!n) return null;
  let eq = 1, peak = 1, dd = 0;
  for (const r of rows) { eq *= 1 + r; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  const mean = rows.reduce((a, b) => a + b, 0) / n;
  const variance = rows.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const vol = Math.sqrt(variance) * Math.sqrt(365);
  const cagr = eq ** (365 / n) - 1;
  return {
    days: n,
    cagr: +(cagr * 100).toFixed(2),
    vol: +(vol * 100).toFixed(2),
    sharpe: +(vol ? (mean * 365) / vol : 0).toFixed(2),
    maxDrawdown: +(dd * 100).toFixed(2),
    calmar: dd < 0 ? +(cagr / Math.abs(dd)).toFixed(2) : null
  };
}
function run(rows, p) {
  const closes = rows.map((r) => r.close);
  const returns = closes.map((v, i) => (i ? v / closes[i - 1] - 1 : 0));
  const series = [];
  let position = 0;
  for (let i = 1; i < rows.length; i += 1) {
    let desired = position;
    if (i % p.rebalance === 0 || i === 1) {
      const signal = i >= p.lookback && closes[i - 1] > closes[i - 1 - p.lookback] ? 1 : i >= p.lookback ? -1 : 0;
      const sd = stdev(returns, i - 1, 20);
      const lev = sd > 0 ? Math.min(p.maxLeverage, p.targetVol / (sd * Math.sqrt(365))) : 0;
      desired = signal * lev;
    }
    const trade = Math.abs(desired - position);
    const net = desired * returns[i] - trade * COST - Math.abs(desired) * FUNDING;
    position = desired;
    series.push({ time: rows[i].time, value: net });
  }
  return series;
}
function portfolio(seriesBySymbol) {
  const maps = seriesBySymbol.map((s) => new Map(s.map((x) => [x.time, x.value])));
  const common = [...maps[0].keys()].filter((t) => maps.every((m) => m.has(t))).sort((a, b) => a - b);
  return common.map((t) => ({ time: t, value: maps.reduce((sum, m) => sum + m.get(t), 0) / maps.length }));
}
function window(series, start, end) {
  return series.filter((x) => x.time >= start && x.time < end).map((x) => x.value);
}

const variants = [];
for (const lookback of [20, 30, 40, 60])
  for (const targetVol of [0.15, 0.2, 0.25])
    for (const maxLeverage of [1, 1.5, 2, 3])
      for (const rebalance of [1, 7, 14, 30])
        variants.push({ lookback, targetVol, maxLeverage, rebalance });

const evaluated = [];
for (const p of variants) {
  const series = SYMBOLS.map((s) => run(data[s], p));
  const port = portfolio(series);
  const train = metrics(window(port, START, TRAIN_END));
  const test = metrics(window(port, TRAIN_END, END));
  evaluated.push({ ...p, train, test });
}

const rankedTrain = [...evaluated].sort((a, b) => (b.train?.sharpe ?? -99) - (a.train?.sharpe ?? -99));
const rankedTest = [...evaluated].sort((a, b) => (b.test?.sharpe ?? -99) - (a.test?.sharpe ?? -99));
const robust = evaluated
  .filter((v) => v.test && v.train)
  .map((v) => ({ ...v, score: Math.min(v.train.sharpe, v.test.sharpe) }))
  .sort((a, b) => b.score - a.score);

const summary = {
  generatedAt: new Date().toISOString(),
  assumptions: { costPerSide: COST, fundingDaily: FUNDING, assets: SYMBOLS, train: "2019-01-01/2023-01-01", validation: "2023-01-01/2026-11-17" },
  bestByTrain: rankedTrain.slice(0, 10),
  bestByValidation: rankedTest.slice(0, 10),
  mostRobustTrainAndValidation: robust.slice(0, 10),
  variantsTested: variants.length
};
writeFileSync("grid-results.json", JSON.stringify(summary, null, 2), "utf8");

for (const [title, list] of [["BEST TRAIN", rankedTrain], ["BEST VALIDATION", rankedTest], ["ROBUST", robust]]) {
  console.log("\n##", title);
  for (const v of list.slice(0, 8)) {
    console.log(`lb${v.lookback} vol${v.targetVol} lev${v.maxLeverage} reb${v.rebalance} train ${v.train.sharpe}/${v.train.cagr}% dd${v.train.maxDrawdown}% | test ${v.test.sharpe}/${v.test.cagr}% dd${v.test.maxDrawdown}%`);
  }
}
