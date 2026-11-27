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
  add('mint', 'Mint authority revoked', !mintAuthority, 40, mintAuthority ? 'The creator can still mint tokens' : 'No one can mint more', 'critical');
  add('freeze', 'Freeze authority revoked', !freezeAuthority, 30, freezeAuthority ? 'They can freeze your account' : 'They cannot freeze balances', 'critical');
  if (lpLockedPct === null) add('lp', 'Liquidity locked', false, 10, 'No LP lock data', 'medium');
  else add('lp', 'Liquidity locked', lpLockedPct >= 90, lpLockedPct >= 50 ? 10 : 22, Math.round(lpLockedPct) + '% of LP locked', lpLockedPct >= 90 ? 'ok' : 'high');
  if (top10 <= 0) add('holders', 'Holder concentration', false, 20, 'No holder data', 'medium');
  else add('holders', 'Holder concentration', top10 <= 35, top10 > 80 ? 50 : top10 > 60 ? 35 : 20, 'Top 10 hold ' + top10.toFixed(1) + '% (excluding LP)', top10 <= 35 ? 'ok' : top10 > 60 ? 'critical' : 'high');
  if (liquidity === null) add('liquidity', 'Liquidity', false, 20, 'No measured liquidity', 'medium');
  else add('liquidity', 'Liquidity', liquidity >= 15000, liquidity < 5000 ? 25 : 12, Math.round(liquidity).toLocaleString('en-US') + ' USD', liquidity >= 15000 ? 'ok' : liquidity < 5000 ? 'critical' : 'high');
  if (ageMinutes === null) add('age', 'Age', false, 8, 'No creation date', 'medium');
  else add('age', 'Age', ageMinutes >= 30, 8, ageMinutes + ' min old', ageMinutes >= 30 ? 'ok' : 'medium');
  if (insiders > 0) add('insiders', 'No insider wallets', false, Math.min(20, insiders * 6), insiders + ' wallet(s) flagged as insider', 'high');
  else add('insiders', 'No insider wallets', true, 0, 'No insider wallets detected', 'ok');
  const ruggedCreator = risks.some(risk => /creator history of rugged|rugged tokens/i.test(String(risk?.name || '')) || /rugged/i.test(String(risk?.description || '')));
  add('creator', 'Clean creator history', !ruggedCreator, 30, ruggedCreator ? 'The creator has rugged other tokens' : 'No known rug history', 'critical');
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
  const liquidityLabel = liquidityRisk >= 70 ? 'HIGH' : liquidityRisk >= 45 ? 'MEDIUM' : 'LOW';

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
  factors.push({ label: 'Price momentum', value: (change1h === null ? '—' : change1h.toFixed(1) + '% 1h') + (change5m === null ? '' : ' · ' + change5m.toFixed(1) + '% 5m'), points: Math.round(momentumPoints) });
  const turnoverPoints = Math.min(25, turnover * 12);
  growth += turnoverPoints;
  factors.push({ label: 'Turnover (volume/liquidity)', value: volume1h ? Math.round(volume1h).toLocaleString('en-US') + ' USD en 1h' : 'No volume', points: Math.round(turnoverPoints) });
  const buyPoints = (buyRatio - 0.5) * 40;
  growth += buyPoints;
  factors.push({ label: 'Buy pressure', value: buys + sells ? Math.round(buyRatio * 100) + '% compras (' + buys + '/' + sells + ')' : 'No trades', points: Math.round(buyPoints) });
  const depthPoints = liquidity === null ? 0 : Math.min(15, Math.log10(Math.max(1, liquidity)) * 3.2);
  growth += depthPoints;
  factors.push({ label: 'Liquidity depth', value: liquidity === null ? '—' : Math.round(liquidity).toLocaleString('en-US') + ' USD', points: Math.round(depthPoints) });
  growth += Math.max(0, (35 - (ageMinutes ?? 0)) * 0.25);
  growth -= liquidityRisk * 0.35;
  growth -= Math.max(0, 55 - safety) * 0.4;
  const growthCap = liquidity === null ? 40 : liquidity < 5000 ? 45 : liquidity < 15000 ? 60 : safety < 55 ? 55 : 100;
  growth = Math.min(growth, growthCap);
  growth = Math.max(0, Math.min(100, Math.round(growth)));
  const growthLabel = growth >= 70 ? 'HIGH' : growth >= 45 ? 'MODERATE' : 'LOW';

  // Public signals of scam or abuse, from the analyzer and its community votes.
  const scamSignals = [];
  for (const risk of risks) if (SCAM_PATTERNS.test(String(risk?.name || ''))) scamSignals.push({ source: 'analyzer', text: String(risk.name), detail: String(risk.description || '') });
  if (ruggedCreator) scamSignals.push({ source: 'creator', text: 'Creator with rug history', detail: 'The same wallet has already removed liquidity from other tokens.' });
  if (mintAuthority) scamSignals.push({ source: 'contract', text: 'Mint authority open', detail: 'It can mint unlimited tokens at any time.' });
  if (freezeAuthority) scamSignals.push({ source: 'contract', text: 'Freeze authority open', detail: 'It can block selling from your account.' });
  if (insiders > 0) scamSignals.push({ source: 'wallets', text: insiders + ' insider(s)', detail: 'Wallets related to the creator detected by the analyzer.' });
  if (votesDown > votesUp && votesDown >= 3) scamSignals.push({ source: 'community', text: votesDown + ' negative votes', detail: 'Analyzer users flagged this token as suspicious.' });
  if (top10 > 60) scamSignals.push({ source: 'holders', text: 'Top 10 hold ' + top10.toFixed(0) + '%', detail: 'A few wallets can sell everything at once.' });

  const verdict = safety <= 30 ? 'HIGH RISK' : safety <= 55 ? 'MEDIUM' : safety <= 75 ? 'CAUTION' : 'BEST PROFILE';
  return {
    score: safety, verdict, checks, top10, insiders, lpLockedPct, liquidity, holders, ageMinutes,
    decimals: num(report?.token?.decimals) ?? 6,
    creatorPct: creatorPct === null ? null : Number(creatorPct.toFixed(2)),
    liquidityRisk, liquidityLabel,
    growth: { score: growth, label: growthLabel, factors },
    scamSignals: scamSignals.slice(0, 6),
    votes: { up: votesUp, down: votesDown },
    risks: risks.map(risk => ({ name: String(risk?.name || ''), description: String(risk?.description || ''), level: String(risk?.level || '') })).slice(0, 8),
    xSearch: 'https://x.com/search?q=' + encodeURIComponent(pool?.symbol || '')
  };
}

