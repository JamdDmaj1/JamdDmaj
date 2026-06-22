import { redisRequest } from "./server.js";

const STATUS_KEY = "jamd:pro:server:status";
const CONFIG_KEY = "jamd:pro:server:config";
const OPEN_KEY = "jamd:pro:server:open";
const HISTORY_KEY = "jamd:pro:server:history";
const MAX_HISTORY = 360;
const SCAN_BATCH_SIZE = 28;
const MAX_DYNAMIC_ASSETS = 320;
const MIN_QUOTE_VOLUME = 3_000_000;
const FETCH_TIMEOUT_MS = 7000;

export const PRO_ASSETS = [
  ["BTC", "Store of value"], ["ETH", "Smart contracts"], ["SOL", "Layer 1"],
  ["XRP", "Payments"], ["BNB", "Exchange ecosystem"], ["ADA", "Layer 1"],
  ["AVAX", "Layer 1"], ["DOGE", "Meme"], ["LINK", "Oracle"], ["SUI", "Layer 1"],
  ["NEAR", "Layer 1 / AI"], ["PEPE", "Meme"], ["INJ", "DeFi"], ["SEI", "Trading L1"],
  ["TIA", "Modular blockchain"], ["JUP", "DeFi"], ["WLD", "Identity / AI"],
  ["ONDO", "Real-world assets"], ["PENDLE", "Yield DeFi"], ["RENDER", "AI / compute"],
  ["FET", "AI"], ["HBAR", "Enterprise L1"], ["DOT", "Interoperability"],
  ["LTC", "Payments"], ["TRX", "Payments"], ["SHIB", "Meme"], ["ARB", "Layer 2"],
  ["OP", "Layer 2"], ["UNI", "DeFi"], ["AAVE", "Lending DeFi"], ["MKR", "Stablecoin DeFi"],
  ["WIF", "Meme"], ["BONK", "Meme"], ["FLOKI", "Meme"], ["TAO", "AI"],
  ["ICP", "Compute"], ["APT", "Layer 1"], ["FIL", "Storage"], ["ATOM", "Interoperability"],
  ["GRT", "Indexing"], ["RUNE", "Cross-chain DeFi"], ["ALGO", "Layer 1"], ["VET", "Enterprise"],
  ["IMX", "Gaming"], ["STX", "Bitcoin ecosystem"], ["ETC", "Proof of work"],
  ["ENA", "Stablecoin DeFi"], ["PYTH", "Oracle"], ["LDO", "Liquid staking"],
  ["CRV", "DeFi"], ["SAND", "Gaming"], ["MANA", "Gaming"], ["AXS", "Gaming"]
].map(([symbol, category]) => ({ symbol, pair: `${symbol}USDT`, category }));

const EXCLUDED_BASE_ASSETS = new Set([
  "USDC", "USDP", "TUSD", "FDUSD", "DAI", "USDE", "USD1", "BUSD", "AEUR", "EUR"
]);

const CATEGORY_GROUPS = [
  ["Community and meme coins", new Set(["DOGE", "SHIB", "PEPE", "BONK", "WIF", "FLOKI", "TURBO", "MEME", "BRETT", "POPCAT", "MEW", "PNUT", "MOG", "TRUMP", "FARTCOIN", "BOME", "DOGS", "NEIRO", "ACT", "GOAT", "FWOG", "PENGU", "CAT", "1000CAT", "BABYDOGE"])],
  ["AI, data and infrastructure", new Set(["FET", "RENDER", "TAO", "GRT", "FIL", "W", "ARKM", "WLD", "JASMY", "AIOZ", "AKT", "AR", "HYPE", "IO", "GRASS", "VIRTUAL", "COOKIE", "PHA", "OCEAN", "NMR", "LINK", "PYTH"] )],
  ["Gaming and culture", new Set(["SAND", "MANA", "GALA", "AXS", "APE", "CHZ", "ENJ", "ILV", "PIXEL", "PORTAL", "GMT", "YGG", "BEAM", "IMX"] )],
  ["DeFi and governance", new Set(["UNI", "AAVE", "MKR", "CRV", "LDO", "COMP", "CAKE", "ONDO", "PENDLE", "ENA", "JTO", "SNX", "DYDX", "1INCH", "RPL", "FXS", "GMX", "RAY", "JOE", "JST", "SUSHI", "BAL", "YFI", "ZRX", "AEVO", "INJ", "JUP", "RUNE"] )],
  ["Layer 2 scaling", new Set(["POL", "ARB", "OP", "STRK", "ZK", "ZRO", "METIS", "BLAST", "MNT"] )],
  ["Layer 1 networks", new Set(["ETH", "SOL", "BNB", "ADA", "AVAX", "DOT", "NEAR", "SUI", "APT", "ATOM", "HBAR", "ICP", "ETC", "VET", "ALGO", "EGLD", "KAVA", "SEI", "TIA", "STX", "KAS", "IOTA", "ROSE", "TON"] )],
  ["Payments and stores of value", new Set(["BTC", "XRP", "LTC", "BCH", "XLM", "TRX", "ZEC", "DASH", "XMR", "QNT"] )],
  ["Exchange ecosystem", new Set(["BNB", "OKB", "CRO", "LEO", "KCS", "GT", "BGB", "MX", "WOO"] )]
];

