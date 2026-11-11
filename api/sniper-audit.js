import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Deep audit for one token: its website, its X account and a sample of recent on-chain trades.
const cache = new Map();
const TTL = 5 * 60 * 1000;
const RPC = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const days = timestamp => { const time = Date.parse(timestamp || ''); return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 86400000)) : null; };

async function text(url, timeout = 8000, headers = {}) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; JamdDmajSniper/1.0)', accept: 'text/html,application/json', ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
    return { ok: response.ok, status: response.status, body: await response.text(), url: response.url };
  } catch (error) { return { ok: false, status: 0, body: '', url }; }
}

async function rpcCall(method, params, timeout = 8000) {
  for (const endpoint of RPC) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(timeout) });
      const data = await response.json().catch(() => null);
      if (data && data.result) return data.result;
    } catch {}
  }
  return null;
}

function websiteAudit(page, symbol, socials) {
  const html = String(page.body || '');
  const title = (html.match(/<title[^>]*>([^<]{1,160})<\/title>/i) || [])[1] || '';
  const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,240})["']/i) || [])[1] || '';
  const domain = (() => { try { return new URL(page.url || '').hostname.replace(/^www\./, ''); } catch { return null; } })();
  const flags = [];
  if (!page.ok) flags.push({ level: 'high', text: 'La web no responde (' + (page.status || 'sin respuesta') + ')' });
  if (page.ok && !title) flags.push({ level: 'medium', text: 'La web no tiene titulo' });
  if (page.ok && symbol && !html.toLowerCase().includes(String(symbol).toLowerCase())) flags.push({ level: 'medium', text: 'La web no menciona el simbolo ' + symbol });
  if (/connect wallet|conectar wallet|claim|airdrop|presale|preventa/i.test(html)) flags.push({ level: 'medium', text: 'La web pide conectar wallet, reclamar o preventa' });
  const linksX = socials.filter(social => /twitter|x/i.test(String(social.type || ''))).map(social => String(social.handle).toLowerCase());
  const pageHasX = linksX.some(handle => html.toLowerCase().includes(handle));
  if (linksX.length && !pageHasX) flags.push({ level: 'medium', text: 'La web no enlaza la cuenta de X del token' });
  return { url: page.url || null, domain, ok: page.ok, status: page.status, title, description, hasXLink: pageHasX, flags };
}

async function xAudit(handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!clean) return { handle: null, exists: false, flags: [{ level: 'low', text: 'El token no publica cuenta de X' }] };
  const result = await text('https://api.fxtwitter.com/' + encodeURIComponent(clean), 7000, { accept: 'application/json' });
  let profile = null;
  try { profile = JSON.parse(result.body)?.user || null; } catch {}
  if (!profile) return { handle: clean, exists: false, flags: [{ level: 'high', text: 'La cuenta @' + clean + ' no existe o no es accesible' }] };
  const joinedDays = days(profile.joined || profile.created_at);
  const followers = num(profile.followers);
  const flags = [];
  if (joinedDays !== null && joinedDays < 14) flags.push({ level: 'critical', text: 'Cuenta creada hace ' + joinedDays + ' dias' });
  else if (joinedDays !== null && joinedDays < 60) flags.push({ level: 'medium', text: 'Cuenta con ' + joinedDays + ' dias de antiguedad' });
  if (followers !== null && followers < 250) flags.push({ level: 'high', text: 'Solo ' + followers + ' seguidores' });
  if (profile.verification?.verified === false && followers !== null && followers > 10000) flags.push({ level: 'low', text: 'Muchos seguidores sin verificacion' });
  return { handle: clean, exists: true, name: profile.name || '', joinedDays, followers, tweets: num(profile.tweets), verified: Boolean(profile.verification?.verified), flags };
}

