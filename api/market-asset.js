import { corsHeaders, jsonResponse } from "../lib/server.js";

export const config = { runtime: "edge" };

const FETCH_TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const INTERVALS = { "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" };
const DEX_INTERVALS = {
  "15m": { unit: "minute", aggregate: 15 },
  "1h": { unit: "hour", aggregate: 1 },
  "4h": { unit: "hour", aggregate: 4 },
  "1d": { unit: "day", aggregate: 1 }
};
const cache = new Map();

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET") return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);

  const url = new URL(request.url);
  const symbol = cleanSymbol(url.searchParams.get("symbol"));
  const coinId = cleanCoinId(url.searchParams.get("coinId"));
  const name = cleanText(url.searchParams.get("name"), 60) || symbol;
  const source = url.searchParams.get("source") === "dex" ? "dex" : "bitget";
  const chainId = cleanIdentifier(url.searchParams.get("chainId"));
  const tokenAddress = cleanAddress(url.searchParams.get("tokenAddress"));
  const pairAddress = cleanAddress(url.searchParams.get("pairAddress"));
  const timeframe = INTERVALS[url.searchParams.get("timeframe")] ? url.searchParams.get("timeframe") : "1h";
  if (!symbol || (source === "dex" && (!chainId || !tokenAddress || !pairAddress))) {
    return jsonResponse(request, { error: { message: "Valid internal market identifiers are required." } }, 400);
  }

  const cacheKey = `${source}:${symbol}:${coinId}:${chainId}:${tokenAddress}:${pairAddress}:${timeframe}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return jsonResponse(request, cached.payload, 200, cacheHeaders());
  }

  if (source === "dex") {
    return handleDexAsset(request, { symbol, name, chainId, tokenAddress, pairAddress, timeframe, cacheKey });
  }

  const bitgetSymbol = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
  const [candlesResult, tickerResult, metadataResult, newsResult] = await Promise.allSettled([
    fetchBitgetCandles(bitgetSymbol, INTERVALS[timeframe]),
    fetchBitgetTicker(bitgetSymbol),
    coinId ? fetchCoinMetadata(coinId) : Promise.resolve(null),
    fetchAssetNews(name, symbol)
  ]);
  const candles = candlesResult.status === "fulfilled" ? candlesResult.value : [];
  const ticker = tickerResult.status === "fulfilled" ? tickerResult.value : null;
  const metadata = metadataResult.status === "fulfilled" ? metadataResult.value : null;
  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  if (!candles.length && !ticker && !metadata) {
    return jsonResponse(request, { error: { message: "Market data is temporarily unavailable." } }, 502);
  }

  const payload = {
    ok: true,
    updatedAt: new Date().toISOString(),
    asset: {
      symbol,
      name: metadata?.name || name,
      coinId: coinId || null,
      source: "bitget",
      image: metadata?.image || "",
      categories: metadata?.categories || []
    },
    timeframe,
    candles,
    ticker,
    metrics: metadata?.metrics || null,
    trend: analyzeTrend(candles),
    news,
    sources: {
      chart: candles.length ? "Bitget public USDT futures candles" : null,
      metrics: metadata ? "CoinGecko public market data" : null,
      news: news.length ? (news[0].source || "Recent public news index") : null
    },
    partial: candlesResult.status !== "fulfilled" || tickerResult.status !== "fulfilled" || metadataResult.status !== "fulfilled" || newsResult.status !== "fulfilled"
  };
  cache.set(cacheKey, { savedAt: Date.now(), payload });
  return jsonResponse(request, payload, 200, cacheHeaders());
}

async function handleDexAsset(request, identifiers) {
  const { symbol, name, chainId, tokenAddress, pairAddress, timeframe, cacheKey } = identifiers;
  const [pairResult, candlesResult, newsResult] = await Promise.allSettled([
    fetchDexPair(chainId, pairAddress, tokenAddress),
    fetchDexCandles(chainId, pairAddress, timeframe),
    fetchAssetNews(name, symbol)
  ]);
  const pair = pairResult.status === "fulfilled" ? pairResult.value : null;
  const candles = candlesResult.status === "fulfilled" ? candlesResult.value : [];
  const news = newsResult.status === "fulfilled" ? newsResult.value : [];
  if (!pair && !candles.length) return jsonResponse(request, { error: { message: "DEX market data is temporarily unavailable." } }, 502);
  const highLow = calculate24hHighLow(candles);
  const ticker = {
    price: pair?.price || candles.at(-1)?.close || 0,
    change24h: pair?.change24h ?? null,
    high24h: highLow.high,
    low24h: highLow.low,
    volume24h: pair?.volume24h || 0,
    openInterest: null,
    fundingRate: null
  };
  const payload = {
    ok: true,
    updatedAt: new Date().toISOString(),
    asset: {
      symbol,
      name: pair?.name || name,
      coinId: null,
      source: "dex",
      chainId,
      tokenAddress,
      pairAddress,
      image: pair?.image || "",
      categories: [chainId.toUpperCase(), "DEX"]
    },
    timeframe,
    candles,
    ticker,
    metrics: {
      marketCap: pair?.marketCap || 0,
      fullyDilutedValuation: pair?.fdv || 0,
      volume24h: pair?.volume24h || 0,
      circulatingSupply: 0,
      totalSupply: 0,
      maxSupply: 0,
      marketCapRank: null,
      liquidityUsd: pair?.liquidityUsd || 0,
      transactions24h: pair?.transactions24h || 0,
      buys24h: pair?.buys24h || 0,
      sells24h: pair?.sells24h || 0,
      pairCreatedAt: pair?.pairCreatedAt || null,
      change24h: pair?.change24h ?? null
    },
    trend: analyzeTrend(candles),
    news,
    sources: {
      chart: candles.length ? "GeckoTerminal public pool candles" : null,
      metrics: pair ? "DEX Screener public pair data" : null,
      news: news.length ? (news[0].source || "Recent public news index") : null
    },
    partial: pairResult.status !== "fulfilled" || candlesResult.status !== "fulfilled" || newsResult.status !== "fulfilled"
  };
  cache.set(cacheKey, { savedAt: Date.now(), payload });
  return jsonResponse(request, payload, 200, cacheHeaders());
}

async function fetchDexPair(chainId, pairAddress, tokenAddress) {
  const data = await fetchJson(`https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}`);
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  const pair = pairs.find((item) => String(item.baseToken?.address || "").toLowerCase() === tokenAddress.toLowerCase()) || pairs[0];
  if (!pair) throw new Error("DEX pair was invalid.");
  return {
    name: cleanText(pair.baseToken?.name, 60),
    price: finiteNumber(pair.priceUsd),
    change24h: finiteNumber(pair.priceChange?.h24),
    volume24h: finiteNumber(pair.volume?.h24),
    liquidityUsd: finiteNumber(pair.liquidity?.usd),
    marketCap: finiteNumber(pair.marketCap),
    fdv: finiteNumber(pair.fdv),
    transactions24h: finiteNumber(pair.txns?.h24?.buys) + finiteNumber(pair.txns?.h24?.sells),
    buys24h: finiteNumber(pair.txns?.h24?.buys),
    sells24h: finiteNumber(pair.txns?.h24?.sells),
    pairCreatedAt: validIsoDate(finiteNumber(pair.pairCreatedAt)),
    image: safeHttpsUrl(pair.info?.imageUrl)
  };
}

async function fetchDexCandles(chainId, pairAddress, timeframe) {
  const interval = DEX_INTERVALS[timeframe] || DEX_INTERVALS["1h"];
  const data = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(chainId)}/pools/${encodeURIComponent(pairAddress)}/ohlcv/${interval.unit}?aggregate=${interval.aggregate}&limit=100&currency=usd&token=base`);
  const rows = data?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error("DEX candles were invalid.");
  return rows.map((row) => ({
    time: finiteNumber(row?.[0]) * 1000,
    open: finiteNumber(row?.[1]),
    high: finiteNumber(row?.[2]),
    low: finiteNumber(row?.[3]),
    close: finiteNumber(row?.[4]),
    volume: finiteNumber(row?.[5]),
    turnover: finiteNumber(row?.[5])
  })).filter((item) => item.time > 0 && item.open > 0 && item.high > 0 && item.low > 0 && item.close > 0)
    .sort((left, right) => left.time - right.time);
}