export async function getProServerState() {
  const results = await redisRequest("pipeline", [
    ["GET", CONFIG_KEY],
    ["GET", STATUS_KEY],
    ["GET", OPEN_KEY],
    ["GET", HISTORY_KEY]
  ]);
  const config = normalizeConfig(parseJson(results?.[0]?.result, {}));
  const status = parseJson(results?.[1]?.result, {});
  const open = normalizeSignals(parseJson(results?.[2]?.result, []));
  const history = normalizeSignals(parseJson(results?.[3]?.result, []));
  return {
    config,
    status,
    open,
    history,
    stats: calculateStats(open, history)
  };
}

export async function saveProServerConfig(value) {
  const config = normalizeConfig(value);
  await redisRequest("pipeline", [["SET", CONFIG_KEY, JSON.stringify(config)]]);
  return config;
}

export async function runProCycle({ force = false } = {}) {
  const startedAt = new Date();
  const state = await getProServerState();
  const config = state.config;
  if (!config.enabled && !force) {
    const status = {
      ok: true,
      enabled: false,
      lastRunAt: startedAt.toISOString(),
      message: "Server scanner is disabled."
    };
    await persistState(state.open, state.history, status);
    return { ...status, stats: state.stats, signals: [], events: [] };
  }

  const universe = await loadProAssetUniverse().catch(() => ({
    assets: PRO_ASSETS.map((asset) => ({
      ...asset,
      contractMultiplier: 1,
      quoteVolume: MIN_QUOTE_VOLUME,
      fundingRate: 0,
      spreadPercent: 0
    })),
    source: "static fallback"
  }));
  const selection = chooseScanAssets(universe.assets, state.status, force);
  const scanAssets = selection.assets;
  const marketRows = await mapWithConcurrency(scanAssets, 8, async (asset) => {
    try {
      return await fetchMarketIndicators(asset);
    } catch {
      return null;
    }
  });
  const markets = marketRows.filter(Boolean);
  const marketMap = new Map(markets.map((item) => [item.symbol, item]));
  const universeMap = new Map(universe.assets.map((item) => [item.symbol, item]));
  const monitored = await monitorOpenSignals(state.open, marketMap, universeMap);
  let open = monitored.open;
  let history = mergeHistory(state.history, monitored.updated);

  const threshold = config.quality === "A" ? 10 : 8;
  const candidates = markets
    .map((market) => buildServerSignal(market))
    .filter((signal) => signal && signal.score >= threshold)
    .sort((a, b) => signalPriority(b, history) - signalPriority(a, history));
  const created = selectDiverseSignals(candidates, open, history, config);
  for (const signal of created) {
    open.push(signal);
    history.unshift(signal);
  }

  open = open.filter((signal) => signal.status === "OPEN").slice(0, 30);
  history = mergeHistory(history, [...created, ...monitored.updated]).slice(0, MAX_HISTORY);
  const stats = calculateStats(open, history);
  const status = {
    ok: true,
    enabled: config.enabled,
    lastRunAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    assetsRequested: scanAssets.length,
    assetsRead: markets.length,
    universeSize: universe.assets.length,
    universeSource: universe.source,
    rotationCursor: selection.nextCursor,
    fullRotationMinutes: Math.ceil(universe.assets.length / SCAN_BATCH_SIZE) * 5,
    created: created.length,
    events: monitored.events.length,
    open: open.length,
    nextBatch: nextBatchLabel(universe.assets, selection.nextCursor),
    message: markets.length ? "Server scan completed." : "No market source responded."
  };

  await persistState(open, history, status);
  await sendCycleNotifications(created, monitored.events);
  return { ...status, stats, signals: created, events: monitored.events };
}

