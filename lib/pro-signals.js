import { redisRequest } from "./server.js";

const STATUS_KEY = "jamd:pro:server:status";
const CONFIG_KEY = "jamd:pro:server:config";
const OPEN_KEY = "jamd:pro:server:open";
const HISTORY_KEY = "jamd:pro:server:history";
const MARKET_CAP_KEY = "jamd:pro:server:market-caps";
const PAPER_KEY = "jamd:pro:server:paper";
const CYCLE_LOCK_KEY = "jamd:pro:server:cycle-lock";
const TELEGRAM_DEDUP_PREFIX = "jamd:pro:telegram:sent";
const MAX_HISTORY = 360;
const SCAN_BATCH_SIZE = 30;
const MAX_DYNAMIC_ASSETS = 450;
const MIN_QUOTE_VOLUME = 3_000_000;
const MIN_VOLUME_RATIO = 0.9;
const DEFAULT_PROTECTION_TRIGGER_ROE = 4;
const DEFAULT_PROTECTION_LOCK_ROE = 2;
const MAX_SIGNAL_AGE_MS = 12 * 3600000;
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

const TOKENIZED_COMMODITIES = new Set(["XAU", "XAG", "PAXG"]);
const TOKENIZED_EQUITIES = new Set([
  "AAPL", "AMZN", "COIN", "GOOGL", "META", "MSFT", "MSTR", "NVDA", "QQQ", "SPY", "TSLA"
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
    ["GET", HISTORY_KEY],
    ["GET", PAPER_KEY]
  ]);
  const config = normalizeConfig(parseJson(results?.[0]?.result, {}));
  const status = parseJson(results?.[1]?.result, {});
  const open = normalizeSignals(parseJson(results?.[2]?.result, []));
  const history = normalizeSignals(parseJson(results?.[3]?.result, []));
  const paper = normalizePaperPortfolio(parseJson(results?.[4]?.result, {}), config);
  return {
    config,
    status,
    open,
    history,
    stats: calculateStats(open, history),
    paper
  };
}

export async function saveProServerConfig(value) {
  const config = normalizeConfig(value);
  await redisRequest("pipeline", [["SET", CONFIG_KEY, JSON.stringify(config)]]);
  return config;
}

export async function resetPaperPortfolio() {
  const state = await getProServerState();
  const paper = createPaperPortfolio(state.config);
  await redisRequest("pipeline", [["SET", PAPER_KEY, JSON.stringify(paper)]]);
  return paper;
}

export async function runProCycle(options = {}) {
  const token = crypto.randomUUID();
  const claimed = await redisRequest("pipeline", [["SET", CYCLE_LOCK_KEY, token, "NX", "EX", 180]]);
  if (claimed?.[0]?.result !== "OK") {
    const state = await getProServerState();
    return {
      ok: true,
      busy: true,
      message: "Another scanner cycle is already running.",
      stats: state.stats,
      paper: state.paper,
      signals: [],
      events: []
    };
  }
  try {
    return await runProCycleUnlocked(options);
  } finally {
    await releaseCycleLock(token).catch(() => {});
  }
}

async function runProCycleUnlocked({ force = false } = {}) {
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
    await persistState(state.open, state.history, status, state.paper);
    return { ...status, stats: state.stats, paper: state.paper, signals: [], events: [] };
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
  const selection = chooseScanAssets(universe.assets, state.status, force, state.open);
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

  const threshold = config.quality === "A" ? 12 : 11;
  const candidates = markets
    .map((market) => buildServerSignal(market, config))
    .filter((signal) => signal && signal.score >= threshold)
    .sort((a, b) => signalPriority(b, history) - signalPriority(a, history));
  const created = selectDiverseSignals(candidates, open, history, config, monitored.reversalPairs);
  for (const signal of created) {
    open.push(signal);
    history.unshift(signal);
  }

  open = open.filter((signal) => signal.status === "OPEN").slice(0, 30);
  history = mergeHistory(history, [...created, ...monitored.updated]).slice(0, MAX_HISTORY);
  const paper = updatePaperPortfolio(state.paper, config, created, monitored.updated, marketMap);
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
    paperEquity: paper.equity,
    nextBatch: nextBatchLabel(universe.assets, selection.nextCursor),
    message: markets.length ? "Server scan completed." : "No market source responded."
  };

  const heartbeatDue = !state.status?.lastHeartbeatAt
    || Date.now() - Date.parse(state.status.lastHeartbeatAt) >= 60 * 60000;
  const telegram = await sendCycleNotifications(created, monitored.events, {
    heartbeatDue,
    assetsRead: markets.length,
    universeSize: universe.assets.length,
    openCalls: open.length
  });
  status.telegram = telegram;
  status.lastHeartbeatAt = telegram.sent > 0 ? startedAt.toISOString() : (state.status?.lastHeartbeatAt || null);
  await persistState(open, history, status, paper);
  return { ...status, stats, paper, signals: created, events: monitored.events, telegram };
}

async function releaseCycleLock(token) {
  const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  await redisRequest("pipeline", [["EVAL", script, 1, CYCLE_LOCK_KEY, token]]);
}

async function persistState(open, history, status, paper) {
  await redisRequest("pipeline", [
    ["SET", OPEN_KEY, JSON.stringify(open)],
    ["SET", HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))],
    ["SET", STATUS_KEY, JSON.stringify(status)],
    ["SET", PAPER_KEY, JSON.stringify(paper || {})]
  ]);
}

