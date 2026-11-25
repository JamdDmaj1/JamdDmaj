// Local research only: Deribit funding history validation.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CACHE = join(ROOT, "deribit-data");
mkdirSync(CACHE, { recursive: true });
const START = Date.UTC(2021, 0, 1);
const END = Date.UTC(2026, 10, 17);
const H = 30;
const SYMBOLS = [
  { deribit: "BTC-PERPETUAL", yahoo: "BTC-USD" },
  { deribit: "ETH-PERPETUAL", yahoo: "ETH-USD" }
];

async function fetchFunding(instrument) {
  const file = join(CACHE, `${instrument}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const rows = [];
  for (let start = START; start < END; start += 30 * 86400000) {
    const end = Math.min(start + 30 * 86400000, END);
    const url = `https://www.deribit.com/api/v2/public/get_funding_rate_history?instrument_name=${instrument}&start_timestamp=${start}&end_timestamp=${end}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const body = await response.json();
    if (Array.isArray(body.result)) rows.push(...body.result.map((r) => ({ time: Number(r.timestamp), rate: Number(r.interest_8h) })).filter((r) => Number.isFinite(r.rate)));
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  const daily = new Map();
  for (const row of rows) {
    const day = new Date(row.time).toISOString().slice(0, 10);
    if (!daily.has(day)) daily.set(day, []);
    daily.get(day).push(row.rate);
  }
  const result = [...daily.entries()].map(([day, values]) => ({ day, rate: values.reduce((a, b) => a + b, 0) / values.length }));
  writeFileSync(file, JSON.stringify(result, null, 2), "utf8");
  return result;
}
function atr(rows, i, p = 14) {
  const t = [];
  for (let j = Math.max(1, i - p + 1); j <= i; j += 1) {
    const prev = rows[j - 1].close;
    t.push(Math.max(rows[j].high - rows[j].low, Math.abs(rows[j].high - prev), Math.abs(rows[j].low - prev)));
  }
  return t.reduce((a, b) => a + b, 0) / t.length;
}
function outcome(rows, i, entry, a) {
  const tp = entry - 3 * a;
  const sl = entry + 4 * a;
  for (let j = i + 1; j <= i + H; j += 1) {
    const r = rows[j];
    if (r.high >= sl) return { ret: -4 * a / entry - 0.001, hit: false };
    if (r.low <= tp) return { ret: 3 * a / entry - 0.001, hit: true };
  }
  const last = rows[i + H].close;
  return { ret: (entry - last) / entry - 0.001, hit: last < entry };
}
function stats(arr) {
  if (arr.length < 20) return null;
  return {
    n: arr.length,
    hit: +((arr.filter((x) => x.hit).length / arr.length) * 100).toFixed(1),
    avg: +((arr.reduce((a, x) => a + x.ret, 0) / arr.length) * 100).toFixed(2)
  };
}

const samples = [];
for (const item of SYMBOLS) {
  const funding = await fetchFunding(item.deribit);
  const fundingMap = new Map(funding.map((x) => [x.day, x.rate]));
  const rows = JSON.parse(readFileSync(join(ROOT, "..", "strategy-lab", "data", `${item.yahoo}.json`), "utf8"));
  for (let i = 20; i < rows.length - H; i += 1) {
    const mom = rows[i].close / rows[i - 10].close - 1;
    if (mom > -0.05) continue;
    const day = new Date(rows[i].time).toISOString().slice(0, 10);
    const rate = fundingMap.get(day);
    if (rate == null) continue;
    samples.push({ ...outcome(rows, i, rows[i].close, atr(rows, i)), rate, time: rows[i].time });
  }
}
const thresholds = [0, 0.00003, 0.00005, 0.00007, 0.0001];
const report = {};
for (const th of thresholds) {
  const group = samples.filter((x) => x.rate >= th);
  report[th] = {
    all: stats(group),
    train: stats(group.filter((x) => x.time < Date.UTC(2024, 0, 1))),
    val: stats(group.filter((x) => x.time >= Date.UTC(2024, 0, 1)))
  };
}
writeFileSync(join(ROOT, "out", "deribit-funding-results.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
