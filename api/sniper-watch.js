import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Live watch: one cheap call returning liquidity, price and trade counts for many mints.
let cache = new Map();

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const mints = [...new Set((Array.isArray(body?.mints) ? body.mints : []).filter(mint => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(mint))))].slice(0, 25);
  if (!mints.length) return jsonResponse(request, { observedAt: Date.now(), items: {} });

  const key = mints.slice().sort().join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5000) return jsonResponse(request, hit.value);

  let pairs = [];
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + mints.join(','), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => null);
    pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  } catch { pairs = []; }

  const items = {};
  for (const mint of mints) {
    const candidates = pairs.filter(pair => pair?.baseToken?.address === mint);
    if (!candidates.length) { items[mint] = null; continue; }
    candidates.sort((a, b) => (num(b?.liquidity?.usd) || 0) - (num(a?.liquidity?.usd) || 0));
    const pair = candidates[0];
    items[mint] = {
      pool: String(pair.pairAddress || ''),
      priceUsd: num(pair.priceUsd),
      liquidityUsd: num(pair.liquidity?.usd),
      fdvUsd: num(pair.fdv),
      change5m: num(pair.priceChange?.m5),
      change1h: num(pair.priceChange?.h1),
      buys5m: num(pair.txns?.m5?.buys),
      sells5m: num(pair.txns?.m5?.sells),
      buys1h: num(pair.txns?.h1?.buys),
      sells1h: num(pair.txns?.h1?.sells),
      volume1h: num(pair.volume?.h1)
    };
  }
  const value = { observedAt: Date.now(), items };
  cache.set(key, { at: Date.now(), value });
  return jsonResponse(request, value);
}