function calculate24hHighLow(candles) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = candles.filter((item) => item.time >= cutoff);
  const points = recent.length ? recent : candles.slice(-1);
  return {
    high: points.length ? Math.max(...points.map((item) => item.high)) : 0,
    low: points.length ? Math.min(...points.map((item) => item.low)) : 0
  };
}

async function fetchBitgetCandles(symbol, interval) {
  const data = await fetchJson(`https://api.bitget.com/api/v3/market/candles?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&type=MARKET&limit=100`);
  if (data?.code !== "00000" || !Array.isArray(data.data)) throw new Error("Bitget candles were invalid.");
  return data.data.map((row) => ({
    time: finiteNumber(row?.[0]),
    open: finiteNumber(row?.[1]),
    high: finiteNumber(row?.[2]),
    low: finiteNumber(row?.[3]),
    close: finiteNumber(row?.[4]),
    volume: finiteNumber(row?.[5]),
    turnover: finiteNumber(row?.[6])
  })).filter((item) => item.time > 0 && item.open > 0 && item.high > 0 && item.low > 0 && item.close > 0)
    .sort((left, right) => left.time - right.time);
}

async function fetchBitgetTicker(symbol) {
  const data = await fetchJson(`https://api.bitget.com/api/v3/market/tickers?category=USDT-FUTURES&symbol=${encodeURIComponent(symbol)}`);
  if (data?.code !== "00000" || !Array.isArray(data.data) || !data.data[0]) throw new Error("Bitget ticker was invalid.");
  const item = data.data[0];
  return {
    price: finiteNumber(item.lastPrice),
    change24h: finiteNumber(item.price24hPcnt) * 100,
    high24h: finiteNumber(item.highPrice24h),
    low24h: finiteNumber(item.lowPrice24h),
    volume24h: finiteNumber(item.turnover24h),
    openInterest: finiteNumber(item.openInterest),
    fundingRate: finiteNumber(item.fundingRate)
  };
}

