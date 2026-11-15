// Shared futures signal rules. Pure functions only: no orders, no state.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function buildSignalLevels({ entry, atrDistance, leverage }) {
  const tpDistance = atrDistance * 0.8;
  const slDistance = atrDistance * 1.2;
  const tp1Roe = tpDistance * Number(leverage || 10) * 100;
  return {
    tpDistance,
    slDistance,
    protectionTriggerRoe: clamp(tp1Roe, 3, 50),
    protectionLockRoe: clamp(tp1Roe * 0.5, 1, 40)
  };
}

export function buildSignalEntry({ price, adx, atrDistance, direction }) {
  const pullback = Number(adx) >= 45 ? atrDistance * 0.2 : 0;
  return { entry: price - direction * pullback, entryType: pullback ? "pullback-0.2atr" : "market" };
}

export function classifyAlignment(bias, side) {
  const direction = side === "LONG" ? "bullish" : "bearish";
  if (bias === "mixed") return "neutral-market";
  return bias === direction ? "with-market" : "counter-market";
}

export const FUTURES_SIGNAL_RULES = [
  "JamdDmaj futures rules when you suggest a trade:",
  "1. Only with-market alignment is actionable; label counter-market ideas as study-only.",
  "2. Levels: TP1 = 0.8 x ATR, TP2 = 1.44 x ATR, TP3 = 2.16 x ATR, stop = 1.2 x ATR.",
  "3. If ADX >= 45, do not chase: suggest a limit entry 0.2 x ATR in the pullback direction and say it may not fill.",
  "4. Require volume ratio >= 0.7 and warn when it is lower; avoid micro caps and stale quotes.",
  "5. Signals expire after 12 hours. Protection arms only at TP1 and locks 50% of the TP1 distance.",
  "6. Never promise accuracy or profits; state the invalidation and that the user decides."
].join("\n");
