import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// All-time high price and market cap for one pool, from daily candles.
const cache = new Map();
const TTL = 30 * 60 * 1000;

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const pool = String(url.searchParams.get('pool') || '');
  const marketCap = num(url.searchParams.get('mcap'));
  const price = num(url.searchParams.get('price'));
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool)) return jsonResponse(request, { error: { message: 'Invalid pool' } }, 400);
  const hit = cache.get(pool);
  if (hit && Date.now() - hit.at < TTL) return jsonResponse(request, hit.value);

  let candles = [];
  try {
    const response = await fetch('https://api.geckoterminal.com/api/v2/networks/solana/pools/' + pool + '/ohlcv/day?limit=1000', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
    const data = await response.json().catch(() => null);
    candles = Array.isArray(data?.data?.attributes?.ohlcv_list) ? data.data.attributes.ohlcv_list : [];
  } catch { candles = []; }

  if (!candles.length) {
    const value = { observedAt: Date.now(), pool, available: false };
    cache.set(pool, { at: Date.now(), value });
    return jsonResponse(request, value);
  }
  let athPrice = 0;
  let athAt = null;
  for (const candle of candles) {
    const high = num(candle?.[2]);
    if (high && high > athPrice) { athPrice = high; athAt = Number(candle?.[0]) * 1000; }
  }
  const supply = marketCap && price ? marketCap / price : null;
  const athMarketCap = supply ? athPrice * supply : null;
  const current = price || num(candles.at(-1)?.[4]);
  const fromAthPct = current && athPrice ? ((current / athPrice) - 1) * 100 : null;
  const value = {
    observedAt: Date.now(),
    pool,
    available: true,
    candles: candles.length,
    athPrice,
    athAt,
    athMarketCap,
    current: current || null,
    fromAthPct: fromAthPct === null ? null : Number(fromAthPct.toFixed(2))
  };
  cache.set(pool, { at: Date.now(), value });
  return jsonResponse(request, value);
}