const boostCache = { at: 0, map: new Map() };

async function loadBoosts() {
  if (boostCache.map.size && Date.now() - boostCache.at < 120000) return boostCache.map;
  const map = new Map();
  for (const url of ['https://api.dexscreener.com/token-boosts/latest/v1', 'https://api.dexscreener.com/token-boosts/top/v1']) {
    const feed = await readJson(url, 7000);
    for (const row of Array.isArray(feed) ? feed : []) {
      if (String(row?.chainId || '') !== 'solana') continue;
      const address = String(row?.tokenAddress || '');
      if (!address) continue;
      const amount = num(row?.amount) || 0;
      const total = num(row?.totalAmount) || amount;
      const current = map.get(address);
      if (!current || total > current.total) map.set(address, { amount, total, description: String(row?.description || '').slice(0, 120) });
    }
  }
  boostCache.map = map;
  boostCache.at = Date.now();
  return map;
}

const CATEGORY_RULES = [
  ['AI', /\b(ai|gpt|agent|neural|bot|llm|deepseek)\b/i],
  ['Animal', /(dog|cat|pepe|frog|moon|bear|bull|bird|monkey|puppy|kitty)/i],
  ['Politics', /(trump|biden|maga|vote|president|senate)/i],
  ['Celebrity', /(elon|musk|kanye|taylor|ronaldo|messi)/i],
  ['DeFi', /(swap|finance|defi|dex|lend|yield|stake)/i],
  ['Gaming', /(game|play|quest|arcade)/i],
  ['NFT', /(nft|art|pfp|punk)/i],
  ['Stocks', /(tsla|spx|nasdaq|stock|etf|aapl)/i],
  ['Community', /(dao|community|social|meme)/i]
];

function categoriesFor(seed, boost) {
  const text = String(seed.symbol || '') + ' ' + String(seed.poolName || '');
  const tags = [];
  for (const [tag, pattern] of CATEGORY_RULES) if (pattern.test(text)) tags.push(tag);
  if (/pump/i.test(String(seed.venue || '')) || /pump/i.test(text)) tags.push('pump.fun');
  else if (/meteora/i.test(String(seed.venue || ''))) tags.push('Meteora');
  else if (/raydium/i.test(String(seed.venue || ''))) tags.push('Raydium');
  if (boost) tags.push('Marketing');
  if (!tags.length) tags.push('Memecoin');
  return [...new Set(tags)].slice(0, 4);
}