async function loadProAssetUniverse() {
  const [binanceResult, bitgetResult, capResult] = await Promise.allSettled([
    loadBinanceUniverse(),
    loadBitgetUniverse(),
    loadMarketCaps()
  ]);
  const binance = binanceResult.status === "fulfilled" ? binanceResult.value : [];
  const bitget = bitgetResult.status === "fulfilled" ? bitgetResult.value : [];
  const marketCaps = capResult.status === "fulfilled" ? capResult.value : new Map();
  const merged = new Map();
  for (const asset of [...binance, ...bitget]) {
    const existing = merged.get(asset.symbol);
    if (!existing) {
      merged.set(asset.symbol, asset);
      continue;
    }
    const prefer = existing.venue === "binance" ? existing : asset;
    const alternate = prefer === existing ? asset : existing;
    merged.set(asset.symbol, {
      ...prefer,
      quoteVolume: Math.max(Number(prefer.quoteVolume) || 0, Number(alternate.quoteVolume) || 0),
      bitgetPair: prefer.bitgetPair || alternate.bitgetPair,
      binancePair: prefer.binancePair || alternate.binancePair,
      venues: [...new Set([...(prefer.venues || [prefer.venue]), ...(alternate.venues || [alternate.venue])])]
    });
  }
  const assets = [...merged.values()]
    .map((asset) => enrichMarketCap(asset, marketCaps.get(asset.symbol)))
    .filter((asset) => asset.quoteVolume >= MIN_QUOTE_VOLUME && asset.spreadPercent <= 0.0035)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, MAX_DYNAMIC_ASSETS)
    .map((asset, index) => ({ ...asset, liquidityRank: index + 1 }));
  if (assets.length < 20) throw new Error("Not enough liquid futures markets");
  const sources = [binance.length ? "Binance" : "", bitget.length ? "Bitget" : ""].filter(Boolean).join(" + ");
  return { assets, source: `${sources || "dynamic"} USDT perpetual catalogs` };
}

async function loadBinanceUniverse() {
  const results = await Promise.allSettled([
    fetchJson("https://fapi.binance.com/fapi/v1/exchangeInfo"),
    fetchJson("https://fapi.binance.com/fapi/v1/ticker/24hr"),
    fetchJson("https://fapi.binance.com/fapi/v1/premiumIndex"),
    fetchJson("https://fapi.binance.com/fapi/v1/ticker/bookTicker")
  ]);
  const exchangeInfo = settledValue(results[0]);
  const tickers = settledValue(results[1]);
  const premiums = settledValue(results[2], []);
  const books = settledValue(results[3], []);
  if (!Array.isArray(exchangeInfo?.symbols) || !Array.isArray(tickers)) throw new Error("Binance futures catalog unavailable");
  const tickerMap = new Map(tickers.map((item) => [item.symbol, item]));
  const premiumMap = new Map((Array.isArray(premiums) ? premiums : []).map((item) => [item.symbol, item]));
  const bookMap = new Map((Array.isArray(books) ? books : []).map((item) => [item.symbol, item]));
  const now = Date.now();
  return exchangeInfo.symbols
    .filter((item) => (
      item.status === "TRADING"
      && item.contractType === "PERPETUAL"
      && item.quoteAsset === "USDT"
      && !EXCLUDED_BASE_ASSETS.has(item.baseAsset)
      && !/(UP|DOWN|BULL|BEAR)$/.test(item.baseAsset)
      && (!Number(item.onboardDate) || now - Number(item.onboardDate) >= 72 * 3600000)
    ))
    .map((item) => buildBinanceAsset(item, tickerMap.get(item.symbol), premiumMap.get(item.symbol), bookMap.get(item.symbol)))
    .filter((asset) => (
      asset
      && asset.quoteVolume >= MIN_QUOTE_VOLUME
      && asset.spreadPercent <= 0.0035
      && Number.isFinite(asset.lastPrice)
      && asset.lastPrice > 0
    ))
    .sort((a, b) => b.quoteVolume - a.quoteVolume);
}

