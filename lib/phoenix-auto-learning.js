// Bounded learning from settled automatic trades. Only TP/SL lessons count;
// a recovery record must never erase the financial outcome that produced it.
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const MIN_LOSSES_TO_BLOCK = 2;
const MIN_WINS_TO_EXTEND = 2;
const TP_EXTENSION = 0.10;
const BLOCK_MS = 24 * 3600 * 1000;

export function learningBias(lessons, {symbol, side, now = Date.now()} = {}) {
  if (!Array.isArray(lessons) || typeof symbol !== 'string' || !['LONG', 'SHORT'].includes(side)) return Object.freeze({});
  const rows = lessons.filter(row => row
    && row.symbol === symbol
    && row.side === side
    && ['TP', 'SL'].includes(row.outcome)
    && Number.isFinite(Number(row.updated))
    && now - Number(row.updated) <= MAX_AGE_MS
    && Number(row.updated) <= now);
  if (!rows.length) return Object.freeze({});
  const lastLoss = rows.filter(row => row.outcome === 'SL').sort((a, b) => b.updated - a.updated)[0];
  const lastWin = rows.filter(row => row.outcome === 'TP').sort((a, b) => b.updated - a.updated)[0];
  const losses = rows.filter(row => row.outcome === 'SL').length;
  const wins = rows.filter(row => row.outcome === 'TP').length;
  if (losses >= MIN_LOSSES_TO_BLOCK && now - lastLoss.updated <= BLOCK_MS && (!lastWin || lastLoss.updated > lastWin.updated)) {
    return Object.freeze({blocked: true, reason: 'repeated stop-loss', losses, wins, blockedUntil: lastLoss.updated + BLOCK_MS});
  }
  if (wins >= MIN_WINS_TO_EXTEND && (!lastLoss || lastWin.updated > lastLoss.updated)) {
    return Object.freeze({tpExtension: TP_EXTENSION, wins, losses});
  }
  return Object.freeze({});
}