async function persistState(open, history, status) {
  await redisRequest("pipeline", [
    ["SET", OPEN_KEY, JSON.stringify(open)],
    ["SET", HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))],
    ["SET", STATUS_KEY, JSON.stringify(status)]
  ]);
}

async function loadProAssetUniverse() {
  const [exchangeInfo, tickers, premiums, books] = await Promise.all([
    fetchJson("https://fapi.binance.com/fapi/v1/exchangeInfo"),
    fetchJson("https://fapi.binance.com/fapi/v1/ticker/24hr"),
    fetchJson("https://fapi.binance.com/fapi/v1/premiumIndex"),
    fetchJson("https://fapi.binance.com/fapi/v1/ticker/bookTicker")
  ]);
  if (!Array.isArray(exchangeInfo?.symbols) || !Array.isArray(tickers)) {
    throw new Error("Futures catalog unavailable");
  }
  const tickerMap = new Map(tickers.map((item) => [item.symbol, item]));
  const premiumMap = new Map((Array.isArray(premiums) ? premiums : []).map((item) => [item.symbol, item]));
  const bookMap = new Map((Array.isArray(books) ? books : []).map((item) => [item.symbol, item]));
  const now = Date.now();
  const assets = exchangeInfo.symbols
    .filter((item) => (
      item.status === "TRADING"
      && item.contractType === "PERPETUAL"
      && item.quoteAsset === "USDT"
      && !EXCLUDED_BASE_ASSETS.has(item.baseAsset)
      && !/(UP|DOWN|BULL|BEAR)$/.test(item.baseAsset)
      && (!Number(item.onboardDate) || now - Number(item.onboardDate) >= 72 * 3600000)
    ))
    .map((item) => buildDynamicAsset(item, tickerMap.get(item.symbol), premiumMap.get(item.symbol), bookMap.get(item.symbol)))
    .filter((asset) => (
      asset
      && asset.quoteVolume >= MIN_QUOTE_VOLUME
      && asset.spreadPercent <= 0.0035
      && Number.isFinite(asset.lastPrice)
      && asset.lastPrice > 0
    ))
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, MAX_DYNAMIC_ASSETS)
    .map((asset, index) => ({ ...asset, liquidityRank: index + 1 }));
  if (assets.length < 20) throw new Error("Not enough liquid futures markets");
  return { assets, source: "Binance USDT perpetual catalog" };
}

function buildDynamicAsset(info, ticker, premium, book) {
  const contract = normalizeContractBase(info.baseAsset);
  const multiplier = contract.multiplier;
  const lastPrice = Number(ticker?.lastPrice) / multiplier;
  const bid = Number(book?.bidPrice) / multiplier;
  const ask = Number(book?.askPrice) / multiplier;
  const midpoint = bid > 0 && ask > 0 ? (bid + ask) / 2 : lastPrice;
  const spreadPercent = midpoint > 0 && ask >= bid ? (ask - bid) / midpoint : Infinity;
  return {
    symbol: contract.symbol,
    pair: info.symbol,
    exchangeBase: info.baseAsset,
    category: categoryForSymbol(contract.symbol),
    contractMultiplier: multiplier,
    quoteVolume: Number(ticker?.quoteVolume),
    trades24h: Number(ticker?.count),
    change24hSnapshot: Number(ticker?.priceChangePercent),
    lastPrice,
    markPrice: Number(premium?.markPrice) / multiplier,
    fundingRate: Number(premium?.lastFundingRate),
    spreadPercent
  };
}

function normalizeContractBase(baseAsset) {
  const match = String(baseAsset || "").match(/^(\d{2,})([A-Z][A-Z0-9]*)$/);
  if (!match) return { symbol: String(baseAsset || ""), multiplier: 1 };
  const multiplier = Number(match[1]);
  return {
    symbol: match[2],
    multiplier: Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1
  };
}

function categoryForSymbol(symbol) {
  for (const [category, symbols] of CATEGORY_GROUPS) {
    if (symbols.has(symbol)) return category;
  }
  return "Other liquid crypto";
}