async function fetchCoinMetadata(coinId) {
  const data = await fetchJson(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
  const market = data?.market_data || {};
  return {
    name: cleanText(data?.name, 60),
    image: safeHttpsUrl(data?.image?.small),
    categories: Array.isArray(data?.categories) ? data.categories.map((item) => cleanText(item, 50)).filter(Boolean).slice(0, 5) : [],
    metrics: {
      marketCap: finiteNumber(market.market_cap?.usd),
      fullyDilutedValuation: finiteNumber(market.fully_diluted_valuation?.usd),
      volume24h: finiteNumber(market.total_volume?.usd),
      circulatingSupply: finiteNumber(market.circulating_supply),
      totalSupply: finiteNumber(market.total_supply),
      maxSupply: finiteNumber(market.max_supply),
      marketCapRank: finiteNumber(data?.market_cap_rank) || null,
      ath: finiteNumber(market.ath?.usd),
      athChange: finiteNumber(market.ath_change_percentage?.usd),
      change24h: finiteNumber(market.price_change_percentage_24h),
      change7d: finiteNumber(market.price_change_percentage_7d),
      change30d: finiteNumber(market.price_change_percentage_30d),
      lastUpdated: validIsoDate(data?.last_updated)
    }
  };
}

async function fetchAssetNews(name, symbol) {
  try {
    const rss = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(`${name} ${symbol} crypto`)}&hl=en-US&gl=US&ceid=US:en`);
    const items = parseGoogleNewsRss(rss);
    if (items.length) return items;
  } catch {}
  const exactName = String(name || symbol).replace(/["()]/g, " ").trim();
  const query = `("${exactName}" OR "${symbol}") (crypto OR token OR blockchain OR market)`;
  const data = await fetchJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=16&format=json&sort=HybridRel&timespan=7d`);
  if (!Array.isArray(data?.articles)) return [];
  const seen = new Set();
  return data.articles.map((article) => ({
    title: cleanText(article?.title, 180),
    url: safeArticleUrl(article?.url),
    domain: cleanText(article?.domain, 80),
    publishedAt: parseGdeltDate(article?.seendate),
    language: cleanText(article?.language, 24),
    source: "GDELT recent article index"
  })).filter((article) => article.title && article.url && !seen.has(article.url) && seen.add(article.url)).slice(0, 10);
}

