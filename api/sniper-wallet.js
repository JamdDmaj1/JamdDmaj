import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Wallet snapshot for Sniper: SOL, token value and the largest positions.
const RPC = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
const cache = new Map();

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

async function rpc(method, params, timeout = 9000) {
  for (const endpoint of RPC) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(timeout) });
      const data = await response.json().catch(() => null);
      if (data?.result !== undefined) return data.result;
    } catch {}
  }
  return null;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const owner = String(body?.owner || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) return jsonResponse(request, { error: { message: 'Invalid owner' } }, 400);
  const hit = cache.get(owner);
  if (hit && Date.now() - hit.at < 12000) return jsonResponse(request, hit.value);

  const [balanceResult, ...accountsByProgram] = await Promise.all([
    rpc('getBalance', [owner]),
    ...TOKEN_PROGRAMS.map(programId => rpc('getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed' }]))
  ]);
  const lamports = num(balanceResult?.value ?? balanceResult);

  const holdings = new Map();
  for (const accounts of accountsByProgram) {
    const list = Array.isArray(accounts) ? accounts : Array.isArray(accounts?.value) ? accounts.value : [];
    for (const account of list) {
      const info = account?.account?.data?.parsed?.info;
      const mint = String(info?.mint || '');
      const amount = num(info?.tokenAmount?.uiAmount);
      if (!mint || !amount || amount <= 0) continue;
      holdings.set(mint, (holdings.get(mint) || 0) + amount);
    }
  }

  const mints = [...holdings.keys()].slice(0, 50);
  let prices = {};
  if (mints.length) {
    try {
      const response = await fetch('https://lite-api.jup.ag/price/v3?ids=' + mints.join(','), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
      const data = await response.json().catch(() => null);
      for (const mint of mints) {
        const price = num(data?.[mint]?.usdPrice);
        if (price) prices[mint] = price;
      }
    } catch {}
  }

  let tokensUsd = 0;
  let priced = 0;
  const positions = [];
  for (const [mint, amount] of holdings) {
    const price = prices[mint];
    if (!price) continue;
    const value = amount * price;
    if (value <= 0.01) continue;
    tokensUsd += value;
    priced++;
    positions.push({ mint, amount, price, value });
  }
  positions.sort((a, b) => b.value - a.value);

  const solBalance = (num(lamports) || 0) / 1e9;
  const solPrice = num(prices['So11111111111111111111111111111111111111112']) || null;
  let solUsd = null;
  if (!solPrice) {
    try {
      const response = await fetch('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
      const data = await response.json().catch(() => null);
      const price = num(data?.So11111111111111111111111111111111111111112?.usdPrice);
      if (price) solUsd = solBalance * price;
    } catch {}
  } else {
    solUsd = solBalance * solPrice;
  }

  const value = {
    observedAt: Date.now(),
    owner,
    solBalance,
    solUsd,
    tokensUsd: Number(tokensUsd.toFixed(2)),
    totalUsd: Number(((solUsd || 0) + tokensUsd).toFixed(2)),
    positions: positions.slice(0, 12).map(position => ({ ...position, value: Number(position.value.toFixed(2)) })),
    tokenCount: holdings.size,
    pricedCount: priced
  };
  cache.set(owner, { at: Date.now(), value });
  return jsonResponse(request, value);
}