async function chainAudit(mint, pool) {
  const signatures = await rpcCall('getSignaturesForAddress', [pool, { limit: 18 }]);
  if (!Array.isArray(signatures) || !signatures.length) return { sampled: 0, buys: 0, sells: 0, uniqueTraders: 0, solVolume: 0, burns: 0, burnAmount: 0, flags: [{ level: 'medium', text: 'Sin actividad reciente medible' }] };
  const results = [];
  const queue = signatures.map(item => item.signature).slice(0, 18);
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const signature = queue.shift();
      const tx = await rpcCall('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
      if (tx) results.push(tx);
    }
  });
  await Promise.all(workers);

  let buys = 0, sells = 0, burns = 0, burnAmount = 0, solVolume = 0;
  const traders = new Set();
  for (const tx of results) {
    const meta = tx?.meta;
    if (!meta) continue;
    const keys = tx?.transaction?.message?.accountKeys || [];
    const pre = new Map();
    const post = new Map();
    for (const entry of meta.preTokenBalances || []) if (entry.mint === mint) pre.set(entry.owner, num(entry.uiTokenAmount?.uiAmount) || 0);
    for (const entry of meta.postTokenBalances || []) if (entry.mint === mint) post.set(entry.owner, num(entry.uiTokenAmount?.uiAmount) || 0);
    let bestOwner = null, bestDelta = 0;
    for (const owner of new Set([...pre.keys(), ...post.keys()])) {
      const delta = (post.get(owner) || 0) - (pre.get(owner) || 0);
      if (Math.abs(delta) > Math.abs(bestDelta)) { bestDelta = delta; bestOwner = owner; }
    }
    if (bestOwner && bestOwner !== pool) {
      traders.add(bestOwner);
      if (bestDelta > 0) buys++; else if (bestDelta < 0) sells++;
      const index = keys.findIndex(key => (key.pubkey || key) === bestOwner);
      if (index >= 0 && bestDelta > 0) {
        const spent = (meta.preBalances?.[index] ?? 0) - (meta.postBalances?.[index] ?? 0);
        if (spent > 0) solVolume += spent / 1e9;
      }
    }
    for (const instruction of tx?.transaction?.message?.instructions || []) {
      const type = String(instruction?.parsed?.type || '').toLowerCase();
      if (type === 'burn' || type === 'burnchecked') {
        burns++;
        const amount = num(instruction?.parsed?.info?.amount) || num(instruction?.parsed?.info?.tokenAmount?.amount) || 0;
        burnAmount += amount;
      }
    }
    const logs = (meta.logMessages || []).join(' ');
    if (/instruction: burn/i.test(logs)) burns++;
  }
  const flags = [];
  if (sells > buys * 2 && sells > 3) flags.push({ level: 'high', text: 'Presion vendedora: ' + sells + ' ventas frente a ' + buys + ' compras' });
  if (sells > 0 && buys === 0) flags.push({ level: 'critical', text: 'Sin compras en la muestra: solo ventas' });
  if (burns > 0) flags.push({ level: 'low', text: burns + ' quema(s) de tokens detectadas' });
  if (traders.size > 0 && traders.size <= 3 && results.length >= 8) flags.push({ level: 'high', text: 'Solo ' + traders.size + ' cartera(s) operando' });
  return { sampled: results.length, buys, sells, uniqueTraders: traders.size, solVolume: Number(solVolume.toFixed(3)), burns, burnAmount, flags };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const mint = String(body?.mint || '');
  const pool = String(body?.poolAddress || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return jsonResponse(request, { error: { message: 'Invalid mint' } }, 400);
  const key = mint + ':' + pool;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return jsonResponse(request, { ...hit.value, cached: true });

  const symbol = String(body?.symbol || '');
  const websites = Array.isArray(body?.websites) ? body.websites.filter(Boolean).slice(0, 1) : [];
  const socials = Array.isArray(body?.socials) ? body.socials.slice(0, 4) : [];
  const xHandle = (socials.find(social => /twitter|x/i.test(String(social?.type || ''))) || {}).handle || null;

  const page = websites.length ? await text(websites[0]) : null;
  const website = page ? websiteAudit(page, symbol, socials) : { url: null, ok: false, flags: [{ level: 'high', text: 'El token no publica web' }] };
  const [x, chain] = await Promise.all([xAudit(xHandle), /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool) ? chainAudit(mint, pool) : Promise.resolve({ sampled: 0, buys: 0, sells: 0, uniqueTraders: 0, solVolume: 0, burns: 0, burnAmount: 0, flags: [{ level: 'medium', text: 'Sin direccion de pool para revisar la cadena' }] })]);

  const penalties = [...website.flags, ...x.flags, ...chain.flags];
  const criticals = penalties.filter(item => item.level === 'critical').length;
  const highs = penalties.filter(item => item.level === 'high').length;
  const value = { observedAt: Date.now(), website, x, chain, penalties, penaltyScore: Math.min(100, criticals * 25 + highs * 12) };
  cache.set(key, { at: Date.now(), value });
  return jsonResponse(request, value);
}