function parseGoogleNewsRss(xml) {
  const items = String(xml || "").match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.map((item) => {
    const title = decodeXml(readXmlTag(item, "title"));
    const url = safeGoogleNewsUrl(decodeXml(readXmlTag(item, "link")));
    const publishedAt = validIsoDate(decodeXml(readXmlTag(item, "pubDate")));
    const source = decodeXml(readXmlTag(item, "source"));
    return {
      title: cleanText(title, 180),
      url,
      domain: cleanText(source || "Google News", 80),
      publishedAt,
      language: "English",
      source: "Google News RSS"
    };
  }).filter((article) => article.title && article.url).slice(0, 10);
}

function readXmlTag(value, tag) {
  const match = String(value || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
  return match?.[1] || "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function safeGoogleNewsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && /(^|\.)news\.google\.com$/i.test(url.hostname) ? url.href : "";
  } catch { return ""; }
}

export function analyzeTrend(candles) {
  const closes = Array.isArray(candles) ? candles.map((item) => finiteNumber(item.close)).filter((value) => value > 0) : [];
  if (closes.length < 20) return { direction: "insufficient", confidence: 0, change: 0, rsi: null, sma20: null, sma50: null, volatility: null, reasons: [] };
  const sma20 = average(closes.slice(-20));
  const sma50 = average(closes.slice(-Math.min(50, closes.length)));
  const last = closes.at(-1);
  const start = closes[Math.max(0, closes.length - 21)];
  const change = start ? ((last / start) - 1) * 100 : 0;
  const rsi = calculateRsi(closes, 14);
  const returns = closes.slice(1).map((value, index) => ((value / closes[index]) - 1) * 100).slice(-20);
  const volatility = Math.sqrt(average(returns.map((value) => value ** 2)));
  let score = 0;
  const reasons = [];
  if (last > sma20) { score += 1; reasons.push("priceAboveSma20"); } else { score -= 1; reasons.push("priceBelowSma20"); }
  if (sma20 > sma50) { score += 1; reasons.push("sma20AboveSma50"); } else { score -= 1; reasons.push("sma20BelowSma50"); }
  if (change > 1) { score += 1; reasons.push("positiveMomentum"); } else if (change < -1) { score -= 1; reasons.push("negativeMomentum"); }
  if (rsi >= 70) reasons.push("overbought");
  if (rsi <= 30) reasons.push("oversold");
  const direction = score >= 2 ? "bullish" : score <= -2 ? "bearish" : "mixed";
  const confidence = Math.min(82, Math.round(45 + Math.abs(score) * 11 - Math.min(12, volatility * 2)));
  return { direction, confidence: Math.max(25, confidence), change, rsi, sma20, sma50, volatility, reasons };
}

function calculateRsi(values, period) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  const recent = values.slice(-(period + 1));
  for (let index = 1; index < recent.length; index += 1) {
    const delta = recent[index] - recent[index - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (!averageLoss) return 100;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "Accept": "application/json", "User-Agent": "JamdDmaj-Asset-Research/1.37.64" } });
    if (!response.ok) throw new Error(`Market source returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "Accept": "application/rss+xml, application/xml, text/xml", "User-Agent": "JamdDmaj-Asset-Research/1.37.64" } });
    if (!response.ok) throw new Error(`News source returned ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function cleanSymbol(value) {
  const clean = String(value || "").toUpperCase().trim();
  return /^[A-Z0-9]{1,20}(?:USDT)?$/.test(clean) ? clean.replace(/USDT$/, "").slice(0, 20) : "";
}

function cleanCoinId(value) {
  const clean = String(value || "").toLowerCase().trim();
  return /^[a-z0-9][a-z0-9-]{1,59}$/.test(clean) ? clean : "";
}

function cleanIdentifier(value) {
  const clean = String(value || "").toLowerCase().trim();
  return /^[a-z0-9][a-z0-9_-]{1,39}$/.test(clean) ? clean : "";
}

function cleanAddress(value) {
  const clean = String(value || "").trim();
  return /^[a-zA-Z0-9]{20,80}$/.test(clean) ? clean : "";
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

function safeArticleUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function parseGdeltDate(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z` : null;
}

function validIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cacheHeaders() {
  return { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" };
}
