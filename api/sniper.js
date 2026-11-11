import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Sniper: new Solana pools with rug, liquidity-withdrawal and growth analysis.
// Sources: GeckoTerminal (new pools, volume, trades), RugCheck (authorities, holders, LP, creator history, votes), DexScreener (socials).
let cache = { at: 0, body: null };
const MAX_TOKENS = 12;

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

const SCAM_PATTERNS = /rug|scam|honeypot|blacklist|copycat|fake|impersonat|malicious|steal|exploit/i;

function auditToken(report, pool, votes, dexPair) {
  const risks = Array.isArray(report?.risks) ? report.risks : [];
  const market = Array.isArray(report?.markets) ? report.markets[0] : null;
  const excluded = new Set([market?.pubkey, market?.liquidityA, market?.liquidityB, market?.mintLP, report?.mint].filter(Boolean));
  const allHolders = Array.isArray(report?.topHolders) ? report.topHolders.filter(holder => !excluded.has(holder?.owner) && !excluded.has(holder?.address)) : [];
  const top = allHolders.slice(0, 10);
  const top10 = top.reduce((sum, holder) => sum + (num(holder?.pct) || 0), 0);
  const insiders = allHolders.filter(holder => holder?.insider === true).length;
  const lpLockedPct = num(market?.lp?.lpLockedPct);
  const liquidity = num(report?.totalMarketLiquidity) ?? num(pool?.reserve_in_usd);
  const mintAuthority = report?.mintAuthority ?? report?.token?.mintAuthority ?? null;
  const freezeAuthority = report?.freezeAuthority ?? report?.token?.freezeAuthority ?? null;
  const holders = num(report?.totalHolders);
  const supply = num(report?.token?.supply);
  const creatorBalance = num(report?.creatorBalance);
  const creatorPct = supply && creatorBalance ? (creatorBalance / supply) * 100 : null;
  const created = Date.parse(pool?.pool_created_at || '');
  const ageMinutes = Number.isFinite(created) ? Math.max(0, Math.round((Date.now() - created) / 60000)) : null;
  const votesDown = num(votes?.down) || 0;
  const votesUp = num(votes?.up) || 0;

  // Safety score: hard checks first.
  let safety = 100;
  const checks = [];
  const add = (id, label, ok, penalty, detail, severity) => { checks.push({ id, label, ok, detail, severity: severity || (ok ? 'ok' : 'high') }); if (!ok) safety -= penalty; };
  add('mint', 'Emision revocada', !mintAuthority, 40, mintAuthority ? 'El creador aun puede acunar tokens' : 'Nadie puede acunar mas', 'critical');
  add('freeze', 'Congelacion revocada', !freezeAuthority, 30, freezeAuthority ? 'Pueden congelar tu cuenta' : 'No pueden congelar saldos', 'critical');
  if (lpLockedPct === null) add('lp', 'Liquidez bloqueada', false, 10, 'Sin dato de bloqueo de LP', 'medium');
  else add('lp', 'Liquidez bloqueada', lpLockedPct >= 90, lpLockedPct >= 50 ? 10 : 22, Math.round(lpLockedPct) + '% del LP bloqueado', lpLockedPct >= 90 ? 'ok' : 'high');
  if (top10 <= 0) add('holders', 'Concentracion de holders', false, 20, 'Sin dato de holders', 'medium');
  else add('holders', 'Concentracion de holders', top10 <= 35, top10 > 80 ? 50 : top10 > 60 ? 35 : 20, 'Top 10 con ' + top10.toFixed(1) + '% (sin LP)', top10 <= 35 ? 'ok' : top10 > 60 ? 'critical' : 'high');
  if (liquidity === null) add('liquidity', 'Liquidez', false, 20, 'Sin liquidez medida', 'medium');
  else add('liquidity', 'Liquidez', liquidity >= 15000, liquidity < 5000 ? 25 : 12, Math.round(liquidity).toLocaleString('en-US') + ' USD', liquidity >= 15000 ? 'ok' : liquidity < 5000 ? 'critical' : 'high');
  if (ageMinutes === null) add('age', 'Antiguedad', false, 8, 'Sin fecha de creacion', 'medium');
  else add('age', 'Antiguedad', ageMinutes >= 30, 8, ageMinutes + ' min de vida', ageMinutes >= 30 ? 'ok' : 'medium');
  if (insiders > 0) add('insiders', 'Sin carteras insider', false, Math.min(20, insiders * 6), insiders + ' cartera(s) marcadas como insider', 'high');
  else add('insiders', 'Sin carteras insider', true, 0, 'No se detectan carteras insider', 'ok');
  const ruggedCreator = risks.some(risk => /creator history of rugged|rugged tokens/i.test(String(risk?.name || '')) || /rugged/i.test(String(risk?.description || '')));
  add('creator', 'Historial del creador limpio', !ruggedCreator, 30, ruggedCreator ? 'El creador ya ha hecho rug en otros tokens' : 'Sin historial de rug conocido', 'critical');
  const critical = risks.filter(risk => SCAM_PATTERNS.test(String(risk?.name || ''))).length;
  safety -= Math.min(24, critical * 8);
  safety = Math.max(0, Math.min(100, Math.round(safety)));

  // Liquidity withdrawal risk: how easily can the pool be drained right now.
  let liquidityRisk = 0;
  if (lpLockedPct === null) liquidityRisk += 25; else liquidityRisk += Math.round((100 - Math.min(100, Math.max(0, lpLockedPct))) * 0.55);
  if (creatorPct !== null) liquidityRisk += Math.min(20, Math.round(creatorPct));
  if (liquidity !== null && liquidity < 1000) liquidityRisk += 40; else if (liquidity !== null && liquidity < 5000) liquidityRisk += 22; else if (liquidity !== null && liquidity < 15000) liquidityRisk += 10;
  if (ageMinutes !== null && ageMinutes < 10) liquidityRisk += 12;
  if (/pump_fun|raydium/i.test(String(market?.marketType || '')) && (lpLockedPct ?? 0) < 90) liquidityRisk += 5;
  liquidityRisk = Math.max(0, Math.min(100, liquidityRisk));
  const liquidityLabel = liquidityRisk >= 70 ? 'ALTO' : liquidityRisk >= 45 ? 'MEDIO' : 'BAJO';

  // Growth potential: momentum, turnover, buy pressure and depth, discounted by risk.
  const tx = pool?.transactions || {};
  const vol = pool?.volume_usd || {};
  const buys = num(tx?.h1?.buys) || 0;
  const sells = num(tx?.h1?.sells) || 0;
  const volume1h = num(vol?.h1) || 0;
  const change1h = num(pool?.price_change_percentage?.h1);
  const change5m = num(pool?.price_change_percentage?.m5);
  const turnover = liquidity && liquidity > 0 ? volume1h / liquidity : 0;
  const buyRatio = buys + sells > 0 ? buys / (buys + sells) : 0.5;
  const factors = [];
  let growth = 0;
  const momentumPoints = change1h === null ? 0 : Math.max(-15, Math.min(30, change1h * 0.6)) + Math.max(-10, Math.min(15, (change5m || 0) * 0.5));
  growth += momentumPoints;
  factors.push({ label: 'Impulso de precio', value: (change1h === null ? '—' : change1h.toFixed(1) + '% 1h') + (change5m === null ? '' : ' · ' + change5m.toFixed(1) + '% 5m'), points: Math.round(momentumPoints) });
  const turnoverPoints = Math.min(25, turnover * 12);
  growth += turnoverPoints;
  factors.push({ label: 'Rotacion (volumen/liquidez)', value: volume1h ? Math.round(volume1h).toLocaleString('en-US') + ' USD en 1h' : 'Sin volumen', points: Math.round(turnoverPoints) });
  const buyPoints = (buyRatio - 0.5) * 40;
  growth += buyPoints;
  factors.push({ label: 'Presion compradora', value: buys + sells ? Math.round(buyRatio * 100) + '% compras (' + buys + '/' + sells + ')' : 'Sin operaciones', points: Math.round(buyPoints) });
  const depthPoints = liquidity === null ? 0 : Math.min(15, Math.log10(Math.max(1, liquidity)) * 3.2);
  growth += depthPoints;
  factors.push({ label: 'Profundidad de liquidez', value: liquidity === null ? '—' : Math.round(liquidity).toLocaleString('en-US') + ' USD', points: Math.round(depthPoints) });
  growth += Math.max(0, (35 - (ageMinutes ?? 0)) * 0.25);
  growth -= liquidityRisk * 0.35;
  growth -= Math.max(0, 55 - safety) * 0.4;
  const growthCap = liquidity === null ? 40 : liquidity < 5000 ? 45 : liquidity < 15000 ? 60 : safety < 55 ? 55 : 100;
  growth = Math.min(growth, growthCap);
  growth = Math.max(0, Math.min(100, Math.round(growth)));
  const growthLabel = growth >= 70 ? 'ALTO' : growth >= 45 ? 'MODERADO' : 'BAJO';

  // Public signals of scam or abuse, from the analyzer and its community votes.
  const scamSignals = [];
  for (const risk of risks) if (SCAM_PATTERNS.test(String(risk?.name || ''))) scamSignals.push({ source: 'analizador', text: String(risk.name), detail: String(risk.description || '') });
  if (ruggedCreator) scamSignals.push({ source: 'creador', text: 'Creador con historial de rug', detail: 'La misma cartera ya ha retirado liquidez en otros tokens.' });
  if (mintAuthority) scamSignals.push({ source: 'contrato', text: 'Emision abierta', detail: 'Puede acunar tokens sin limite cuando quiera.' });
  if (freezeAuthority) scamSignals.push({ source: 'contrato', text: 'Congelacion abierta', detail: 'Puede bloquear la venta de tu cuenta.' });
  if (insiders > 0) scamSignals.push({ source: 'carteras', text: insiders + ' insider(s)', detail: 'Carteras relacionadas con el creador detectadas por el analizador.' });
  if (votesDown > votesUp && votesDown >= 3) scamSignals.push({ source: 'comunidad', text: votesDown + ' votos negativos', detail: 'Usuarios del analizador marcaron este token como sospechoso.' });
  if (top10 > 60) scamSignals.push({ source: 'holders', text: 'Top 10 con ' + top10.toFixed(0) + '%', detail: 'Pocas carteras pueden vender todo a la vez.' });

  const verdict = safety <= 30 ? 'ALTO RIESGO' : safety <= 55 ? 'MEDIO' : safety <= 75 ? 'PRUDENCIA' : 'MEJOR PERFIL';
  return {
    score: safety, verdict, checks, top10, insiders, lpLockedPct, liquidity, holders, ageMinutes,
    creatorPct: creatorPct === null ? null : Number(creatorPct.toFixed(2)),
    liquidityRisk, liquidityLabel,
    growth: { score: growth, label: growthLabel, factors },
    scamSignals: scamSignals.slice(0, 6),
    votes: { up: votesUp, down: votesDown },
    risks: risks.map(risk => ({ name: String(risk?.name || ''), description: String(risk?.description || ''), level: String(risk?.level || '') })).slice(0, 8),
    xSearch: 'https://x.com/search?q=' + encodeURIComponent(pool?.symbol || '')
  };
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
    const symbol = poolSymbol(pool.attributes?.name);
    byMint.set(mint, {
      mint, symbol, poolName: String(pool.attributes?.name || ''), poolAddress: String(pool.attributes?.address || ''),
      createdAt: pool.attributes?.pool_created_at || null,
      liquidityUsd: num(pool.attributes?.reserve_in_usd), fdvUsd: num(pool.attributes?.fdv_usd),
      priceUsd: num(pool.attributes?.base_token_price_usd),
      change5m: num(pool.attributes?.price_change_percentage?.m5),
      change1h: num(pool.attributes?.price_change_percentage?.h1),
      volume1h: num(pool.attributes?.volume_usd?.h1),
      transactions: pool.attributes?.transactions || null
    });
  }
  const seeds = [...byMint.values()].slice(0, MAX_TOKENS);
  const items = await Promise.all(seeds.map(async seed => {
    const [report, votes, dex] = await Promise.all([
      readJson('https://api.rugcheck.xyz/v1/tokens/' + seed.mint + '/report'),
      readJson('https://api.rugcheck.xyz/v1/tokens/' + seed.mint + '/votes', 6000),
      readJson('https://api.dexscreener.com/latest/dex/tokens/' + seed.mint)
    ]);
    const audit = auditToken(report, {
      reserve_in_usd: seed.liquidityUsd,
      pool_created_at: seed.createdAt,
      price_change_percentage: { m5: seed.change5m, h1: seed.change1h },
      volume_usd: { h1: seed.volume1h },
      transactions: seed.transactions,
      symbol: seed.symbol
    }, votes, null);
    const pair = Array.isArray(dex?.pairs) ? dex.pairs[0] : null;
    const socials = Array.isArray(pair?.info?.socials) ? pair.info.socials.filter(item => item && item.handle).slice(0, 4).map(item => ({ type: String(item.type || ''), handle: String(item.handle) })) : [];
    return { ...seed, ...audit, socials, hasSocials: socials.length > 0 };
  }));
  const sorted = items.sort((a, b) => b.score - a.score);
  const body = { observedAt: now, items: sorted, disclaimer: 'Analisis automatico de datos publicos. No garantiza que un token sea seguro ni rentable.' };
  cache = { at: now, body };
  return jsonResponse(request, body);
}