const TAB_TTL = 60000;
const tabCache = new Map();
const tabCooldown = new Map();
const TAB_LIMIT = 8;

const SOURCES = {
  new: [
    'https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1'
  ],
  trending: [
    'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1'
  ],
  volume: [
    'https://api.geckoterminal.com/api/v2/networks/solana/pools?page=1&sort=h24_volume_usd_desc',
    'https://api.geckoterminal.com/api/v2/networks/solana/pools?page=2&sort=h24_volume_usd_desc'
  ],
  marketcap: [
    'https://api.geckoterminal.com/api/v2/networks/solana/pools?page=1&sort=h24_volume_usd_desc',
    'https://api.geckoterminal.com/api/v2/networks/solana/pools?page=2&sort=h24_volume_usd_desc'
  ]
};

async function loadPools(tab) {
  const urls = SOURCES[tab] || SOURCES.new;
  const pools = [];
  for (const url of urls) {
    const feed = await readJson(url);
    for (const row of feed?.data || []) pools.push(row);
  }
  return pools;
}

function poolSeed(pool) {
  const mint = String(pool?.relationships?.base_token?.data?.id || '').split('_').pop();
  if (!mint) return null;
  const attributes = pool?.attributes || {};
  return {
    mint,
    symbol: poolSymbol(attributes.name),
    poolName: String(attributes.name || ''),
    poolAddress: String(attributes.address || ''),
    createdAt: attributes.pool_created_at || null,
    liquidityUsd: num(attributes.reserve_in_usd),
    fdvUsd: num(attributes.fdv_usd),
    marketCapUsd: num(attributes.market_cap_usd) ?? num(attributes.fdv_usd),
    volume24h: num(attributes.volume_usd?.h24),
    volume1h: num(attributes.volume_usd?.h1),
    priceUsd: num(attributes.base_token_price_usd),
    change5m: num(attributes.price_change_percentage?.m5),
    change1h: num(attributes.price_change_percentage?.h1),
    change24h: num(attributes.price_change_percentage?.h24),
    transactions: attributes.transactions || null
  };
}