function chooseScanAssets(universe, status, force) {
  if (!universe.length) return { assets: [], nextCursor: 0 };
  const requested = force ? Math.min(SCAN_BATCH_SIZE + 12, universe.length) : Math.min(SCAN_BATCH_SIZE, universe.length);
  const storedCursor = Number(status?.rotationCursor);
  const start = Number.isInteger(storedCursor) && storedCursor >= 0
    ? storedCursor % universe.length
    : Math.floor(Date.now() / 300000) * SCAN_BATCH_SIZE % universe.length;
  const assets = [];
  for (let offset = 0; offset < requested; offset += 1) {
    assets.push(universe[(start + offset) % universe.length]);
  }
  return {
    assets: uniqueAssets(assets),
    nextCursor: (start + requested) % universe.length
  };
}

function uniqueAssets(assets) {
  const seen = new Set();
  return assets.filter((asset) => {
    if (seen.has(asset.symbol)) return false;
    seen.add(asset.symbol);
    return true;
  });
}

async function fetchMarketIndicators(asset) {
  const paths = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${asset.pair}&interval=1h&limit=240`,
    `https://api.binance.com/api/v3/klines?symbol=${asset.pair}&interval=1h&limit=240`,
    `https://api.binance.us/api/v3/klines?symbol=${asset.pair}&interval=1h&limit=240`
  ];
  const rows = await fetchFirstCandleSet(paths, 120);
  const multiplier = Number(asset.contractMultiplier) || 1;
  const closes = rows.map((row) => Number(row[4]) / multiplier);
  const highs = rows.map((row) => Number(row[2]) / multiplier);
  const lows = rows.map((row) => Number(row[3]) / multiplier);
  const volumes = rows.map((row) => Number(row[5]));
  if (![...closes, ...highs, ...lows, ...volumes].every(Number.isFinite)) throw new Error("Invalid candles");
  const ema12Series = emaSeries(closes, 12);
  const ema26Series = emaSeries(closes, 26);
  const macdSeries = closes.map((_, index) => (
    Number.isFinite(ema12Series[index]) && Number.isFinite(ema26Series[index])
      ? ema12Series[index] - ema26Series[index]
      : NaN
  )).filter(Number.isFinite);
  const macdSignalSeries = emaSeries(macdSeries, 9).filter(Number.isFinite);
  const candlePrice = closes.at(-1);
  const markPrice = Number(asset.markPrice);
  const price = Number.isFinite(markPrice) && markPrice > 0 && Math.abs(markPrice - candlePrice) / candlePrice < 0.02
    ? markPrice
    : candlePrice;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const ema12 = ema12Series.at(-1);
  const ema26 = ema26Series.at(-1);
  const macd = macdSeries.at(-1);
  const macdSignal = macdSignalSeries.at(-1);
  const recentVolume = sma(volumes, 3);
  const averageVolume = sma(volumes.slice(0, -3), 20);
  const calculatedChange24h = ((price - closes.at(-25)) / closes.at(-25)) * 100;
  const change24h = Number.isFinite(asset.change24hSnapshot) ? asset.change24hSnapshot : calculatedChange24h;
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const atrValue = atr(highs, lows, closes, 14);
  const standardDeviation = stdDev(closes.slice(-20));
  const trend = price > sma20 && sma20 > sma50
    ? "bullish alignment"
    : price < sma20 && sma20 < sma50
      ? "bearish alignment"
      : "mixed alignment";
  const higherCandles = aggregateCandles(rows, 4 * 3600000, multiplier);
  const higherCloses = higherCandles.map((item) => item.close);
  const higherSma20 = sma(higherCloses, 20);
  const higherSma50 = sma(higherCloses, 50);
  const higherPrice = higherCloses.at(-1);
  const higherTrend = higherPrice > higherSma20 && higherSma20 > higherSma50
    ? "bullish 4h alignment"
    : higherPrice < higherSma20 && higherSma20 < higherSma50
      ? "bearish 4h alignment"
      : "mixed 4h alignment";
  return {
    ...asset,
    price,
    closes,
    high: highs.at(-1),
    low: lows.at(-1),
    change24h,
    rsi: rsi(closes, 14),
    ema12,
    ema26,
    sma20,
    sma50,
    macdHistogram: macd - macdSignal,
    volumeRatio: averageVolume ? recentVolume / averageVolume : NaN,
    atr: atrValue,
    atrPercent: atrValue / price,
    bollingerPosition: standardDeviation
      ? (price - sma20) / (standardDeviation * 2)
      : 0,
    momentum6h: ((price - closes.at(-7)) / closes.at(-7)) * 100,
    higherTrend,
    higherRsi: rsi(higherCloses, 14),
    quoteVolume: Number(asset.quoteVolume),
    fundingRate: Number(asset.fundingRate),
    spreadPercent: Number(asset.spreadPercent),
    recentHigh,
    recentLow,
    trend
  };
}

