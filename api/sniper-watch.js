import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Live watch: one cheap call returning liquidity, price and trade counts for many mints.
let cache = new Map();
const boostCache = { at: 0, map: new Map() };

async function loadBoosts() {
  if (boostCache.map.size && Date.now() - boostCache.at < 120000) return boostCache.map;
  const map = new Map();
  for (const url of ['https://api.dexscreener.com/token-boosts/latest/v1', 'https://api.dexscreener.com/token-boosts/top/v1']) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
      const feed = await response.json().catch(() => null);
      for (const row of Array.isArray(feed) ? feed : []) {
        if (String(row?.chainId || '') !== 'solana') continue;
        const address = String(row?.tokenAddress || '');
        const total = num(row?.totalAmount) || num(row?.amount) || 0;
        if (address && total > (map.get(address) || 0)) map.set(address, total);
      }
    } catch {}
  }
  boostCache.map = map;
  boostCache.at = Date.now();
  return map;
}

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

  const boosts = await loadBoosts();
  const items = {};
  for (const mint of mints) {
    const candidates = pairs.filter(pair => pair?.baseToken?.address === mint);
    if (!candidates.length) { items[mint] = null; continue; }
    candidates.sort((a, b) => (num(b?.liquidity?.usd) || 0) - (num(a?.liquidity?.usd) || 0));
    const pair = candidates[0];
    const all = pairs.filter(item => item?.baseToken?.address === mint);
    const venues = [...new Set(all.map(item => String(item?.dexId || '')).filter(Boolean))];
    items[mint] = {
      pool: String(pair.pairAddress || ''),
      venues,
      pairsCount: all.length,
      boostTotal: boosts.get(mint) || 0,
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
