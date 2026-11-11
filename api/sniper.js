import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Sniper: new Solana pools enriched with rug risk data.
// Sources: GeckoTerminal (new pools), RugCheck (authorities, holders, LP), DexScreener (socials).
let cache = { at: 0, body: null };
const MAX_TOKENS = 14;

const num = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function readJson(url, timeout = 9000) {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

function poolSymbol(name) {
  return String(name || '').split('/')[0].trim().slice(0, 16);
}

function auditRisk(report, pool) {
  const risks = Array.isArray(report?.risks) ? report.risks : [];
  const top = Array.isArray(report?.topHolders) ? report.topHolders : [];
  const top10 = top.slice(0, 10).reduce((sum, holder) => sum + (num(holder?.pct) || 0), 0);
  const market = Array.isArray(report?.markets) ? report.markets[0] : null;
  const lpLockedPct = num(market?.lp?.lpLockedPct);
  const liquidity = num(report?.totalMarketLiquidity) ?? num(pool?.reserve_in_usd);
  const mintAuthority = report?.mintAuthority ?? report?.token?.mintAuthority ?? null;
  const freezeAuthority = report?.freezeAuthority ?? report?.token?.freezeAuthority ?? null;
  const holders = num(report?.totalHolders);
  const created = Date.parse(pool?.pool_created_at || '');
  const ageMinutes = Number.isFinite(created) ? Math.max(0, Math.round((Date.now() - created) / 60000)) : null;

  let score = 100;
  const checks = [];
  const add = (id, label, ok, penalty, detail, severity) => { checks.push({ id, label, ok, detail, severity: severity || (ok ? 'ok' : 'high') }); if (!ok) score -= penalty; };

  add('mint', 'Emision revocada', !mintAuthority, 40, mintAuthority ? 'El creador aun puede acunar tokens' : 'Nadie puede acunar mas', 'critical');
  add('freeze', 'Congelacion revocada', !freezeAuthority, 30, freezeAuthority ? 'Pueden congelar tu cuenta' : 'No pueden congelar saldos', 'critical');
  if (lpLockedPct === null) add('lp', 'Liquidez bloqueada', false, 10, 'Sin dato de bloqueo de LP', 'medium');
  else add('lp', 'Liquidez bloqueada', lpLockedPct >= 90, lpLockedPct >= 50 ? 10 : 22, Math.round(lpLockedPct) + '% del LP bloqueado', lpLockedPct >= 90 ? 'ok' : 'high');
  if (top10 <= 0) add('holders', 'Concentracion de holders', false, 20, 'Sin dato de holders', 'medium');
  else add('holders', 'Concentracion de holders', top10 <= 35, top10 > 80 ? 50 : top10 > 60 ? 35 : 20, 'Top 10 con ' + top10.toFixed(1) + '%', top10 <= 35 ? 'ok' : top10 > 60 ? 'critical' : 'high');
  if (liquidity === null) add('liquidity', 'Liquidez', false, 20, 'Sin liquidez medida', 'medium');
  else add('liquidity', 'Liquidez', liquidity >= 15000, liquidity < 5000 ? 25 : 12, Math.round(liquidity).toLocaleString('en-US') + ' USD', liquidity >= 15000 ? 'ok' : liquidity < 5000 ? 'critical' : 'high');
  if (ageMinutes === null) add('age', 'Antiguedad', false, 8, 'Sin fecha de creacion', 'medium');
  else add('age', 'Antiguedad', ageMinutes >= 30, 8, ageMinutes + ' min de vida', ageMinutes >= 30 ? 'ok' : 'medium');
  if (!(Array.isArray(report?.markets) && report.markets.length)) add('market', 'Mercado verificable', false, 10, 'Sin mercado listado', 'medium');

  const critical = risks.filter(risk => /mint|freeze|honeypot|rug|blacklist/i.test(String(risk?.name || ''))).length;
  score -= Math.min(24, critical * 8);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = score <= 30 ? 'ALTO RIESGO' : score <= 55 ? 'MEDIO' : score <= 75 ? 'PRUDENCIA' : 'MEJOR PERFIL';
  return { score, verdict, checks, top10, lpLockedPct, liquidity, holders, ageMinutes, risks: risks.map(risk => ({ name: String(risk?.name || ''), description: String(risk?.description || ''), level: String(risk?.level || '') })).slice(0, 8) };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'GET') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  const now = Date.now();
  if (cache.body && now - cache.at < 90000) return jsonResponse(request, cache.body);

  const pools = [];
  for (const page of [1, 2]) {
    const feed = await readJson('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=' + page);
    for (const row of feed?.data || []) pools.push(row);
  }
  const byMint = new Map();
  for (const pool of pools) {
    const mint = String(pool?.relationships?.base_token?.data?.id || '').split('_').pop();
    if (!mint || byMint.has(mint)) continue;
    byMint.set(mint, {
      mint,
      symbol: poolSymbol(pool.attributes?.name),
      poolName: String(pool.attributes?.name || ''),
      poolAddress: String(pool.attributes?.address || ''),
      createdAt: pool.attributes?.pool_created_at || null,
      liquidityUsd: num(pool.attributes?.reserve_in_usd),
      fdvUsd: num(pool.attributes?.fdv_usd),
      priceUsd: num(pool.attributes?.base_token_price_usd),
      change5m: num(pool.attributes?.price_change_percentage?.m5),
      change1h: num(pool.attributes?.price_change_percentage?.h1),
      volume1h: num(pool.attributes?.volume_usd?.h1)
    });
  }
  const seeds = [...byMint.values()].slice(0, MAX_TOKENS);
  const items = await Promise.all(seeds.map(async seed => {
    const [report, dex] = await Promise.all([
      readJson('https://api.rugcheck.xyz/v1/tokens/' + seed.mint + '/report'),
      readJson('https://api.dexscreener.com/latest/dex/tokens/' + seed.mint)
    ]);
    const audit = auditRisk(report, { reserve_in_usd: seed.liquidityUsd, pool_created_at: seed.createdAt });
    const pair = Array.isArray(dex?.pairs) ? dex.pairs[0] : null;
    const socials = Array.isArray(pair?.info?.socials) ? pair.info.socials.filter(item => item && item.handle).slice(0, 4).map(item => ({ type: String(item.type || ''), handle: String(item.handle) })) : [];
    const websites = Array.isArray(pair?.info?.websites) ? pair.info.websites.filter(item => item && item.url).slice(0, 2).map(item => String(item.url)) : [];
    return { ...seed, ...audit, socials, websites, hasSocials: socials.length > 0, verifiedName: report?.tokenMeta?.name || null };
  }));
  const sorted = items.sort((a, b) => b.score - a.score);
  const body = { observedAt: now, items: sorted, disclaimer: 'Analisis automatico de datos publicos. No garantiza que un token sea seguro ni rentable.' };
  cache = { at: now, body };
  return jsonResponse(request, body);
}
