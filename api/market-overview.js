import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Market cap, volume and 24h change per coin, cached for two minutes.
let cache = { at: 0, body: null };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'GET') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  const now = Date.now();
  if (cache.body && now - cache.at < 120000) return jsonResponse(request, cache.body);
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h';
    const upstream = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);
    const rows = await upstream.json();
    const markets = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row.id !== 'string') continue;
      markets[row.id] = {
        symbol: String(row.symbol || '').toUpperCase(),
        marketCap: Number.isFinite(row.market_cap) ? row.market_cap : null,
        volume: Number.isFinite(row.total_volume) ? row.total_volume : null,
        rank: Number.isFinite(row.market_cap_rank) ? row.market_cap_rank : null,
        change24h: Number.isFinite(row.price_change_percentage_24h) ? row.price_change_percentage_24h : null
      };
    }
    const body = { observedAt: now, markets };
    cache = { at: now, body };
    return jsonResponse(request, body);
  } catch {
    return jsonResponse(request, { observedAt: now, markets: {}, error: 'overview-unavailable' });
  }
}
