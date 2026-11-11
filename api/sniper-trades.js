import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Live trades for a pool, read straight from Solana so no aggregator quota applies.
const RPC = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const priceCache = { at: 0, value: null };
const cache = new Map();

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

async function rpc(method, params, timeout = 8000) {
  for (const endpoint of RPC) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(timeout) });
      const data = await response.json().catch(() => null);
      if (data?.result) return data.result;
    } catch {}
  }
  return null;
}

async function solPrice() {
  if (priceCache.value && Date.now() - priceCache.at < 60000) return priceCache.value;
  try {
    const response = await fetch('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    const data = await response.json().catch(() => null);
    const price = Number(data?.So11111111111111111111111111111111111111112?.usdPrice);
    if (price > 0) { priceCache.value = price; priceCache.at = Date.now(); }
  } catch {}
  return priceCache.value;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const pool = String(url.searchParams.get('pool') || '');
  const mint = String(url.searchParams.get('mint') || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return jsonResponse(request, { error: { message: 'Invalid request' } }, 400);
  const key = pool + ':' + mint;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 4000) return jsonResponse(request, hit.value);

  const price = await solPrice();
  const signatures = await rpc('getSignaturesForAddress', [pool, { limit: 12 }]);
  const list = Array.isArray(signatures) ? signatures.map(entry => entry.signature).filter(Boolean) : [];
  const queue = [...list];
  const results = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const signature = queue.shift();
      const tx = await rpc('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
      if (tx) results.push({ signature, tx });
    }
  }));

  const items = [];
  for (const { signature, tx } of results) {
    const meta = tx?.meta;
    if (!meta) continue;
    const keys = tx?.transaction?.message?.accountKeys || [];
    const pre = new Map(), post = new Map();
    for (const entry of meta.preTokenBalances || []) if (entry.mint === mint) pre.set(entry.owner, num(entry.uiTokenAmount?.uiAmount) || 0);
    for (const entry of meta.postTokenBalances || []) if (entry.mint === mint) post.set(entry.owner, num(entry.uiTokenAmount?.uiAmount) || 0);
    let trader = null, delta = 0;
    for (const owner of new Set([...pre.keys(), ...post.keys()])) {
      if (!owner || owner === pool) continue;
      const change = (post.get(owner) || 0) - (pre.get(owner) || 0);
      if (Math.abs(change) > Math.abs(delta)) { delta = change; trader = owner; }
    }
    if (!trader || delta === 0) continue;
    const index = keys.findIndex(key => (key.pubkey || key) === trader);
    const solDelta = index >= 0 ? ((meta.postBalances?.[index] ?? 0) - (meta.preBalances?.[index] ?? 0)) / 1e9 : 0;
    const usd = price && solDelta < 0 ? Math.abs(solDelta) * price : num(meta.postTokenBalances?.find(entry => entry.mint === mint)?.uiTokenAmount?.uiAmount);
    items.push({
      side: delta > 0 ? 'buy' : 'sell',
      wallet: trader,
      tokens: Math.abs(delta),
      sol: Math.abs(solDelta),
      usd: price && solDelta !== 0 ? Math.abs(solDelta) * price : null,
      tx: signature,
      at: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null
    });
  }
  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const value = { observedAt: Date.now(), pool, mint, solPrice: price, items: items.slice(0, 20) };
  cache.set(key, { at: Date.now(), value });
  return jsonResponse(request, value);
}