function buildBinanceAsset(info, ticker, premium, book) {
  const contract = normalizeContractBase(info.baseAsset);
  const multiplier = contract.multiplier;
  const lastPrice = Number(ticker?.lastPrice) / multiplier;
  const bid = Number(book?.bidPrice || ticker?.bidPrice) / multiplier;
  const ask = Number(book?.askPrice || ticker?.askPrice) / multiplier;
  const midpoint = bid > 0 && ask > 0 ? (bid + ask) / 2 : lastPrice;
  const spreadPercent = midpoint > 0 && ask >= bid ? (ask - bid) / midpoint : 0.001;
  return {
    symbol: contract.symbol,
    pair: info.symbol,
    binancePair: info.symbol,
    venue: "binance",
    venues: ["binance"],
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

async function loadBitgetUniverse() {
  const [contractsResponse, tickersResponse] = await Promise.all([
    fetchJson("https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES"),
    fetchJson("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES")
  ]);
  const contracts = Array.isArray(contractsResponse?.data) ? contractsResponse.data : [];
  const tickers = Array.isArray(tickersResponse?.data) ? tickersResponse.data : [];
  if (!contracts.length || !tickers.length) throw new Error("Bitget futures catalog unavailable");
  const tickerMap = new Map(tickers.map((item) => [String(item.symbol), item]));
  return contracts
    .filter((item) => {
      const base = String(item.baseCoin || "").toUpperCase();
      const quote = String(item.quoteCoin || "").toUpperCase();
      const status = String(item.symbolStatus || item.status || "normal").toLowerCase();
      return quote === "USDT" && !EXCLUDED_BASE_ASSETS.has(base) && !/(UP|DOWN|BULL|BEAR)$/.test(base)
        && !["offline", "delisted", "suspend"].some((word) => status.includes(word));
    })
    .map((item) => buildBitgetAsset(item, tickerMap.get(String(item.symbol))))
    .filter((asset) => asset && asset.quoteVolume >= MIN_QUOTE_VOLUME && asset.spreadPercent <= 0.0035)
    .sort((a, b) => b.quoteVolume - a.quoteVolume);
}

function buildBitgetAsset(info, ticker) {
  const contract = normalizeContractBase(String(info.baseCoin || "").toUpperCase());
  const multiplier = contract.multiplier;
  const lastPrice = Number(ticker?.lastPr || ticker?.lastPrice) / multiplier;
  const bid = Number(ticker?.bidPr || ticker?.bidPrice) / multiplier;
  const ask = Number(ticker?.askPr || ticker?.askPrice) / multiplier;
  const midpoint = bid > 0 && ask > 0 ? (bid + ask) / 2 : lastPrice;
  const spreadPercent = midpoint > 0 && ask >= bid ? (ask - bid) / midpoint : 0.001;
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
  const pair = String(info.symbol || ticker?.symbol || "");
  return {
    symbol: contract.symbol,
    pair,
    bitgetPair: pair,
    venue: "bitget",
    venues: ["bitget"],
    exchangeBase: info.baseCoin,
    category: categoryForSymbol(contract.symbol),
    contractMultiplier: multiplier,
    quoteVolume: Number(ticker?.usdtVolume || ticker?.quoteVolume || ticker?.turnover24h),
    change24hSnapshot: normalizePercent(ticker?.change24h),
    lastPrice,
    markPrice: lastPrice,
    fundingRate: Number(ticker?.fundingRate || 0),
    spreadPercent
  };
}

async function loadMarketCaps() {
  try {
    const cached = await redisRequest("pipeline", [["GET", MARKET_CAP_KEY]]);
    const parsed = parseJson(cached?.[0]?.result, null);
    if (parsed?.updatedAt && Date.now() - Date.parse(parsed.updatedAt) < 6 * 3600000 && Array.isArray(parsed.items)) {
      return new Map(parsed.items.map((item) => [item.symbol, item]));
    }
  } catch {}
  const pages = await Promise.allSettled([1, 2].map((page) => fetchJson(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`
  )));
  const rows = pages.flatMap((result) => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
  const map = new Map();
  for (const row of rows) {
    const symbol = String(row.symbol || "").toUpperCase();
    if (!symbol || map.has(symbol)) continue;
    map.set(symbol, {
      symbol,
      name: row.name,
      marketCap: Number(row.market_cap) || 0,
      marketCapRank: Number(row.market_cap_rank) || null
    });
  }
  if (map.size) {
    const payload = { updatedAt: new Date().toISOString(), items: [...map.values()] };
    await redisRequest("pipeline", [["SET", MARKET_CAP_KEY, JSON.stringify(payload)], ["EXPIRE", MARKET_CAP_KEY, 21600]]).catch(() => {});
  }
  return map;
}

function enrichMarketCap(asset, cap) {
  const marketCap = Number(cap?.marketCap) || 0;
  const marketCapTier = !marketCap ? "Unknown cap"
    : marketCap < 50_000_000 ? "Micro cap"
      : marketCap < 250_000_000 ? "Small cap"
        : marketCap < 1_000_000_000 ? "Mid cap" : "Large cap";
  return { ...asset, marketCap, marketCapRank: cap?.marketCapRank || null, marketCapName: cap?.name || "", marketCapTier };
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
  if (TOKENIZED_COMMODITIES.has(symbol)) return "Tokenized commodity";
  if (TOKENIZED_EQUITIES.has(symbol)) return "Tokenized equity";
  for (const [category, symbols] of CATEGORY_GROUPS) {
    if (symbols.has(symbol)) return category;
  }
  return "Other liquid crypto";
}

function chooseScanAssets(universe, status, force, open = []) {
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
  const activeAssets = open
    .filter((signal) => signal.status === "OPEN")
    .map((signal) => universe.find((asset) => asset.symbol === signal.baseSymbol))
    .filter(Boolean);
  return {
    assets: uniqueAssets([...activeAssets, ...assets]),
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
  const paths = candlePaths(asset, "1h", 240);
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
    adx: adx(highs, lows, closes, 14),
    quoteVolume: Number(asset.quoteVolume),
    fundingRate: Number(asset.fundingRate),
    spreadPercent: Number(asset.spreadPercent),
    recentHigh,
    recentLow,
    trend
  };
}

function candlePaths(asset, interval, limit, startTime = 0) {
  const paths = [];
  const binancePair = asset.binancePair || (asset.venue !== "bitget" ? asset.pair : "");
  const bitgetPair = asset.bitgetPair || (asset.venue === "bitget" ? asset.pair : "");
  if (binancePair) {
    const start = startTime ? `&startTime=${startTime}` : "";
    paths.push(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(binancePair)}&interval=${interval}&limit=${limit}${start}`);
  }
  if (bitgetPair) {
    const granularity = interval === "5m" ? "5m" : "1H";
    const start = startTime ? `&startTime=${startTime}` : "";
    paths.push(`bitget:https://api.bitget.com/api/v2/mix/market/candles?symbol=${encodeURIComponent(bitgetPair)}&productType=USDT-FUTURES&granularity=${granularity}&limit=${limit}${start}`);
  }
  if (binancePair) {
    const start = startTime ? `&startTime=${startTime}` : "";
    paths.push(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binancePair)}&interval=${interval}&limit=${limit}${start}`);
    paths.push(`https://api.binance.us/api/v3/klines?symbol=${encodeURIComponent(binancePair)}&interval=${interval}&limit=${limit}${start}`);
  }
  return paths;
}

async function fetchFirstCandleSet(paths, minimumRows) {
  let lastError;
  for (const url of paths) {
    try {
      const isBitget = url.startsWith("bitget:");
      const value = await fetchJson(isBitget ? url.slice(7) : url);
      const rows = isBitget ? value?.data : value;
      if (!Array.isArray(rows) || rows.length < minimumRows) throw new Error("Market unavailable");
      return rows.sort((a, b) => Number(a[0]) - Number(b[0]));
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

function buildServerSignal(data, config = {}) {
  if (!Number.isFinite(data.price) || data.price <= 0 || !Number.isFinite(data.atrPercent)) return null;
  const fundingRate = Number.isFinite(data.fundingRate) ? data.fundingRate : 0;
  const executionQuality = data.quoteVolume >= MIN_QUOTE_VOLUME && data.spreadPercent <= 0.0035;
  const volumeConfirmed = Number.isFinite(data.volumeRatio) && data.volumeRatio >= MIN_VOLUME_RATIO;
  const microCap = data.marketCap > 0 && data.marketCap < 50_000_000;
  const unknownCap = !data.marketCap && !TOKENIZED_COMMODITIES.has(data.symbol) && !TOKENIZED_EQUITIES.has(data.symbol);
  const capExecutionQuality = !microCap || data.quoteVolume >= 10_000_000;
  const bullish = {
    trend: data.trend.includes("bullish"),
    higherTrend: data.higherTrend.includes("bullish"),
    ema: data.ema12 > data.ema26,
    price: data.price > data.ema12 && data.price > data.sma20,
    macd: data.macdHistogram > 0,
    rsi: data.rsi >= 45 && data.rsi <= 65 && data.higherRsi < 70,
    volume: volumeConfirmed,
    momentum: data.momentum6h > 0,
    structure: data.price >= data.recentHigh * 0.985,
    daily: data.change24h > 0,
    funding: fundingRate <= 0.0015,
    execution: executionQuality,
    strength: data.adx >= 18
  };
  const bearish = {
    trend: data.trend.includes("bearish"),
    higherTrend: data.higherTrend.includes("bearish"),
    ema: data.ema12 < data.ema26,
    price: data.price < data.ema12 && data.price < data.sma20,
    macd: data.macdHistogram < 0,
    rsi: data.rsi <= 55 && data.rsi >= 35 && data.higherRsi > 30,
    volume: volumeConfirmed,
    momentum: data.momentum6h < 0,
    structure: data.price <= data.recentLow * 1.015,
    daily: data.change24h < 0,
    funding: fundingRate >= -0.0015,
    execution: executionQuality,
    strength: data.adx >= 18
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
  if (!checks.trend || !checks.higherTrend || !checks.execution || !checks.volume || !checks.strength || !notOverextended || !capExecutionQuality) return null;
  if (microCap && score < 11) return null;
  if (unknownCap && (score < 12 || data.quoteVolume < 20_000_000)) return null;
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
    venue: data.venue,
    venues: data.venues || [data.venue].filter(Boolean),
    bitgetPair: data.bitgetPair || "",
    binancePair: data.binancePair || "",
    contractMultiplier: Number(data.contractMultiplier) || 1,
    liquidity24h: Number(data.quoteVolume) || 0,
    fundingRate: Number(data.fundingRate) || 0,
    spreadPercent: Number(data.spreadPercent) || 0,
    marketCap: Number(data.marketCap) || 0,
    marketCapRank: data.marketCapRank || null,
    marketCapTier: data.marketCapTier || "Unknown cap",
    riskFlags: [
      microCap ? "MICRO_CAP" : "",
      unknownCap ? "MARKET_CAP_UNAVAILABLE" : "",
      TOKENIZED_COMMODITIES.has(data.symbol) ? "TOKENIZED_COMMODITY" : "",
      TOKENIZED_EQUITIES.has(data.symbol) ? "TOKENIZED_EQUITY" : ""
    ].filter(Boolean),
    plannedUsd: Number(config.plannedUsd) || 25,
    leverage: Number(config.leverage) || 10,
    protectionTriggerRoe: Number(config.protectionTriggerRoe) || DEFAULT_PROTECTION_TRIGGER_ROE,
    protectionLockRoe: Number(config.protectionLockRoe) || DEFAULT_PROTECTION_LOCK_ROE,
    side,
    score,
    maxScore: 13,
    confidence: score >= 12 ? "A" : score >= 11 ? "B" : "C",
    entry,
    sl: entry * (1 - direction * atrDistance),
    tp1: entry * (1 + direction * atrDistance * 1.2),
    tp2: entry * (1 + direction * atrDistance * 2),
    tp3: entry * (1 + direction * atrDistance * 3),
    createdAt: createdAt.toISOString(),
    validUntil: new Date(createdAt.getTime() + 6 * 3600000).toISOString(),
    status: "OPEN",
    reached: [],
    reasons: [
      data.trend,
      data.higherTrend,
      `RSI ${formatNumber(data.rsi, 2)}`,
      `4h RSI ${formatNumber(data.higherRsi, 2)}`,
      `ADX ${formatNumber(data.adx, 2)}`,
      `MACD ${formatNumber(data.macdHistogram, 6)}`,
      `Volume ${formatNumber(data.volumeRatio, 2)}x`,
      `Liquidity $${formatCompact(data.quoteVolume)}`,
      `Market cap ${data.marketCap ? `$${formatCompact(data.marketCap)}` : "unavailable"}`,
      `Spread ${formatNumber(data.spreadPercent * 100, 3)}%`,
      `Funding ${formatSigned(data.fundingRate * 100)}%`,
      `ATR ${formatNumber(data.atrPercent * 100, 2)}%`,
      `6h ${formatSigned(data.momentum6h)}%`
    ],
    summary: `${side} setup confirmed on 1h and 4h. Passed: ${passed.join(", ")}. Volume, liquidity, spread, funding, momentum and volatility were checked; the red level is a suggested invalidation, not an executed stop.${unknownCap ? " Market-cap data is unavailable, so this setup passed stricter liquidity and score filters." : ""}`
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

function selectDiverseSignals(candidates, open, history, config, reversalPairs = new Set()) {
  const eligible = candidates.filter((signal) => (
    !open.some((item) => item.pair === signal.pair && item.status === "OPEN")
    && (reversalPairs.has(signal.baseSymbol) || !recentDuplicate(history, signal, Math.max(config.cooldownMinutes, 180)))
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
  const reversalPairs = new Set();
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
      touch = await fetchTouchRange(asset, signal.checkedAt || signal.createdAt);
    } catch {
      const market = marketMap.get(signal.baseSymbol);
      if (market) touch = { candles: [{ high: market.price, low: market.price, close: market.price }] };
    }
    if (!touch) continue;
    const long = signal.side === "LONG";
    const direction = long ? 1 : -1;
    const leverage = clamp(Number(signal.leverage) || 10, 1, 50);
    const triggerMove = clamp(Number(signal.protectionTriggerRoe) || DEFAULT_PROTECTION_TRIGGER_ROE, 0.5, 50) / 100 / leverage;
    const lockMove = clamp(Number(signal.protectionLockRoe) || DEFAULT_PROTECTION_LOCK_ROE, 0.1, 40) / 100 / leverage;
    for (const candle of touch.candles) {
      const targetTouches = [
        ["TP1", long ? candle.high >= signal.tp1 : candle.low <= signal.tp1],
        ["TP2", long ? candle.high >= signal.tp2 : candle.low <= signal.tp2],
        ["TP3", long ? candle.high >= signal.tp3 : candle.low <= signal.tp3]
      ];
      const invalidationTouched = long ? candle.low <= signal.sl : candle.high >= signal.sl;
      const newTargetTouched = targetTouches.some(([name, touched]) => touched && !signal.reached.includes(name));
      const protectionTouched = signal.protectionActive && signal.protectedPrice
        ? (long ? candle.low <= signal.protectedPrice : candle.high >= signal.protectedPrice)
        : false;

      if (protectionTouched) {
        signal.status = "PROTECTED_WIN";
        signal.closedAt = new Date().toISOString();
        signal.closePrice = signal.protectedPrice;
        events.push({ type: "PROFIT_LOCKED", signal: { ...signal } });
        break;
      }

      if (invalidationTouched && newTargetTouched && !signal.reached.length) {
        signal.status = "AMBIGUOUS";
        signal.closedAt = new Date().toISOString();
        signal.closePrice = candle.close;
        events.push({ type: "AMBIGUOUS", signal: { ...signal } });
        break;
      }

      if (invalidationTouched) {
        signal.status = signal.reached.includes("TP1") ? "PARTIAL_WIN" : "INVALIDATED";
        signal.closedAt = new Date().toISOString();
        signal.closePrice = signal.sl;
        events.push({ type: signal.status === "PARTIAL_WIN" ? "PARTIAL_WIN" : "INVALIDATED", signal: { ...signal } });
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
      const favorableExtreme = long ? candle.high : candle.low;
      const favorableMove = ((favorableExtreme - signal.entry) / signal.entry) * direction;
      if (!signal.protectionActive && (favorableMove >= triggerMove || signal.reached.includes("TP1"))) {
        signal.protectionActive = true;
        signal.protectedPrice = signal.entry * (1 + direction * lockMove);
        signal.protectionActivatedAt = new Date().toISOString();
        events.push({ type: "SECURE", signal: { ...signal } });
      }
      signal.lastPrice = candle.close;
    }
    const market = marketMap.get(signal.baseSymbol);
    if (signal.status === "OPEN" && market && isConfirmedReversal(signal.side, market)) {
      const directionalMove = ((market.price - signal.entry) / signal.entry) * direction;
      signal.status = directionalMove > 0 || signal.reached.includes("TP1") ? "PROTECTED_WIN" : "REVERSAL";
      signal.closedAt = new Date().toISOString();
      signal.closePrice = market.price;
      signal.reversalSide = signal.side === "LONG" ? "SHORT" : "LONG";
      events.push({ type: directionalMove > 0 ? "REVERSAL_PROFIT" : "REVERSAL", signal: { ...signal } });
      reversalPairs.add(signal.baseSymbol);
    }
    if (signal.status === "OPEN" && Date.now() - Date.parse(signal.createdAt) > MAX_SIGNAL_AGE_MS) {
      signal.status = signal.reached.includes("TP1") ? "PARTIAL_WIN" : "STALE";
      signal.closedAt = new Date().toISOString();
      signal.closePrice = Number(signal.lastPrice) || Number(market?.price) || signal.entry;
    }
    signal.checkedAt = new Date().toISOString();
    updated.push(signal);
  }
  const updatedMap = new Map(updated.map((signal) => [signal.id, signal]));
  return {
    open: open.map((signal) => updatedMap.get(signal.id) || signal).filter((signal) => signal.status === "OPEN"),
    updated,
    events,
    reversalPairs
  };
}

function isConfirmedReversal(side, market) {
  const opposite = side === "LONG" ? "bearish" : "bullish";
  const emaOpposite = side === "LONG" ? market.ema12 < market.ema26 : market.ema12 > market.ema26;
  const macdOpposite = side === "LONG" ? market.macdHistogram < 0 : market.macdHistogram > 0;
  return market.trend.includes(opposite) && market.higherTrend.includes(opposite) && emaOpposite && macdOpposite;
}

async function fetchTouchRange(asset, createdAt) {
  const start = Math.max(Date.now() - 2 * 3600000, Date.parse(createdAt) - 60000);
  const rows = await fetchFirstCandleSet(candlePaths(asset, "5m", 30, start), 1);
  const multiplier = Number(asset.contractMultiplier) || 1;
  const relevant = rows.filter((row) => (
    (Number(row[6]) || Number(row[0])) >= Date.parse(createdAt)
  ));
  const candles = relevant;
  return {
    candles: candles.map((row) => ({
      high: Number(row[2]) / multiplier,
      low: Number(row[3]) / multiplier,
      close: Number(row[4]) / multiplier,
      closeTime: Number(row[6]) || Number(row[0])
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

function createPaperPortfolio(config) {
  const startingBalance = clamp(Number(config?.paperStartingBalance) || 1000, 100, 1_000_000);
  return {
    enabled: config?.paperEnabled !== false,
    startingBalance,
    balance: startingBalance,
    equity: startingBalance,
    realizedPnl: 0,
    unrealizedPnl: 0,
    maxDrawdownPercent: 0,
    open: [],
    closed: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizePaperPortfolio(value, config) {
  const fallback = createPaperPortfolio(config);
  if (!value || !Array.isArray(value.open) || !Array.isArray(value.closed)) return fallback;
  return {
    ...fallback,
    ...value,
    enabled: config?.paperEnabled !== false,
    startingBalance: clamp(Number(value.startingBalance) || fallback.startingBalance, 100, 1_000_000),
    open: value.open.filter((item) => item?.signalId && item?.symbol).slice(0, 50),
    closed: value.closed.filter((item) => item?.signalId && item?.symbol).slice(0, 250)
  };
}

function updatePaperPortfolio(current, config, created, updatedSignals, marketMap) {
  const paper = normalizePaperPortfolio(current, config);
  paper.enabled = config.paperEnabled !== false;
  if (!paper.enabled) {
    paper.updatedAt = new Date().toISOString();
    return recalculatePaperPortfolio(paper, marketMap);
  }

  const activeMargin = paper.open.reduce((sum, item) => sum + (Number(item.marginUsd) || 0), 0);
  let availableMargin = Math.max(0, paper.balance - activeMargin);
  for (const signal of created) {
    if (paper.open.some((item) => item.signalId === signal.id || item.symbol === signal.symbol)) continue;
    const leverage = clamp(Number(signal.leverage) || config.leverage, 1, 50);
    const stopDistance = Math.abs((Number(signal.sl) - Number(signal.entry)) / Number(signal.entry));
    if (!Number.isFinite(stopDistance) || stopDistance <= 0) continue;
    const riskPercent = clamp(Number(config.paperRiskPercent) || 0.5, 0.1, 5);
    const riskBudgetUsd = Math.max(0, Number(paper.equity || paper.balance) * riskPercent / 100);
    const maxNotionalByRisk = riskBudgetUsd / stopDistance;
    const requestedMargin = Number(signal.plannedUsd) || config.plannedUsd;
    const marginUsd = Math.min(requestedMargin, maxNotionalByRisk / leverage, availableMargin);
    if (marginUsd < 5) continue;
    const notionalUsd = marginUsd * leverage;
    paper.open.push({
      signalId: signal.id,
      symbol: signal.symbol,
      pair: signal.pair,
      side: signal.side,
      entry: signal.entry,
      currentPrice: signal.entry,
      marginUsd,
      leverage,
      notionalUsd,
      riskPercent,
      estimatedRiskUsd: roundMoney(notionalUsd * stopDistance),
      openedAt: signal.createdAt,
      status: "OPEN",
      reached: []
    });
    availableMargin -= marginUsd;
  }

  const signalMap = new Map(updatedSignals.map((signal) => [signal.id, signal]));
  const stillOpen = [];
  for (const position of paper.open) {
    const signal = signalMap.get(position.signalId);
    const market = marketMap.get(String(position.symbol).split("/")[0]);
    const currentPrice = Number(signal?.closePrice || signal?.lastPrice || market?.price || position.currentPrice || position.entry);
    const next = {
      ...position,
      currentPrice: Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : position.entry,
      reached: signal?.reached || position.reached || [],
      signalStatus: signal?.status || position.signalStatus || "OPEN"
    };
    if (signal && signal.status !== "OPEN") {
      const closed = closePaperPosition(next, signal);
      paper.closed.unshift(closed);
    } else {
      stillOpen.push(next);
    }
  }
  paper.open = stillOpen.slice(0, 50);
  paper.closed = paper.closed.slice(0, 250);
  paper.updatedAt = new Date().toISOString();
  return recalculatePaperPortfolio(paper, marketMap);
}

function closePaperPosition(position, signal) {
  const exitPrice = Number(signal.closePrice || position.currentPrice || position.entry);
  const direction = position.side === "LONG" ? 1 : -1;
  const grossPnl = position.notionalUsd * ((exitPrice - position.entry) / position.entry) * direction;
  const estimatedFees = position.notionalUsd * 0.0012;
  return {
    ...position,
    exitPrice,
    closedAt: signal.closedAt || new Date().toISOString(),
    status: signal.status,
    grossPnl: roundMoney(grossPnl),
    estimatedFees: roundMoney(estimatedFees),
    netPnl: roundMoney(grossPnl - estimatedFees),
    roePercent: roundMoney(((grossPnl - estimatedFees) / position.marginUsd) * 100)
  };
}

function recalculatePaperPortfolio(paper, marketMap) {
  const realizedPnl = paper.closed.reduce((sum, item) => sum + (Number(item.netPnl) || 0), 0);
  let unrealizedPnl = 0;
  paper.open = paper.open.map((position) => {
    const market = marketMap?.get(String(position.symbol).split("/")[0]);
    const currentPrice = Number(market?.price || position.currentPrice || position.entry);
    const direction = position.side === "LONG" ? 1 : -1;
    const gross = position.notionalUsd * ((currentPrice - position.entry) / position.entry) * direction;
    const estimatedFees = position.notionalUsd * 0.0012;
    const net = gross - estimatedFees;
    unrealizedPnl += net;
    return { ...position, currentPrice, unrealizedPnl: roundMoney(net), roePercent: roundMoney((net / position.marginUsd) * 100) };
  });
  paper.realizedPnl = roundMoney(realizedPnl);
  paper.unrealizedPnl = roundMoney(unrealizedPnl);
  paper.balance = roundMoney(paper.startingBalance + realizedPnl);
  paper.equity = roundMoney(paper.balance + unrealizedPnl);
  paper.maxDrawdownPercent = calculatePaperDrawdown(paper.startingBalance, [...paper.closed].reverse());
  paper.trades = paper.closed.length;
  paper.wins = paper.closed.filter((item) => Number(item.netPnl) > 0).length;
  paper.losses = paper.closed.filter((item) => Number(item.netPnl) < 0).length;
  paper.winRate = paper.trades ? roundMoney((paper.wins / paper.trades) * 100) : 0;
  return paper;
}

function calculatePaperDrawdown(startingBalance, trades) {
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity += Number(trade.netPnl) || 0;
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  }
  return roundMoney(maxDrawdown);
}

function roundMoney(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function calculateStats(open, history) {
  const tpSuccesses = history.filter((signal) => signal.reached?.includes("TP1")).length;
  const closedWins = history.filter((signal) => ["WIN", "PROTECTED_WIN", "PARTIAL_WIN"].includes(signal.status)).length;
  const invalidated = history.filter((signal) => (
    ["INVALIDATED", "REVERSAL", "SL"].includes(signal.status)
    && !signal.reached?.includes("TP1")
  )).length;
  const ambiguous = history.filter((signal) => signal.status === "AMBIGUOUS").length;
  const protectedWins = history.filter((signal) => signal.status === "PROTECTED_WIN").length;
  const stale = history.filter((signal) => signal.status === "STALE").length;
  const decided = closedWins + invalidated;
  return {
    open: open.length,
    total: history.length,
    wins: tpSuccesses,
    closedWins,
    losses: invalidated,
    invalidated,
    ambiguous,
    protectedWins,
    stale,
    decided,
    tp1: tpSuccesses,
    winRate: decided ? Number(((closedWins / decided) * 100).toFixed(1)) : 0
  };
}

async function sendCycleNotifications(signals, events, context = {}) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    return { configured: false, attempted: 0, sent: 0, errors: 0, heartbeatSent: false };
  }
  let attempted = 0;
  let sent = 0;
  let errors = 0;
  let heartbeatSent = false;
  for (const signal of signals) {
    const dedupKey = notificationKey("signal", signal.id);
    if (!await claimNotification(dedupKey)) continue;
    attempted += 1;
    try {
      await sendTelegram(token, chatId, formatSignalMessage(signal));
      sent += 1;
    } catch {
      await releaseNotification(dedupKey).catch(() => {});
      errors += 1;
    }
  }
  for (const event of events) {
    if (["STALE", "EXPIRED", "SL"].includes(event.type)) continue;
    const dedupKey = notificationKey(event.type, event.signal?.id);
    if (!await claimNotification(dedupKey)) continue;
    attempted += 1;
    try {
      await sendTelegram(token, chatId, formatEventMessage(event));
      sent += 1;
    } catch {
      await releaseNotification(dedupKey).catch(() => {});
      errors += 1;
    }
  }
  if (!attempted && context.heartbeatDue) {
    attempted += 1;
    try {
      await sendTelegram(token, chatId, formatHeartbeatMessage(context));
      sent += 1;
      heartbeatSent = true;
    } catch {
      errors += 1;
    }
  }
  return { configured: true, attempted, sent, errors, heartbeatSent };
}

function notificationKey(kind, id) {
  const safe = `${kind}:${id || "unknown"}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 180);
  return `${TELEGRAM_DEDUP_PREFIX}:${safe}`;
}

async function claimNotification(key) {
  const result = await redisRequest("pipeline", [["SET", key, "1", "NX", "EX", 2592000]]);
  return result?.[0]?.result === "OK";
}

async function releaseNotification(key) {
  await redisRequest("pipeline", [["DEL", key]]);
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
  const lowCapWarning = signal.marketCap > 0 && signal.marketCap < 250_000_000
    ? `\u{26A0}\u{FE0F} <b>${signal.marketCap < 50_000_000 ? "MICRO CAP" : "SMALL CAP"}:</b> extra volatility and slippage risk.`
    : "";
  const unknownCapWarning = signal.riskFlags?.includes("MARKET_CAP_UNAVAILABLE")
    ? "\u{26A0}\u{FE0F} Market cap unavailable; stricter liquidity filters were required."
    : "";
  const technical = (signal.reasons || [])
    .filter((reason) => /^(RSI|4h RSI|ADX|Volume|Spread|Funding|ATR|6h)/.test(reason))
    .slice(0, 6)
    .join(" | ");
  return [
    `\u{1F680} <b>JamdDmaj Pro Signal</b>`,
    `${direction} <b>${escapeHtml(signal.symbol)} | ${signal.side}</b>`,
    `\u{1F3F7}\u{FE0F} ${escapeHtml(signal.category)} | ${signal.confidence} ${signal.score}/${signal.maxScore}`,
    `\u{1F3DB}\u{FE0F} Venue: ${escapeHtml((signal.venues || [signal.venue]).filter(Boolean).join(" + ") || "available exchange")}`,
    `\u{1F4CA} Market cap: ${signal.marketCap ? `$${formatCompact(signal.marketCap)}${signal.marketCapRank ? ` (#${signal.marketCapRank})` : ""}` : "unavailable"}`,
    `\u{1F4B5} Plan: $${formatNumber(signal.plannedUsd, 2)} at ${formatNumber(signal.leverage, 0)}x leverage (not executed)`,
    `\u{1F3AF} <b>Entry:</b> <code>${formatPrice(signal.entry)}</code>`,
    `\u{2705} <b>TP:</b> <code>${formatPrice(signal.tp1)}</code> | <code>${formatPrice(signal.tp2)}</code> | <code>${formatPrice(signal.tp3)}</code>`,
    `\u{1F6A7} Suggested invalidation: <code>${formatPrice(signal.sl)}</code>`,
    `\u{1F50E} Monitoring window: ${formatDate(signal.validUntil)}`,
    lowCapWarning,
    unknownCapWarning,
    technical ? `\u{1F9E0} <b>Technical:</b> ${escapeHtml(technical)}` : "",
    "\u{26A0}\u{FE0F} Educational monitoring only; no automatic order."
  ].filter(Boolean).join("\n");
}

function formatEventMessage(event) {
  const labels = {
    TP1: "\u{2705} TP1 reached",
    TP2: "\u{2705}\u{2705} TP2 reached",
    TP3: "\u{1F3C6} TP3 reached - call completed",
    SECURE: "\u{1F512} Profit protection suggested",
    PROFIT_LOCKED: "\u{1F4B0} Protected level reached in profit",
    REVERSAL_PROFIT: "\u{1F504} Trend reversed while the call was profitable",
    REVERSAL: "\u{1F504} Confirmed trend reversal",
    INVALIDATED: "\u{1F6A7} Suggested invalidation reached",
    PARTIAL_WIN: "\u{1F4B5} Monitoring closed after partial targets",
    AMBIGUOUS: "\u{26AA} Ambiguous candle - excluded from statistics"
  };
  const signal = event.signal;
  const elapsed = Math.max(0, Date.now() - Date.parse(signal.createdAt));
  return [
    `<b>${labels[event.type] || escapeHtml(event.type)}</b>`,
    `${escapeHtml(signal.symbol)} | ${signal.side}`,
    `Created: ${formatDate(signal.createdAt)}`,
    `Elapsed: ${formatDuration(elapsed)}`,
    `Entry: <code>${formatPrice(signal.entry)}</code>`,
    event.type === "SECURE" || event.type === "PROFIT_LOCKED"
      ? `Suggested protected level: <code>${formatPrice(signal.protectedPrice)}</code> (about +${formatNumber(signal.protectionLockRoe || DEFAULT_PROTECTION_LOCK_ROE, 1)}% ROE at ${formatNumber(signal.leverage || 10, 0)}x before fees)`
      : "",
    event.type === "REVERSAL" || event.type === "REVERSAL_PROFIT"
      ? `New confirmed bias: <b>${escapeHtml(signal.reversalSide)}</b>. Re-evaluate; the scanner may issue a new opposite setup if all filters pass.`
      : ""
  ].filter(Boolean).join("\n");
}

function formatHeartbeatMessage(context) {
  return [
    "\u{1F7E2} <b>JamdDmaj Pro 24/7 active</b>",
    `\u{1F50E} Last cycle: ${Number(context.assetsRead) || 0}/${Number(context.universeSize) || 0} markets analyzed`,
    `\u{1F4C2} Open calls monitored: ${Number(context.openCalls) || 0}`,
    "No new setup passed every quality filter in this cycle. The server continues without the app open."
  ].join("\n");
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "JamdDmaj-Pro-Scanner/1.31" }
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
  const protectionTriggerRoe = clamp(Number(value?.protectionTriggerRoe) || DEFAULT_PROTECTION_TRIGGER_ROE, 0.5, 50);
  const protectionLockRoe = clamp(
    Number(value?.protectionLockRoe) || DEFAULT_PROTECTION_LOCK_ROE,
    0.1,
    Math.max(0.1, protectionTriggerRoe - 0.1)
  );
  return {
    enabled: value?.enabled === true,
    quality: value?.quality === "AB" ? "AB" : "A",
    cooldownMinutes: clamp(Number(value?.cooldownMinutes) || 90, 15, 360),
    maxSignalsPerRun: clamp(Math.round(Number(value?.maxSignalsPerRun) || 3), 1, 6),
    plannedUsd: clamp(Number(value?.plannedUsd) || 25, 5, 100000),
    leverage: clamp(Math.round(Number(value?.leverage) || 10), 1, 50),
    protectionTriggerRoe,
    protectionLockRoe,
    paperEnabled: value?.paperEnabled !== false,
    paperStartingBalance: clamp(Number(value?.paperStartingBalance) || 1000, 100, 1_000_000),
    paperRiskPercent: clamp(Number(value?.paperRiskPercent) || 0.5, 0.1, 5)
  };
}

function settledValue(result, fallback = null) {
  return result?.status === "fulfilled" ? result.value : fallback;
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.abs(number) <= 1 ? number * 100 : number;
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

function adx(highs, lows, closes, period) {
  if (highs.length < period * 2 + 1 || lows.length !== highs.length || closes.length !== highs.length) return NaN;
  const trueRanges = [];
  const plusMoves = [];
  const minusMoves = [];
  for (let index = 1; index < highs.length; index += 1) {
    trueRanges.push(Math.max(
      highs[index] - lows[index],
      Math.abs(highs[index] - closes[index - 1]),
      Math.abs(lows[index] - closes[index - 1])
    ));
    const upMove = highs[index] - highs[index - 1];
    const downMove = lows[index - 1] - lows[index];
    plusMoves.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusMoves.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  let smoothedTr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0);
  let smoothedPlus = plusMoves.slice(0, period).reduce((sum, value) => sum + value, 0);
  let smoothedMinus = minusMoves.slice(0, period).reduce((sum, value) => sum + value, 0);
  const dxValues = [];
  for (let index = period; index < trueRanges.length; index += 1) {
    smoothedTr = smoothedTr - (smoothedTr / period) + trueRanges[index];
    smoothedPlus = smoothedPlus - (smoothedPlus / period) + plusMoves[index];
    smoothedMinus = smoothedMinus - (smoothedMinus / period) + minusMoves[index];
    const plusDi = smoothedTr ? (100 * smoothedPlus) / smoothedTr : 0;
    const minusDi = smoothedTr ? (100 * smoothedMinus) / smoothedTr : 0;
    const denominator = plusDi + minusDi;
    dxValues.push(denominator ? (100 * Math.abs(plusDi - minusDi)) / denominator : 0);
  }
  return sma(dxValues, period);
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
