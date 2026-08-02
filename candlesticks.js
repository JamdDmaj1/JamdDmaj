const EPSILON = 1e-12;

export function analyzeCandlesticks(values, { excludeLast = false } = {}) {
  let candles = (Array.isArray(values) ? values : []).map(normalizeCandle).filter(Boolean);
  if (excludeLast && candles.length) candles = candles.slice(0, -1);
  if (candles.length < 6) return emptyAnalysis();

  const current = candles.at(-1);
  const previous = candles.at(-2);
  const third = candles.at(-3);
  const currentShape = candleShape(current);
  const previousShape = candleShape(previous);
  const thirdShape = candleShape(third);
  const averageRange = mean(candles.slice(-14).map((candle) => candle.high - candle.low));
  const meaningfulBody = Math.max(averageRange * 0.08, EPSILON);
  const patterns = [];

  const oneCandleTrend = priorTrend(candles, candles.length - 1);
  const twoCandleTrend = priorTrend(candles, candles.length - 2);
  const threeCandleTrend = priorTrend(candles, candles.length - 3);

  if (currentShape.bodyRatio <= 0.1) {
    patterns.push(pattern("doji", "neutral", 0, "indecision"));
  }

  const hammerShape = currentShape.lowerShadow >= currentShape.body * 2
    && currentShape.upperShadow <= currentShape.body
    && currentShape.bodyRatio <= 0.45;
  const invertedHammerShape = currentShape.upperShadow >= currentShape.body * 2
    && currentShape.lowerShadow <= currentShape.body
    && currentShape.bodyRatio <= 0.45;
  if (currentShape.body >= meaningfulBody && hammerShape) {
    if (oneCandleTrend === "down") patterns.push(pattern("hammer", "bullish", 1, "reversal"));
    if (oneCandleTrend === "up") patterns.push(pattern("hanging-man", "bearish", 1, "reversal"));
  }
  if (currentShape.body >= meaningfulBody && invertedHammerShape) {
    if (oneCandleTrend === "down") patterns.push(pattern("inverted-hammer", "bullish", 1, "reversal"));
    if (oneCandleTrend === "up") patterns.push(pattern("shooting-star", "bearish", 1, "reversal"));
  }

  const bullishEngulfing = previous.close < previous.open
    && current.close > current.open
    && current.open <= previous.close
    && current.close >= previous.open
    && currentShape.body >= Math.max(previousShape.body * 0.95, meaningfulBody);
  const bearishEngulfing = previous.close > previous.open
    && current.close < current.open
    && current.open >= previous.close
    && current.close <= previous.open
    && currentShape.body >= Math.max(previousShape.body * 0.95, meaningfulBody);
  if (bullishEngulfing && twoCandleTrend !== "up") patterns.push(pattern("bullish-engulfing", "bullish", 2, "reversal"));
  if (bearishEngulfing && twoCandleTrend !== "down") patterns.push(pattern("bearish-engulfing", "bearish", 2, "reversal"));

  const thirdMidpoint = (third.open + third.close) / 2;
  const smallMiddle = previousShape.body <= thirdShape.body * 0.55;
  const morningStar = third.close < third.open
    && smallMiddle
    && current.close > current.open
    && current.close >= thirdMidpoint
    && currentShape.body >= meaningfulBody;
  const eveningStar = third.close > third.open
    && smallMiddle
    && current.close < current.open
    && current.close <= thirdMidpoint
    && currentShape.body >= meaningfulBody;
  if (morningStar && threeCandleTrend !== "up") patterns.push(pattern("morning-star", "bullish", 2, "reversal"));
  if (eveningStar && threeCandleTrend !== "down") patterns.push(pattern("evening-star", "bearish", 2, "reversal"));

  const bullishStrength = patterns.filter((item) => item.bias === "bullish").reduce((sum, item) => sum + item.strength, 0);
  const bearishStrength = patterns.filter((item) => item.bias === "bearish").reduce((sum, item) => sum + item.strength, 0);
  const difference = bullishStrength - bearishStrength;
  const bias = difference > 0 ? "bullish" : difference < 0 ? "bearish" : "neutral";
  const strength = Math.min(3, Math.abs(difference));
  return {
    bias,
    strength,
    strong: strength >= 2,
    patterns: patterns.map((item) => item.name),
    details: patterns,
    priorTrend: oneCandleTrend,
    candleTime: current.time || null
  };
}

export function candlestickDecision(analysis, side) {
  const direction = String(side || "").toUpperCase() === "SHORT" ? "bearish" : "bullish";
  const bias = analysis?.bias || "neutral";
  if (bias === "neutral") return "neutral";
  if (bias === direction) return analysis?.strong ? "strong-confirmation" : "confirmation";
  return analysis?.strong ? "strong-opposition" : "opposition";
}

function emptyAnalysis() {
  return {
    bias: "neutral",
    strength: 0,
    strong: false,
    patterns: [],
    details: [],
    priorTrend: "flat",
    candleTime: null
  };
}

function normalizeCandle(value) {
  const candle = Array.isArray(value)
    ? { time: value[0], open: value[1], high: value[2], low: value[3], close: value[4], volume: value[5] }
    : value || {};
  const normalized = {
    time: Number(candle.time) || null,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume)
  };
  if (![normalized.open, normalized.high, normalized.low, normalized.close].every(Number.isFinite)) return null;
  if (normalized.high < normalized.low || normalized.high < Math.max(normalized.open, normalized.close) || normalized.low > Math.min(normalized.open, normalized.close)) return null;
  return normalized;
}

function candleShape(candle) {
  const range = Math.max(EPSILON, candle.high - candle.low);
  const body = Math.max(EPSILON, Math.abs(candle.close - candle.open));
  return {
    body,
    bodyRatio: body / range,
    upperShadow: Math.max(0, candle.high - Math.max(candle.open, candle.close)),
    lowerShadow: Math.max(0, Math.min(candle.open, candle.close) - candle.low)
  };
}

function priorTrend(candles, patternStart) {
  const end = Math.max(1, patternStart);
  const start = Math.max(0, end - 5);
  const first = candles[start]?.close;
  const last = candles[end - 1]?.close;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return "flat";
  const change = (last - first) / Math.abs(first);
  const averageRange = mean(candles.slice(start, end).map((candle) => (candle.high - candle.low) / Math.max(Math.abs(candle.close), EPSILON)));
  const threshold = Math.max(0.002, averageRange * 0.35);
  return change > threshold ? "up" : change < -threshold ? "down" : "flat";
}

function pattern(name, bias, strength, type) {
  return { name, bias, strength, type };
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}