async function analyzeSeed(seed, boosts) {
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
  const websites = Array.isArray(pair?.info?.websites) ? pair.info.websites.filter(item => item && item.url).slice(0, 2).map(item => String(item.url)) : [];
  const marketCapUsd = num(pair?.marketCap) ?? num(pair?.fdv) ?? seed.marketCapUsd ?? seed.fdvUsd ?? null;
  const venue = String(pair?.dexId || report?.markets?.[0]?.marketType || '');
  const pairAddress = String(pair?.pairAddress || seed.poolAddress || '');
  const pairs = Array.isArray(dex?.pairs) ? dex.pairs : [];
  const venues = [...new Set(pairs.map(pair => String(pair?.dexId || '')).filter(Boolean))];
  const boost = boosts.get(seed.mint) || null;
  const categories = categoriesFor({ ...seed, venue }, boost);
  return { ...seed, ...audit, marketCapUsd, venue, pairAddress, socials, websites, hasSocials: socials.length > 0, venues, pairsCount: pairs.length, boost, categories };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'GET') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  const url = new URL(request.url);
  const lookupMint = String(url.searchParams.get('mint') || '').trim();
  if (lookupMint) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(lookupMint)) return jsonResponse(request, {error: {message: 'Invalid token address'}}, 400);
    const feed = await readJson('https://api.geckoterminal.com/api/v2/networks/solana/tokens/' + encodeURIComponent(lookupMint) + '/pools?page=1');
    const pools = Array.isArray(feed?.data) ? feed.data : [];
    let seed = null;
    if (pools.length) {
      const best = pools.slice().sort((a, b) => (num(b?.attributes?.reserve_in_usd) || 0) - (num(a?.attributes?.reserve_in_usd) || 0))[0];
      seed = poolSeed(best);
      if (seed) seed.mint = lookupMint;
    }
    if (!seed) {
      const dex = await readJson('https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(lookupMint));
      const pair = Array.isArray(dex?.pairs) ? dex.pairs[0] : null;
      if (pair) seed = {
        mint: lookupMint,
        symbol: String(pair.baseToken?.symbol || pair.baseToken?.name || lookupMint.slice(0, 6)).slice(0, 16),
        poolName: String(pair.baseToken?.name || ''),
        poolAddress: String(pair.pairAddress || ''),
        createdAt: pair.pairCreatedAt ? new Date(Number(pair.pairCreatedAt)).toISOString() : null,
        liquidityUsd: num(pair.liquidity?.usd),
        fdvUsd: num(pair.fdv),
        marketCapUsd: num(pair.marketCap),
        volume24h: num(pair.volume?.h24),
        volume1h: num(pair.volume?.h1),
        priceUsd: num(pair.priceUsd),
        change5m: num(pair.priceChange?.m5),
        change1h: num(pair.priceChange?.h1),
        change24h: num(pair.priceChange?.h24)
      };
    }
    if (!seed) return jsonResponse(request, {observedAt: Date.now(), tab: 'lookup', lookupMint, items: [], error: 'token-not-found'}, 404);
    const boosts = await loadBoosts();
    const item = await analyzeSeed(seed, boosts);
    return jsonResponse(request, {observedAt: Date.now(), tab: 'lookup', lookupMint, items: [item], coverage: {requested: 1, analyzed: 1}, disclaimer: 'Automatic public-data analysis. It does not guarantee a token is safe or profitable.'});
  }
  const searchQuery = String(url.searchParams.get('q') || '').trim();
  if (searchQuery) {
    if (!/^[A-Za-z0-9 ._-]{2,32}$/.test(searchQuery)) return jsonResponse(request, {error:{message:'Invalid search query'}}, 400);
    const search = await readJson('https://api.geckoterminal.com/api/v2/search/pools?network=solana&query=' + encodeURIComponent(searchQuery) + '&page=1', 9000);
    const pools = (Array.isArray(search?.data) ? search.data : [])
      .filter(pool => String(pool?.relationships?.base_token?.data?.id || '').startsWith('solana_'))
      .sort((a, b) => (num(b?.attributes?.reserve_in_usd) || 0) - (num(a?.attributes?.reserve_in_usd) || 0));
    const seed = pools.length ? poolSeed(pools[0]) : null;
    if (!seed) return jsonResponse(request, {observedAt: Date.now(), tab: 'search', query: searchQuery, items: [], coverage:{requested:1, analyzed:0}, error:'token-not-found'}, 404);
    const boosts = await loadBoosts();
    const item = await analyzeSeed(seed, boosts);
    return jsonResponse(request, {observedAt: Date.now(), tab: 'search', query: searchQuery, items: [item], coverage:{requested:1, analyzed:1}, disclaimer:'Automatic public-data analysis. It does not guarantee a token is safe or profitable.'});
  }
  const tab = ['new', 'trending', 'volume', 'marketcap'].includes(String(url.searchParams.get('tab'))) ? String(url.searchParams.get('tab')) : 'new';
  const fresh = url.searchParams.get('fresh') === '1';
  const now = Date.now();
  const cached = tabCache.get(tab);
  if (!fresh && cached && now - cached.at < TAB_TTL) return jsonResponse(request, { ...cached.body, cached: true });
  const cooldown = tabCooldown.get(tab) || 0;
  if (!fresh && cooldown > now && cached) return jsonResponse(request, { ...cached.body, cached: true, cooling: true });

  let pools = [];
  try { pools = await loadPools(tab); } catch { pools = []; }
  if (!pools.length) {
    tabCooldown.set(tab, now + 120000);
    if (cached) return jsonResponse(request, { ...cached.body, cached: true, cooling: true });
    return jsonResponse(request, { observedAt: now, tab, items: [], error: 'feed-unavailable' });
  }

  const byMint = new Map();
  for (const pool of pools) {
    const seed = poolSeed(pool);
    if (!seed || byMint.has(seed.mint)) continue;
    byMint.set(seed.mint, seed);
  }
  let seeds = [...byMint.values()];
  if (tab === 'marketcap') seeds.sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0));
  else if (tab === 'volume') seeds.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  seeds = seeds.slice(0, TAB_LIMIT);

  const boosts = await loadBoosts();
  const items = await Promise.all(seeds.map(seed => analyzeSeed(seed, boosts)));

  const sorted = items.sort((a, b) => b.score - a.score);
  const body = { observedAt: now, tab, items: sorted, coverage: {requested: seeds.length, analyzed: sorted.length}, disclaimer: 'Automatic public-data analysis. It does not guarantee a token is safe or profitable.' };
  tabCache.set(tab, { at: now, body });
  return jsonResponse(request, body);
}
