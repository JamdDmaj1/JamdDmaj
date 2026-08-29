import { corsHeaders, jsonResponse } from "../lib/server.js";

export const config = { runtime: "edge" };

const CACHE_TTL_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7000;
let memoryCache = null;

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET") {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  if (memoryCache && Date.now() - memoryCache.savedAt < CACHE_TTL_MS) {
    return jsonResponse(request, memoryCache.payload, 200, cacheHeaders());
  }

  const [bitgetResult, dexResult] = await Promise.allSettled([
    fetchBitgetTrending(),
    fetchDexScreenerTrending()
  ]);
  const bitget = bitgetResult.status === "fulfilled" ? bitgetResult.value : [];
  const dexScreener = dexResult.status === "fulfilled" ? dexResult.value : [];

  if (!bitget.length && !dexScreener.length) {
    return jsonResponse(request, { error: { message: "Trending markets are temporarily unavailable." } }, 502);
  }

  const payload = {
    ok: true,
    updatedAt: new Date().toISOString(),
    bitget,
    dexScreener,
    methodology: {
      bitget: "Most active USDT futures ranked from public 24h turnover and price movement.",
      dexScreener: "Tokens with the most active paid boosts, enriched with public pair liquidity and volume. A boost is promotion, not an endorsement."
    },
    partial: bitgetResult.status !== "fulfilled" || dexResult.status !== "fulfilled"
  };
  memoryCache = { savedAt: Date.now(), payload };
  return jsonResponse(request, payload, 200, cacheHeaders());
}

async function fetchBitgetTrending() {
  const data = await fetchJson("https://api.bitget.com/api/v3/market/tickers?category=USDT-FUTURES");
  if (data?.code !== "00000" || !Array.isArray(data.data)) throw new Error("Bitget market response was invalid.");
  return data.data
    .map((ticker) => {
      const symbol = safeSymbol(ticker.symbol);
      const price = finiteNumber(ticker.lastPrice);
      const change24h = finiteNumber(ticker.price24hPcnt) * 100;
      const turnover24h = finiteNumber(ticker.turnover24h);
      const openInterest = finiteNumber(ticker.openInterest);
      const activityScore = Math.log10(Math.max(1, turnover24h)) + Math.min(3, Math.abs(change24h) / 8);
      return {
        symbol,
        price,
        change24h,
        volume24h: turnover24h,
        openInterest,
        url: symbol ? `https://www.bitget.com/futures/usdt/${encodeURIComponent(symbol)}` : "",
        activityScore
      };
    })
    .filter((ticker) => ticker.symbol && ticker.price > 0 && ticker.volume24h >= 100000)
    .sort((left, right) => right.activityScore - left.activityScore)
    .slice(0, 8)
    .map(({ activityScore, ...ticker }, index) => ({ ...ticker, rank: index + 1 }));
}

async function fetchDexScreenerTrending() {
  const boosts = await fetchJson("https://api.dexscreener.com/token-boosts/top/v1");
  if (!Array.isArray(boosts)) throw new Error("DEX Screener boost response was invalid.");
  const candidates = boosts
    .map((boost, index) => ({
      chainId: safeIdentifier(boost.chainId),
      tokenAddress: safeAddress(boost.tokenAddress),
      boostAmount: finiteNumber(boost.totalAmount || boost.amount),
      rank: index + 1
    }))
    .filter((boost) => boost.chainId && boost.tokenAddress)
    .slice(0, 18);

  const byChain = new Map();
  candidates.forEach((candidate) => {
    if (!byChain.has(candidate.chainId)) byChain.set(candidate.chainId, []);
    byChain.get(candidate.chainId).push(candidate);
  });
  const pairResults = await Promise.allSettled([...byChain.entries()].map(async ([chainId, tokens]) => {
    const addresses = tokens.map((token) => token.tokenAddress).join(",");
    return fetchJson(`https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(addresses)}`);
  }));
  const pairs = pairResults.flatMap((result) => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);

  return candidates.map((candidate) => {
    const matching = pairs.filter((pair) => (
      safeIdentifier(pair.chainId) === candidate.chainId
      && String(pair.baseToken?.address || "").toLowerCase() === candidate.tokenAddress.toLowerCase()
    ));
    const pair = matching.sort((left, right) => finiteNumber(right.liquidity?.usd) - finiteNumber(left.liquidity?.usd))[0];
    if (!pair) return null;
    const symbol = safeSymbol(pair.baseToken?.symbol).replace(/USDT$/, "") || "TOKEN";
    return {
      rank: candidate.rank,
      symbol,
      name: safeText(pair.baseToken?.name, 60),
      chainId: candidate.chainId,
      tokenAddress: candidate.tokenAddress,
      pairAddress: safeAddress(pair.pairAddress),
      price: finiteNumber(pair.priceUsd),
      change24h: finiteNumber(pair.priceChange?.h24),
      volume24h: finiteNumber(pair.volume?.h24),
      liquidityUsd: finiteNumber(pair.liquidity?.usd),
      boosts: candidate.boostAmount,
      url: safeDexScreenerUrl(pair.url, candidate.chainId, pair.pairAddress)
    };
  }).filter(Boolean).slice(0, 8);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "JamdDmaj-Markets/1.37.63" }
    });
    if (!response.ok) throw new Error(`Market source returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function safeSymbol(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

function safeIdentifier(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function safeAddress(value) {
  const clean = String(value || "").trim();
  return /^[a-zA-Z0-9]{20,80}$/.test(clean) ? clean : "";
}

function safeText(value, maxLength) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeDexScreenerUrl(value, chainId, pairAddress) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol === "https:" && /(^|\.)dexscreener\.com$/i.test(url.hostname)) return url.href;
  } catch {}
  const pair = safeAddress(pairAddress);
  return pair ? `https://dexscreener.com/${encodeURIComponent(chainId)}/${encodeURIComponent(pair)}` : "https://dexscreener.com/";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cacheHeaders() {
  return { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" };
}
