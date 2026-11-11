import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Social watch: X profile stats, community votes and public search mentions.
const cache = new Map();
const TTL = 90000;

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const days = value => { const time = Date.parse(value || ''); return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 86400000)) : null; };

async function get(url, timeout = 8000, accept = 'application/json') {
  try {
    const response = await fetch(url, { headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; JamdDmajSniper/1.0)' }, signal: AbortSignal.timeout(timeout) });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch { return { ok: false, status: 0, text: '' }; }
}

function decode(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function xProfile(handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!clean) return { handle: null, exists: false };
  const result = await get('https://api.fxtwitter.com/' + encodeURIComponent(clean));
  let profile = null;
  try { profile = JSON.parse(result.text)?.user || null; } catch {}
  if (!profile) return { handle: clean, exists: false };
  return {
    handle: clean,
    exists: true,
    followers: num(profile.followers),
    tweets: num(profile.tweets),
    joinedDays: days(profile.joined),
    verified: Boolean(profile.verification?.verified)
  };
}

async function votes(mint) {
  const result = await get('https://api.rugcheck.xyz/v1/tokens/' + mint + '/votes', 6000);
  try { const data = JSON.parse(result.text); return { up: num(data.up) || 0, down: num(data.down) || 0 }; } catch { return { up: 0, down: 0 }; }
}

async function mentions(symbol) {
  const query = encodeURIComponent('"' + String(symbol || '').replace(/"/g, '') + '" scam OR rug');
  const result = await get('https://www.bing.com/search?q=' + query + '&format=rss&count=20', 8000, 'application/rss+xml,text/xml');
  if (!result.ok) return { count: 0, samples: [], available: false };
  const items = [...result.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => match[1]);
  const samples = [];
  let scam = 0;
  for (const item of items) {
    const title = decode((item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = decode((item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    if (!title) continue;
    if (/scam|rug|fraud|estafa|honeypot/i.test(title)) scam++;
    if (samples.length < 4) samples.push({ title: title.slice(0, 140), link });
  }
  return { count: items.length, scam, samples, available: true };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const items = (Array.isArray(body?.items) ? body.items : []).filter(entry => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(entry?.mint || ''))).slice(0, 8);
  const response = {};
  await Promise.all(items.map(async entry => {
    const key = entry.mint;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) { response[key] = hit.value; return; }
    const [profile, vote, search] = await Promise.all([xProfile(entry.handle), votes(entry.mint), mentions(entry.symbol)]);
    const value = { observedAt: Date.now(), x: profile, votes: vote, search };
    cache.set(key, { at: Date.now(), value });
    response[key] = value;
  }));
  return jsonResponse(request, { observedAt: Date.now(), items: response });
}