async function fetchFirstCandleSet(paths, minimumRows) {
  let lastError;
  for (const url of paths) {
    try {
      const value = await fetchJson(url);
      if (!Array.isArray(value) || value.length < minimumRows) throw new Error("Market unavailable");
      return value;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Market unavailable");
}

function aggregateCandles(rows, intervalMs, multiplier = 1) {
  const buckets = new Map();
  for (const row of rows) {
    const openTime = Number(row[0]);
    const close = Number(row[4]) / multiplier;
    if (!Number.isFinite(openTime) || !Number.isFinite(close)) continue;
    const bucket = Math.floor(openTime / intervalMs);
    const existing = buckets.get(bucket);
    if (existing) {
      existing.close = close;
    } else {
      buckets.set(bucket, { close });
    }
  }
  return [...buckets.values()];
}

function buildServerSignal(data) {
  if (!Number.isFinite(data.price) || data.price <= 0 || !Number.isFinite(data.atrPercent)) return null;
  const fundingRate = Number.isFinite(data.fundingRate) ? data.fundingRate : 0;
  const executionQuality = data.quoteVolume >= MIN_QUOTE_VOLUME && data.spreadPercent <= 0.0035;
  const bullish = {
    trend: data.trend.includes("bullish"),
    higherTrend: data.higherTrend.includes("bullish"),
    ema: data.ema12 > data.ema26,
    price: data.price > data.ema12 && data.price > data.sma20,
    macd: data.macdHistogram > 0,
    rsi: data.rsi >= 45 && data.rsi <= 65 && data.higherRsi < 70,
    volume: data.volumeRatio >= 0.9,
    momentum: data.momentum6h > 0,
    structure: data.price >= data.recentHigh * 0.985,
    daily: data.change24h > 0,
    funding: fundingRate <= 0.0015,
    execution: executionQuality
  };
  const bearish = {
    trend: data.trend.includes("bearish"),
    higherTrend: data.higherTrend.includes("bearish"),
    ema: data.ema12 < data.ema26,
    price: data.price < data.ema12 && data.price < data.sma20,
    macd: data.macdHistogram < 0,
    rsi: data.rsi <= 55 && data.rsi >= 35 && data.higherRsi > 30,
    volume: data.volumeRatio >= 0.9,
    momentum: data.momentum6h < 0,
    structure: data.price <= data.recentLow * 1.015,
    daily: data.change24h < 0,
    funding: fundingRate >= -0.0015,
    execution: executionQuality
  };
  const scoreSide = (checks) => Object.values(checks).filter(Boolean).length;
  const longScore = scoreSide(bullish);
  const shortScore = scoreSide(bearish);
  const side = longScore >= shortScore ? "LONG" : "SHORT";
  const score = Math.max(longScore, shortScore);
  const checks = side === "LONG" ? bullish : bearish;
  const notOverextended = side === "LONG"
    ? data.bollingerPosition <= 1.05
    : data.bollingerPosition >= -1.05;
  if (!checks.trend || !checks.higherTrend || !checks.execution || !notOverextended) return null;
  const direction = side === "LONG" ? 1 : -1;
  const atrDistance = clamp(data.atrPercent * 1.3, 0.006, 0.038);
  const entry = data.price;
  const createdAt = new Date();
  const id = `${data.symbol}-${side}-${createdAt.getTime()}`;
  const passed = Object.entries(checks).filter(([, pass]) => pass).map(([name]) => name);
  return {
    id,
    pair: data.pair,
    baseSymbol: data.symbol,
    symbol: `${data.symbol}/USDT PERP`,
    category: data.category,
    contractMultiplier: Number(data.contractMultiplier) || 1,
    liquidity24h: Number(data.quoteVolume) || 0,
    fundingRate: Number(data.fundingRate) || 0,
    spreadPercent: Number(data.spreadPercent) || 0,
    side,
    score,
    maxScore: 12,
    confidence: score >= 10 ? "A" : score >= 8 ? "B" : "C",
    entry,
    sl: entry * (1 - direction * atrDistance),
    tp1: entry * (1 + direction * atrDistance * 1.2),
    tp2: entry * (1 + direction * atrDistance * 2),
    tp3: entry * (1 + direction * atrDistance * 3),
    createdAt: createdAt.toISOString(),
    validUntil: new Date(createdAt.getTime() + 90 * 60000).toISOString(),
    status: "OPEN",
    reached: [],
    reasons: [
      data.trend,
      data.higherTrend,
      `RSI ${formatNumber(data.rsi, 2)}`,
      `4h RSI ${formatNumber(data.higherRsi, 2)}`,
      `MACD ${formatNumber(data.macdHistogram, 6)}`,
      `Volume ${formatNumber(data.volumeRatio, 2)}x`,
      `Liquidity $${formatCompact(data.quoteVolume)}`,
      `Spread ${formatNumber(data.spreadPercent * 100, 3)}%`,
      `Funding ${formatSigned(data.fundingRate * 100)}%`,
      `ATR ${formatNumber(data.atrPercent * 100, 2)}%`,
      `6h ${formatSigned(data.momentum6h)}%`
    ],
    summary: `${side} setup confirmed on 1h and 4h. Passed: ${passed.join(", ")}. Liquidity, spread, funding, momentum and volatility were checked; levels use ATR-based invalidation.`
  };
}

function signalPriority(signal, history) {
  const lastSamePair = history.find((item) => item.pair === signal.pair);
  const ageHours = lastSamePair
    ? Math.max(0, (Date.now() - Date.parse(lastSamePair.createdAt)) / 3600000)
    : 48;
  const freshness = Math.min(2.5, ageHours / 12);
  const liquidity = Math.min(1.5, Math.max(0, Math.log10(Math.max(signal.liquidity24h || 1, 1)) - 6));
  return signal.score + freshness + liquidity;
}

function selectDiverseSignals(candidates, open, history, config) {
  const eligible = candidates.filter((signal) => (
    !open.some((item) => item.pair === signal.pair && item.status === "OPEN")
    && !recentDuplicate(history, signal, Math.max(config.cooldownMinutes, 180))
  ));
  const selected = [];
  const categories = new Set();
  for (const signal of eligible) {
    if (selected.length >= config.maxSignalsPerRun) break;
    if (categories.has(signal.category)) continue;
    selected.push(signal);
    categories.add(signal.category);
  }
  for (const signal of eligible) {
    if (selected.length >= config.maxSignalsPerRun) break;
    if (selected.some((item) => item.pair === signal.pair)) continue;
    selected.push(signal);
  }
  return selected;
}

async function monitorOpenSignals(open, marketMap, universeMap) {
  const updated = [];
  const events = [];
  for (const original of open) {
    const signal = { ...original, reached: [...(original.reached || [])] };
    if (signal.status !== "OPEN") continue;
    const asset = universeMap.get(signal.baseSymbol) || {
      symbol: signal.baseSymbol,
      pair: signal.pair,
      category: signal.category,
      contractMultiplier: Number(signal.contractMultiplier) || 1
    };
    let touch;
    try {
      touch = await fetchTouchRange(asset, signal.checkedAt || signal.createdAt, signal.validUntil);
    } catch {
      const market = marketMap.get(signal.baseSymbol);
      if (market) touch = { candles: [{ high: market.price, low: market.price, close: market.price }] };
    }
    if (!touch) continue;
    const long = signal.side === "LONG";
    for (const candle of touch.candles) {
      const stopTouched = long ? candle.low <= signal.sl : candle.high >= signal.sl;
      const targetTouches = [
        ["TP1", long ? candle.high >= signal.tp1 : candle.low <= signal.tp1],
        ["TP2", long ? candle.high >= signal.tp2 : candle.low <= signal.tp2],
        ["TP3", long ? candle.high >= signal.tp3 : candle.low <= signal.tp3]
      ];
      const newTargetTouched = targetTouches.some(([name, touched]) => touched && !signal.reached.includes(name));
      if (stopTouched && newTargetTouched) {
        signal.status = "AMBIGUOUS";
        signal.closedAt = new Date().toISOString();
        signal.closePrice = candle.close;
        events.push({ type: "AMBIGUOUS", signal: { ...signal } });
        break;
      }
      for (const [name, touched] of targetTouches) {
        if (touched && !signal.reached.includes(name)) {
          signal.reached.push(name);
          events.push({ type: name, signal: { ...signal } });
        }
      }
      if (signal.reached.includes("TP3")) {
        signal.status = "WIN";
        signal.closedAt = new Date().toISOString();
        signal.closePrice = signal.tp3;
        break;
      }
      if (stopTouched) {
        signal.status = "LOSS";
        signal.closedAt = new Date().toISOString();
        signal.closePrice = signal.sl;
        events.push({ type: "SL", signal: { ...signal } });
        break;
      }
      signal.lastPrice = candle.close;
    }
    if (signal.status === "OPEN" && Date.now() > Date.parse(signal.validUntil)) {
      signal.status = "EXPIRED";
      signal.closedAt = new Date().toISOString();
      events.push({ type: "EXPIRED", signal: { ...signal } });
    }
    signal.checkedAt = new Date().toISOString();
    updated.push(signal);
  }
  const updatedMap = new Map(updated.map((signal) => [signal.id, signal]));
  return {
    open: open.map((signal) => updatedMap.get(signal.id) || signal).filter((signal) => signal.status === "OPEN"),
    updated,
    events
  };
}

async function fetchTouchRange(asset, createdAt, validUntil) {
  const start = Math.max(Date.now() - 2 * 3600000, Date.parse(createdAt) - 60000);
  const rows = await fetchFirstCandleSet([
    `https://fapi.binance.com/fapi/v1/klines?symbol=${asset.pair}&interval=5m&startTime=${start}&limit=30`,
    `https://api.binance.com/api/v3/klines?symbol=${asset.pair}&interval=5m&startTime=${start}&limit=30`
  ], 1);
  const multiplier = Number(asset.contractMultiplier) || 1;
  const relevant = rows.filter((row) => (
    Number(row[6]) >= Date.parse(createdAt)
    && Number(row[0]) <= Date.parse(validUntil)
  ));
  const candles = relevant;
  return {
    candles: candles.map((row) => ({
      high: Number(row[2]) / multiplier,
      low: Number(row[3]) / multiplier,
      close: Number(row[4]) / multiplier,
      closeTime: Number(row[6])
    }))
  };
}

function mergeHistory(history, updated) {
  const map = new Map(updated.map((signal) => [signal.id, signal]));
  const merged = history.map((signal) => map.get(signal.id) || signal);
  for (const signal of updated) {
    if (!merged.some((item) => item.id === signal.id)) merged.unshift(signal);
  }
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function recentDuplicate(history, signal, cooldownMinutes) {
  const cutoff = Date.now() - cooldownMinutes * 60000;
  return history.some((item) => (
    item.pair === signal.pair
    && Date.parse(item.createdAt) >= cutoff
  ));
}

function calculateStats(open, history) {
  const wins = history.filter((signal) => signal.status === "WIN").length;
  const losses = history.filter((signal) => signal.status === "LOSS").length;
  const expired = history.filter((signal) => signal.status === "EXPIRED").length;
  const ambiguous = history.filter((signal) => signal.status === "AMBIGUOUS").length;
  const tp1 = history.filter((signal) => signal.reached?.includes("TP1")).length;
  const decided = wins + losses;
  return {
    open: open.length,
    total: history.length,
    wins,
    losses,
    expired,
    ambiguous,
    tp1,
    winRate: decided ? Number(((wins / decided) * 100).toFixed(1)) : 0
  };
}

async function sendCycleNotifications(signals, events) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return;
  for (const signal of signals) {
    await sendTelegram(token, chatId, formatSignalMessage(signal)).catch(() => {});
  }
  for (const event of events) {
    await sendTelegram(token, chatId, formatEventMessage(event)).catch(() => {});
  }
}

async function sendTelegram(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  if (!response.ok) throw new Error(`Telegram ${response.status}`);
}

function formatSignalMessage(signal) {
  const direction = signal.side === "LONG" ? "\u{1F7E2}" : "\u{1F534}";
  return [
    `\u{1F680} <b>JamdDmaj Pro Signal</b>`,
    "",
    `${direction} <b>${escapeHtml(signal.symbol)} | ${signal.side}</b>`,
    `\u{1F3F7}\u{FE0F} ${escapeHtml(signal.category)} | ${signal.confidence} ${signal.score}/${signal.maxScore}`,
    `\u{1F3AF} Entry: <code>${formatPrice(signal.entry)}</code>`,
    `\u{2705} TP1: <code>${formatPrice(signal.tp1)}</code>`,
    `\u{2705} TP2: <code>${formatPrice(signal.tp2)}</code>`,
    `\u{2705} TP3: <code>${formatPrice(signal.tp3)}</code>`,
    `\u{1F6D1} SL: <code>${formatPrice(signal.sl)}</code>`,
    `\u{23F3} Valid until: ${formatDate(signal.validUntil)}`,
    "",
    `\u{1F9E0} <b>Why:</b> ${escapeHtml(signal.summary)}`,
    "",
    "\u{26A0}\u{FE0F} Educational signal. No automatic order execution."
  ].join("\n");
}

function formatEventMessage(event) {
  const labels = {
    TP1: "\u{2705} TP1 reached",
    TP2: "\u{2705}\u{2705} TP2 reached",
    TP3: "\u{1F3C6} TP3 reached - call completed",
    SL: "\u{1F6D1} Stop loss reached",
    EXPIRED: "\u{23F3} Call expired",
    AMBIGUOUS: "\u{26A0}\u{FE0F} Ambiguous candle - excluded from win rate"
  };
  const signal = event.signal;
  const elapsed = Math.max(0, Date.now() - Date.parse(signal.createdAt));
  return [
    `<b>${labels[event.type] || escapeHtml(event.type)}</b>`,
    `${escapeHtml(signal.symbol)} | ${signal.side}`,
    `Created: ${formatDate(signal.createdAt)}`,
    `Elapsed: ${formatDuration(elapsed)}`,
    `Entry: <code>${formatPrice(signal.entry)}</code>`
  ].join("\n");
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "JamdDmaj-Pro-Scanner/1.27" }
    });
    if (!response.ok) throw new Error(`Market ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function normalizeConfig(value) {
  return {
    enabled: value?.enabled === true,
    quality: value?.quality === "AB" ? "AB" : "A",
    cooldownMinutes: clamp(Number(value?.cooldownMinutes) || 90, 15, 360),
    maxSignalsPerRun: clamp(Math.round(Number(value?.maxSignalsPerRun) || 3), 1, 6)
  };
}

function normalizeSignals(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((signal) => signal && signal.id && signal.pair).slice(0, MAX_HISTORY);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sma(values, period) {
  const slice = values.slice(-period);
  if (slice.length < period) return NaN;
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

function emaSeries(values, period) {
  const result = Array(values.length).fill(NaN);
  if (values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  result[period - 1] = value;
  for (let index = period; index < values.length; index += 1) {
    value = (values[index] - value) * multiplier + value;
    result[index] = value;
  }
  return result;
}

function rsi(values, period) {
  if (values.length <= period) return NaN;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gain = changes.slice(0, period).reduce((sum, change) => sum + Math.max(change, 0), 0) / period;
  let loss = changes.slice(0, period).reduce((sum, change) => sum + Math.max(-change, 0), 0) / period;
  for (const change of changes.slice(period)) {
    gain = ((gain * (period - 1)) + Math.max(change, 0)) / period;
    loss = ((loss * (period - 1)) + Math.max(-change, 0)) / period;
  }
  if (!loss) return 100;
  return 100 - (100 / (1 + gain / loss));
}

function atr(highs, lows, closes, period) {
  const ranges = highs.slice(1).map((high, index) => Math.max(
    high - lows[index + 1],
    Math.abs(high - closes[index]),
    Math.abs(lows[index + 1] - closes[index])
  ));
  return sma(ranges, period);
}

function stdDev(values) {
  if (!values.length) return NaN;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (Math.abs(value) >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatDate(value) {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatDuration(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function nextBatchLabel(universe, cursor) {
  if (!universe.length) return "";
  const labels = [];
  for (let offset = 0; offset < Math.min(8, universe.length); offset += 1) {
    labels.push(universe[(cursor + offset) % universe.length].symbol);
  }
  return labels.join(", ");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
