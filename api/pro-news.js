import { corsHeaders, jsonResponse } from "../lib/server.js";

export const config = { runtime: "edge" };

const CACHE_TTL = 10 * 60 * 1000;
let memoryCache = null;

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!["GET", "POST"].includes(request.method)) return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  if (memoryCache && Date.now() - memoryCache.savedAt < CACHE_TTL) return jsonResponse(request, memoryCache.payload);
  try {
    const [fearResult, globalResult, trendingResult, newsResult] = await Promise.allSettled([
      fetchJson("https://api.alternative.me/fng/?limit=1"),
      fetchJson("https://api.coingecko.com/api/v3/global"),
      fetchJson("https://api.coingecko.com/api/v3/search/trending"),
      fetchJson("https://api.gdeltproject.org/api/v2/doc/doc?query=(crypto%20OR%20bitcoin%20OR%20ethereum%20OR%20ETF%20OR%20stablecoin%20OR%20federal%20reserve%20OR%20inflation%20OR%20interest%20rates%20OR%20liquidation%20OR%20regulation)&mode=ArtList&maxrecords=24&format=json&sort=HybridRel")
    ]);
    const fear = fearResult.status === "fulfilled" ? fearResult.value?.data?.[0] : null;
    const global = globalResult.status === "fulfilled" ? globalResult.value?.data : null;
    const trending = trendingResult.status === "fulfilled" && Array.isArray(trendingResult.value?.coins)
      ? trendingResult.value.coins.slice(0, 7).map((item) => ({
        symbol: String(item.item?.symbol || "").toUpperCase(),
        name: String(item.item?.name || ""),
        rank: Number(item.item?.market_cap_rank || 0) || null
      })).filter((item) => item.symbol)
      : [];
    const articles = newsResult.status === "fulfilled" && Array.isArray(newsResult.value?.articles)
      ? newsResult.value.articles.slice(0, 16).map(normalizeArticle).filter((article) => article.url)
      : [];
    const marketCapChange24h = Number(global?.market_cap_change_percentage_24h_usd) || null;
    const bitcoinDominance = Number(global?.market_cap_percentage?.btc) || null;
    const fearValue = fear ? Number(fear.value) : null;
    const catalysts = buildCatalysts(articles);
    const payload = {
      ok: true,
      updatedAt: new Date().toISOString(),
      context: {
        fearGreed: fear ? { value: fearValue, label: fear.value_classification } : null,
        totalMarketCap: Number(global?.total_market_cap?.usd) || null,
        marketCapChange24h,
        bitcoinDominance,
        regime: describeRegime({ fearValue, marketCapChange24h, bitcoinDominance }),
        trending
      },
      catalysts,
      brief: buildBrief({ fearValue, fearLabel: fear?.value_classification, marketCapChange24h, bitcoinDominance, catalysts, trending }),
      articles
    };
    memoryCache = { savedAt: Date.now(), payload };
    return jsonResponse(request, payload, 200, { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" });
  } catch (error) {
    return jsonResponse(request, { error: { message: error?.message || "Market context is temporarily unavailable." } }, 502);
  }
}

function normalizeArticle(article) {
  const title = String(article.title || "Market update").replace(/\s+/g, " ").trim().slice(0, 180);
  const theme = classifyTheme(title);
  return {
    title,
    url: safeUrl(article.url),
    domain: String(article.domain || "").slice(0, 80),
    publishedAt: parseGdeltDate(article.seendate),
    theme,
    impact: classifyImpact(title, theme)
  };
}

function classifyTheme(value) {
  const title = String(value || "").toLowerCase();
  if (/(fed|federal reserve|inflation|cpi|interest rate|treasury|dollar|jobs report)/.test(title)) return "Macro";
  if (/(etf|sec|regulat|lawsuit|court|congress|senate|policy)/.test(title)) return "Regulation";
  if (/(liquidat|leverage|futures|open interest|short squeeze|long squeeze)/.test(title)) return "Derivatives";
  if (/(stablecoin|usdt|usdc|tether|circle)/.test(title)) return "Stablecoins";
  if (/(hack|exploit|bridge|security|scam)/.test(title)) return "Security";
  if (/(bitcoin|btc)/.test(title)) return "Bitcoin";
  if (/(ethereum|eth)/.test(title)) return "Ethereum";
  return "Crypto";
}

function classifyImpact(title, theme) {
  const text = String(title || "").toLowerCase();
  if (/(crash|plunge|hack|exploit|lawsuit|reject|ban|liquidat|selloff|outflow)/.test(text)) return "risk-off";
  if (/(approve|inflow|record high|rally|surge|partnership|launch|cuts rates|rate cut)/.test(text)) return "risk-on";
  if (["Macro", "Regulation", "Derivatives", "Security"].includes(theme)) return "watch";
  return "neutral";
}

function buildCatalysts(articles) {
  const map = new Map();
  for (const article of articles) {
    const current = map.get(article.theme) || { theme: article.theme, count: 0, riskOn: 0, riskOff: 0, watch: 0, sample: article.title };
    current.count += 1;
    if (article.impact === "risk-on") current.riskOn += 1;
    else if (article.impact === "risk-off") current.riskOff += 1;
    else if (article.impact === "watch") current.watch += 1;
    if (!current.sample || article.impact !== "neutral") current.sample = article.title;
    map.set(article.theme, current);
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((item) => ({
      ...item,
      impact: item.riskOff > item.riskOn ? "risk-off" : item.riskOn > item.riskOff ? "risk-on" : item.watch ? "watch" : "neutral"
    }));
}

function describeRegime({ fearValue, marketCapChange24h, bitcoinDominance }) {
  const risk = Number(marketCapChange24h) >= 1 && Number(fearValue) >= 50 ? "risk-on"
    : Number(marketCapChange24h) <= -1 || Number(fearValue) <= 30 ? "risk-off"
      : "mixed";
  const dominance = Number(bitcoinDominance) >= 55 ? "BTC-led" : Number(bitcoinDominance) <= 45 ? "alt-sensitive" : "balanced";
  return `${risk} / ${dominance}`;
}

function buildBrief({ fearValue, fearLabel, marketCapChange24h, bitcoinDominance, catalysts, trending }) {
  const parts = [];
  if (Number.isFinite(fearValue)) parts.push(`Fear & Greed ${fearValue} (${fearLabel || "n/a"})`);
  if (Number.isFinite(marketCapChange24h)) parts.push(`crypto market cap 24h ${marketCapChange24h >= 0 ? "+" : ""}${marketCapChange24h.toFixed(2)}%`);
  if (Number.isFinite(bitcoinDominance)) parts.push(`BTC dominance ${bitcoinDominance.toFixed(1)}%`);
  const mainCatalyst = catalysts[0] ? `${catalysts[0].theme} headlines lean ${catalysts[0].impact}` : "headline signal is thin";
  const hot = trending.length ? `Trending: ${trending.slice(0, 4).map((item) => item.symbol).join(", ")}` : "";
  return [parts.join(" | "), mainCatalyst, hot].filter(Boolean);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "JamdDmaj-Pro-News/1.28" } });
    if (!response.ok) throw new Error(`News source ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function parseGdeltDate(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z` : null;
}
