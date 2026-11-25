// Local paper tracker. No orders, no web, no production imports.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = join(ROOT, "out");
const STATE_NAME = String(process.env.PAPER_STATE || "paper-state.json");
const STATE_FILE = join(OUT, STATE_NAME);
const HISTORY_FILE = join(OUT, STATE_NAME.replace(/\.json$/, "-history.json"));
const REPORT_FILE = join(OUT, STATE_NAME.replace(/\.json$/, "-report.txt"));

function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

async function tickers() {
  const response = await fetch("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", {
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`tickers ${response.status}`);
  const body = await response.json();
  if (body.code !== "00000") throw new Error(body.msg || body.code);
  return new Map((body.data || []).map((row) => [row.symbol, Number(row.lastPr)]));
}

const latest = readJson(join(OUT, "latest.json"), { active: [] });
const prices = await tickers();
const state = readJson(STATE_FILE, { startedAt: new Date().toISOString(), realized: 0, fees: 0, funding: 0, lastFundingDate: null, positions: [], closed: [], history: [] });
state.fees = Number(state.fees || 0);
state.funding = Number(state.funding || 0);
if (!state.feeInitialized) {
  state.fees += state.positions.reduce((sum, p) => sum + Math.abs(p.size) * 0.0005, 0);
  state.feeInitialized = true;
}
const existing = new Set(state.positions.map((p) => p.symbol));
const today = new Date().toISOString().slice(0, 10);

for (const signal of latest.active || []) {
  if (existing.has(signal.symbol)) continue;
  if (!Number.isFinite(signal.close) || !Number.isFinite(signal.effectiveLeverage)) continue;
  state.fees += Math.abs(signal.effectiveLeverage) * 0.0005;
  state.positions.push({
    symbol: signal.symbol,
    base: signal.base,
    side: signal.signal,
    size: signal.effectiveLeverage,
    entry: signal.close,
    takeProfit: signal.takeProfit,
    stopLoss: signal.suggestedStop,
    openedAt: new Date().toISOString(),
    openedDate: today,
    lastPrice: signal.close
  });
}

let realizedToday = 0;
for (const position of [...state.positions]) {
  const price = prices.get(position.symbol);
  if (!Number.isFinite(price) || price <= 0) continue;
  position.lastPrice = price;
  position.unrealizedPct = +(position.size * (price / position.entry - 1) * 100).toFixed(4);
  const hitTp = position.side === 1 ? price >= position.takeProfit : price <= position.takeProfit;
  const hitSl = position.side === 1 ? price <= position.stopLoss : price >= position.stopLoss;
  const ageDays = (Date.now() - Date.parse(position.openedAt)) / 86400000;
  if (hitTp || hitSl || ageDays >= 30) {
    const exitPrice = hitTp
      ? position.takeProfit
      : hitSl
        ? (position.side === 1 ? Math.min(price, position.stopLoss) : Math.max(price, position.stopLoss))
        : price;
    const pnl = position.size * (exitPrice / position.entry - 1);
    state.fees += Math.abs(position.size) * 0.0005;
    state.realized += pnl;
    realizedToday += pnl;
    state.closed.push({
      ...position,
      exitPrice,
      closedAt: new Date().toISOString(),
      exitReason: hitTp ? "TP" : hitSl ? "SL" : "TIME",
      pnlPct: +(pnl * 100).toFixed(4)
    });
    state.positions = state.positions.filter((p) => p !== position);
  }
}

if (state.lastFundingDate !== today) {
  state.funding += state.positions.reduce((sum, p) => sum + Math.abs(p.size) * 0.0002, 0);
  state.lastFundingDate = today;
}
const openRisk = state.positions.reduce((sum, p) => sum + Math.abs(p.size) * Math.abs(p.entry - p.stopLoss) / p.entry, 0);
const unrealized = state.positions.reduce((sum, p) => sum + p.size * ((p.lastPrice || p.entry) / p.entry - 1), 0);
const equity = 1 + state.realized + unrealized - state.fees - state.funding;
const closed = state.closed;
const wins = closed.filter((p) => p.pnlPct > 0).length;
const winRate = closed.length ? +((wins / closed.length) * 100).toFixed(1) : null;

const snapshot = {
  date: today,
  at: new Date().toISOString(),
  equity: +equity.toFixed(6),
  realized: +state.realized.toFixed(6),
  unrealized: +unrealized.toFixed(6),
  fees: +state.fees.toFixed(6),
  funding: +state.funding.toFixed(6),
  openRiskPct: +(openRisk * 100).toFixed(3),
  openPositions: state.positions.length,
  closedTrades: closed.length,
  winRate
};
state.history = (state.history || []).filter((row) => row.date !== today);
state.history.push(snapshot);
saveJson(STATE_FILE, state);

const history = readJson(HISTORY_FILE, { snapshots: [] });
history.snapshots = (history.snapshots || []).filter((row) => row.date !== today);
history.snapshots.push(snapshot);
saveJson(HISTORY_FILE, history);

const lines = [
  `Paper Tracker · ${snapshot.at}`,
  `Equity: ${snapshot.equity.toFixed(4)} | realized ${(snapshot.realized * 100).toFixed(2)}% | unrealized ${(snapshot.unrealized * 100).toFixed(2)}% | fees ${(snapshot.fees * 100).toFixed(2)}% | funding ${(snapshot.funding * 100).toFixed(2)}%`,
  `Open: ${snapshot.openPositions} | Closed: ${snapshot.closedTrades} | Win rate: ${winRate == null ? "n/a" : winRate + "%"} | Risk at stops: ${snapshot.openRiskPct}%`,
  "",
  ...state.positions.map((p) => `${p.side === 1 ? "LONG" : "SHORT"} ${p.base} size ${p.size}x entry ${p.entry} now ${p.lastPrice} pnl ${p.unrealizedPct}%`),
  "",
  "No real orders. Paper only."
];
writeFileSync(REPORT_FILE, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
