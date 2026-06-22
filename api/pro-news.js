import { corsHeaders, jsonResponse } from "../lib/server.js";

export const config = { runtime: "edge" };

const CACHE_TTL = 10 * 60 * 1000;
let memoryCache = null;

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!["GET", "POST"].includes(request.method)) return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  if (memoryCache && Date.now() - memoryCache.savedAt < CACHE_TTL) return jsonResponse(request, memoryCache.payload);
  try {
    const [fearResult, globalResult, newsResult] = await Promise.allSettled([
      fetchJson("https://api.alternative.me/fng/?limit=1"),
      fetchJson("https://api.coingecko.com/api/v3/global"),
      fetchJson("https://api.gdeltproject.org/api/v2/doc/doc?query=(crypto%20OR%20bitcoin%20OR%20ethereum%20OR%20federal%20reserve%20OR%20inflation%20OR%20interest%20rates)&mode=ArtList&maxrecords=12&format=json&sort=HybridRel")
    ]);
    const fear = fearResult.status === "fulfilled" ? fearResult.value?.data?.[0] : null;
    const global = globalResult.status === "fulfilled" ? globalResult.value?.data : null;
    const articles = newsResult.status === "fulfilled" && Array.isArray(newsResult.value?.articles)
      ? newsResult.value.articles.slice(0, 10).map((article) => ({
        title: String(article.title || "Market update").slice(0, 180),
        url: safeUrl(article.url),
        domain: String(article.domain || "").slice(0, 80),
        publishedAt: parseGdeltDate(article.seendate)
      })).filter((article) => article.url)
      : [];
    const payload = {
      ok: true,
      updatedAt: new Date().toISOString(),
      context: {
        fearGreed: fear ? { value: Number(fear.value), label: fear.value_classification } : null,
        totalMarketCap: Number(global?.total_market_cap?.usd) || null,
        marketCapChange24h: Number(global?.market_cap_change_percentage_24h_usd) || null,
        bitcoinDominance: Number(global?.market_cap_percentage?.btc) || null
      },
      articles
    };
    memoryCache = { savedAt: Date.now(), payload };
    return jsonResponse(request, payload, 200, { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" });
  } catch (error) {
    return jsonResponse(request, { error: { message: error?.message || "Market context is temporarily unavailable." } }, 502);
  }
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
