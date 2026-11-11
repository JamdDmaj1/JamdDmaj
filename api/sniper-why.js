import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Why did this pool move: volume, trade pressure, large buys, new listings and marketing.
const RPC = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const cache = new Map();
const boostCache = { at: 0, map: new Map() };

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

async function json(url, timeout = 8000) {
  try { const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeout) }); return await response.json().catch(() => null); } catch { return null; }
}

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

async function loadBoosts() {
  if (boostCache.map.size && Date.now() - boostCache.at < 120000) return boostCache.map;
  const map = new Map();
  for (const url of ['https://api.dexscreener.com/token-boosts/latest/v1', 'https://api.dexscreener.com/token-boosts/top/v1']) {
    const feed = await json(url, 7000);
    for (const row of Array.isArray(feed) ? feed : []) {
      if (String(row?.chainId || '') !== 'solana') continue;
      const total = num(row?.totalAmount) || num(row?.amount) || 0;
      if (row?.tokenAddress && total > (map.get(row.tokenAddress) || 0)) map.set(row.tokenAddress, total);
    }
  }
  boostCache.map = map;
  boostCache.at = Date.now();
  return map;
}

async function recentTrades(mint, pool) {
  const signatures = await rpc('getSignaturesForAddress', [pool, { limit: 14 }]);
  const queue = (Array.isArray(signatures) ? signatures : []).map(entry => entry.signature).filter(Boolean).slice(0, 14);
  const results = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const signature = queue.shift();
      const tx = await rpc('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
      if (tx) results.push({ signature, tx });
    }
  }));
  const trades = [];
  for (const { signature, tx } of results) {
    const meta = tx?.meta;
    if (!meta) continue;
    const pre = new Map(), post = new Map();
    for (const entry of meta.preTokenBalances || []) if (entry.mint === mint) pre.set(entry.owner, num(entry.uiTokenAmount?.uiAmount) || 0);
    for (const entry of meta.postTokenBalances || []) if (entry.mint === mint) post.set(entry.owner, num(entry.uiTokenAmount?.uiAmount) || 0);
    let trader = null, delta = 0;
    for (const owner of new Set([...pre.keys(), ...post.keys()])) {
      if (!owner || owner === pool) continue;
      const change = (post.get(owner) || 0) - (pre.get(owner) || 0);
      if (Math.abs(change) > Math.abs(delta)) { delta = change; trader = owner; }
    }
    if (!trader || !delta) continue;
    const keys = tx?.transaction?.message?.accountKeys || [];
    const index = keys.findIndex(key => (key.pubkey || key) === trader);
    const sol = index >= 0 ? Math.abs(((meta.postBalances?.[index] ?? 0) - (meta.preBalances?.[index] ?? 0)) / 1e9) : 0;
    trades.push({ side: delta > 0 ? 'buy' : 'sell', wallet: trader, sol, tx: signature, at: tx.blockTime ? tx.blockTime * 1000 : null });
  }
  return trades.sort((a, b) => (b.at || 0) - (a.at || 0));
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const mint = String(url.searchParams.get('mint') || '');
  const pool = String(url.searchParams.get('pool') || '');
  const symbol = String(url.searchParams.get('symbol') || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool)) return jsonResponse(request, { error: { message: 'Invalid request' } }, 400);
  const key = mint + ':' + pool;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30000) return jsonResponse(request, hit.value);

  const [dex, price, boosts, trades] = await Promise.all([
    json('https://api.dexscreener.com/latest/dex/tokens/' + mint),
    json('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112', 6000),
    loadBoosts(),
    recentTrades(mint, pool)
  ]);
  const pairs = Array.isArray(dex?.pairs) ? dex.pairs.filter(pair => pair?.baseToken?.address === mint) : [];
  pairs.sort((a, b) => (num(b?.liquidity?.usd) || 0) - (num(a?.liquidity?.usd) || 0));
  const pair = pairs[0] || null;
  const solPrice = num(price?.So11111111111111111111111111111111111111112?.usdPrice) || 0;

  const evidence = [];
  const changes = pair?.priceChange || {};
  const volumes = pair?.volume || {};
  const txns = pair?.txns || {};
  const liquidity = num(pair?.liquidity?.usd);
  const boost = boosts.get(mint) || 0;
  const venues = [...new Set(pairs.map(item => String(item?.dexId || '')).filter(Boolean))];

  const move5 = num(changes.m5), move1 = num(changes.h1), move6 = num(changes.h6), move24 = num(changes.h24);
  if (move5 !== null && Math.abs(move5) >= 5) evidence.push({ type: move5 > 0 ? 'good' : 'bad', text: 'Precio ' + move5.toFixed(1) + '% en 5 minutos' });
  if (move1 !== null && Math.abs(move1) >= 15) evidence.push({ type: move1 > 0 ? 'good' : 'bad', text: 'Precio ' + move1.toFixed(1) + '% en 1 hora' });

  const volume5 = num(volumes.m5) || 0;
  const volume1 = num(volumes.h1) || 0;
  if (liquidity && volume5 > liquidity * 0.2) evidence.push({ type: 'warn', text: 'Volumen de 5 min (' + Math.round(volume5).toLocaleString('en-US') + ' USD) supera el 20% de la liquidez' });
  if (liquidity && volume1 > liquidity) evidence.push({ type: 'warn', text: 'Rotacion altisima: ' + Math.round(volume1).toLocaleString('en-US') + ' USD en 1h frente a ' + Math.round(liquidity).toLocaleString('en-US') + ' USD de liquidez' });

  const buys5 = num(txns.m5?.buys) || 0, sells5 = num(txns.m5?.sells) || 0;
  const buys1 = num(txns.h1?.buys) || 0, sells1 = num(txns.h1?.sells) || 0;
  if (buys5 >= 5 && buys5 >= sells5 * 2) evidence.push({ type: 'good', text: 'Presion compradora: ' + buys5 + ' compras frente a ' + sells5 + ' ventas en 5 min' });
  if (sells5 >= 5 && sells5 >= buys5 * 2) evidence.push({ type: 'bad', text: 'Presion vendedora: ' + sells5 + ' ventas frente a ' + buys5 + ' compras en 5 min' });
  if (buys1 + sells1 > 0) evidence.push({ type: 'info', text: (buys1 + sells1) + ' operaciones en la ultima hora (' + buys1 + ' compras / ' + sells1 + ' ventas)' });

  const buys = trades.filter(trade => trade.side === 'buy');
  const bigBuys = buys.filter(trade => trade.sol * solPrice >= 200).sort((a, b) => b.sol - a.sol).slice(0, 3);
  if (bigBuys.length) {
    const total = bigBuys.reduce((sum, trade) => sum + trade.sol * solPrice, 0);
    evidence.push({ type: 'good', text: bigBuys.length + ' compra(s) grande(s) detectada(s) en cadena por ' + Math.round(total).toLocaleString('en-US') + ' USD', wallets: bigBuys.map(trade => trade.wallet) });
  }
  const uniqueBuyers = new Set(buys.map(trade => trade.wallet)).size;
  if (uniqueBuyers >= 5) evidence.push({ type: 'info', text: uniqueBuyers + ' carteras distintas comprando en la muestra reciente' });

  if (venues.length > 1) evidence.push({ type: 'good', text: 'Cotiza en ' + venues.length + ' mercados: ' + venues.join(', ') });
  if (boost > 0) evidence.push({ type: 'warn', text: 'Marketing pagado: boost activo por ' + boost + ' USD' });
  if (pair?.pairCreatedAt) {
    const ageHours = (Date.now() - Number(pair.pairCreatedAt)) / 3600000;
    if (ageHours < 24) evidence.push({ type: 'info', text: 'Par creado hace ' + ageHours.toFixed(1) + ' horas' });
  }
  if (!evidence.length) evidence.push({ type: 'info', text: 'Sin causa visible en los datos publicos: el movimiento no viene acompanado de volumen, compras grandes ni marketing.' });

  const rugLikely = (move5 !== null && move5 <= -60 && (sells1 >= buys1 || sells5 >= buys5)) || (liquidity !== null && liquidity < 600 && move5 !== null && move5 <= -40);
  if (rugLikely) evidence.unshift({ type: 'bad', text: 'Patron de rug pull: caida vertical con ventas dominantes y liquidez minima' });
  const positives = evidence.filter(item => item.type === 'good').length;
  const negatives = evidence.filter(item => item.type === 'bad').length;
  const summary = rugLikely ? 'Posible rug pull: la liquidez y el precio se han roto'
    : positives > negatives
    ? 'Movimiento con compras y actividad por encima de lo normal'
    : negatives > positives
      ? 'Movimiento con presion vendedora o deterioro'
      : 'Movimiento sin una causa clara en los datos publicos';

  const value = {
    observedAt: Date.now(),
    symbol,
    rugLikely,
    summary,
    evidence: evidence.slice(0, 8),
    changes: { m5: move5, h1: move1, h6: move6, h24: move24 },
    volumes: { m5: volume5, h1: volume1 },
    trades: { sample: trades.length, buys: buys.length, sells: trades.length - buys.length, uniqueBuyers },
    liquidity,
    venues,
    boost,
    solPrice
  };
  cache.set(key, { at: Date.now(), value });
  return jsonResponse(request, value);
}
