import {corsHeaders, jsonResponse} from '../lib/server.js';
import {listDevices, readWatchlist, readSnapshot, writeSnapshot, recentlyNotified, markNotified, logAlert} from '../lib/sniper-alerts-store.js';
export const config = { runtime: 'edge' };

// Server side watcher: compares each watched token with its last snapshot and notifies.
const DEX = 'https://api.dexscreener.com/latest/dex/tokens/';
const SOCIAL_INTERVAL = 10 * 60 * 1000;
const SCAM_INTERVAL = 30 * 60 * 1000;

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

async function readJson(url, timeout = 8000) {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; JamdDmajWatcher/1.0)' }, signal: AbortSignal.timeout(timeout) });
    return await response.json().catch(() => null);
  } catch { return null; }
}

async function fetchPairs(mints) {
  const map = new Map();
  for (let index = 0; index < mints.length; index += 25) {
    const chunk = mints.slice(index, index + 25);
    const data = await readJson(DEX + chunk.join(','), 9000);
    for (const pair of Array.isArray(data?.pairs) ? data.pairs : []) {
      const mint = String(pair?.baseToken?.address || '');
      if (!chunk.includes(mint)) continue;
      const current = map.get(mint) || { pairs: 0, venues: new Set() };
      current.pairs += 1;
      if (pair?.dexId) current.venues.add(String(pair.dexId));
      const liquidity = num(pair?.liquidity?.usd) || 0;
      if (!current.liquidityUsd || liquidity > current.liquidityUsd) {
        current.priceUsd = num(pair?.priceUsd);
        current.liquidityUsd = liquidity;
        current.fdvUsd = num(pair?.fdv);
        current.marketCapUsd = num(pair?.marketCap);
        current.change5m = num(pair?.priceChange?.m5);
        current.change1h = num(pair?.priceChange?.h1);
        current.buys5m = num(pair?.txns?.m5?.buys);
        current.sells5m = num(pair?.txns?.m5?.sells);
      }
      map.set(mint, current);
    }
  }
  for (const [mint, value] of map) value.venues = [...value.venues];
  return map;
}

async function boostMap() {
  const map = new Map();
  for (const url of ['https://api.dexscreener.com/token-boosts/latest/v1', 'https://api.dexscreener.com/token-boosts/top/v1']) {
    const feed = await readJson(url, 7000);
    for (const row of Array.isArray(feed) ? feed : []) {
      if (String(row?.chainId || '') !== 'solana') continue;
      const address = String(row?.tokenAddress || '');
      const total = num(row?.totalAmount) || num(row?.amount) || 0;
      if (address && total > (map.get(address) || 0)) map.set(address, total);
    }
  }
  return map;
}

async function xProfile(handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!clean) return null;
  const data = await readJson('https://api.fxtwitter.com/' + encodeURIComponent(clean), 7000);
  const user = data?.user;
  if (!user) return { exists: false };
  return { exists: true, tweets: num(user.tweets), followers: num(user.followers) };
}

async function scamMentions(symbol) {
  const query = encodeURIComponent('"' + String(symbol || '').replace(/"/g, '') + '" scam OR rug');
  const response = await fetch('https://www.bing.com/search?q=' + query + '&format=rss', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; JamdDmajWatcher/1.0)' }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!response || !response.ok) return null;
  const text = await response.text().catch(() => '');
  const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => match[1]);
  let scam = 0;
  for (const item of items) {
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    if (/scam|rug|fraud|estafa|honeypot/i.test(title)) scam++;
  }
  return { total: items.length, scam };
}

function destinations() {
  const configured = String(process.env.TELEGRAM_SNIPER_CHATS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (configured.length) return configured;
  return [String(process.env.TELEGRAM_CHAT_ID || '').trim()].filter(Boolean);
}

async function sendTelegramTo(target, text) {
  const [chat, thread] = String(target).split(':');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chat) return false;
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true, ...(thread ? { message_thread_id: Number(thread) } : {}) }),
      signal: AbortSignal.timeout(8000)
    });
    return response.ok;
  } catch { return false; }
}

async function sendTelegram(text) {
  const targets = destinations();
  const results = [];
  for (const chat of targets) results.push({ chat, sent: await sendTelegramTo(chat, text) });
  return { any: results.some(item => item.sent), results };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || process.env.JAMDDMAJ_CRON_SECRET || '');
  const provided = request.headers.get('x-jamd-cron') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const url = new URL(request.url);
  if (!secret || (provided !== secret && url.searchParams.get('secret') !== secret)) {
    return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  }
  if (url.searchParams.get('test') === '1') {
    const delivery = await sendTelegram('Prueba de alertas de JamdDmaj Sniper. Si recibes esto, la vigilancia en la nube funciona.');
    return jsonResponse(request, { test: true, telegram: delivery.any, chats: delivery.results });
  }

  const devices = await listDevices();
  const watchByMint = new Map();
  for (const device of devices) {
    const entries = await readWatchlist(device);
    for (const entry of entries) if (entry?.mint) watchByMint.set(entry.mint, entry);
  }
  const mints = [...watchByMint.keys()].slice(0, 75);
  if (!mints.length) return jsonResponse(request, { observedAt: Date.now(), watched: 0, alerts: [] });

  const [pairs, boosts] = await Promise.all([fetchPairs(mints), boostMap()]);
  const alerts = [];

  for (const mint of mints) {
    const info = pairs.get(mint);
    if (!info) continue;
    const entry = watchByMint.get(mint) || {};
    const symbol = entry.symbol || mint.slice(0, 4);
    const previous = await readSnapshot(mint);

    if (previous) {
      const beforeLiquidity = Number(previous.liquidityUsd) || 0;
      const nowLiquidity = Number(info.liquidityUsd) || 0;
      const drain = beforeLiquidity > 0 ? ((nowLiquidity - beforeLiquidity) / beforeLiquidity) * 100 : null;
      const drop5 = Number(info.change5m);
      const sells = Number(info.sells5m) || 0;
      const buys = Number(info.buys5m) || 0;

      const samePool = !previous.pool || !entry.pool || previous.pool === entry.pool;
      const seriousPool = beforeLiquidity >= 3000;
      const priceConfirmed = (Number.isFinite(drop5) && drop5 <= -15) || (Number.isFinite(Number(info.change1h)) && Number(info.change1h) <= -25);
      const drained = samePool && seriousPool && drain !== null && drain <= -45 && priceConfirmed;
      const crashed = Number.isFinite(drop5) && drop5 <= -60 && sells > buys && nowLiquidity < beforeLiquidity * 0.4;
      if ((drained || crashed) && !(await recentlyNotified(mint, 'rug'))) {
        const detail = [];
        if (drain !== null) detail.push('liquidez ' + drain.toFixed(0) + '%');
        if (Number.isFinite(drop5)) detail.push('precio ' + drop5.toFixed(0) + '% 5m');
        if (sells || buys) detail.push(sells + ' ventas / ' + buys + ' compras');
        alerts.push({ mint, symbol, kind: 'rug', text: 'RUG ' + symbol + ': ' + detail.join(' · ') });
        await markNotified(mint, 'rug', 1200);
      } else if (Number.isFinite(drop5) && drop5 >= 40 && !(await recentlyNotified(mint, 'pump'))) {
        alerts.push({ mint, symbol, kind: 'pump', text: 'SUBIDA ' + symbol + ': +' + drop5.toFixed(0) + '% en 5 min · liquidez ' + Math.round(nowLiquidity) + ' USD' });
        await markNotified(mint, 'pump', 1800);
      }

      const beforeVenues = Array.isArray(previous.venues) ? previous.venues : [];
      const freshVenues = Array.isArray(info.venues) ? info.venues.filter(venue => !beforeVenues.includes(venue)) : [];
      if (beforeVenues.length && freshVenues.length && freshVenues.length <= 3 && !(await recentlyNotified(mint, 'listing'))) {
        alerts.push({ mint, symbol, kind: 'listing', text: 'NUEVO MERCADO ' + symbol + ': ' + freshVenues.join(', ') + ' (ahora ' + info.venues.length + ' en total)' });
        await markNotified(mint, 'listing', 7200);
      }

      const beforeBoost = Number(previous.boost) || 0;
      const nowBoost = Number(boosts.get(mint)) || 0;
      if (nowBoost > beforeBoost && !(await recentlyNotified(mint, 'boost'))) {
        alerts.push({ mint, symbol, kind: 'boost', text: 'MARKETING ' + symbol + ': boost activo por ' + nowBoost + ' USD' });
        await markNotified(mint, 'boost', 7200);
      }
    }

    // Social checks are slower on purpose: at most every ten minutes per token.
    const lastSocial = Number(previous?.socialAt) || 0;
    if (Date.now() - lastSocial > SOCIAL_INTERVAL && entry.handle && !(await recentlyNotified(mint, 'x'))) {
      const profile = await xProfile(entry.handle);
      if (profile) {
        if (previous?.x?.exists && !profile.exists) {
          alerts.push({ mint, symbol, kind: 'x', text: 'X SUSPENDIDA ' + symbol + ': la cuenta @' + entry.handle + ' desaparecio' });
          await markNotified(mint, 'x', 7200);
        } else if (profile.exists && Number.isFinite(profile.tweets) && Number.isFinite(previous?.x?.tweets) && profile.tweets > previous.x.tweets) {
          alerts.push({ mint, symbol, kind: 'x', text: 'PUBLICACION ' + symbol + ': el dev publico ' + (profile.tweets - previous.x.tweets) + ' mensaje(s) en X (@' + entry.handle + ')' });
          await markNotified(mint, 'x', 1800);
        }
      }
      await writeSnapshot(mint, { ...(previous || {}), priceUsd: info.priceUsd, pool: entry.pool || previous?.pool || '', liquidityUsd: info.liquidityUsd, pairs: info.pairs, venues: info.venues, boost: Number(boosts.get(mint)) || 0, socialAt: Date.now(), x: profile || previous?.x || null });
      continue;
    }

    const lastScam = Number(previous?.scamAt) || 0;
    if (Date.now() - lastScam > SCAM_INTERVAL && symbol && !(await recentlyNotified(mint, 'scam'))) {
      const mentions = await scamMentions(symbol);
      if (mentions && mentions.scam >= 3 && (!previous?.scam || mentions.scam > previous.scam)) {
        alerts.push({ mint, symbol, kind: 'scam', text: 'ACUSACIONES ' + symbol + ': ' + mentions.scam + ' resultados publicos lo llaman scam' });
        await markNotified(mint, 'scam', 3600);
      }
      await writeSnapshot(mint, { ...(previous || {}), priceUsd: info.priceUsd, pool: entry.pool || previous?.pool || '', liquidityUsd: info.liquidityUsd, pairs: info.pairs, venues: info.venues, boost: Number(boosts.get(mint)) || 0, scamAt: Date.now(), scam: mentions?.scam || previous?.scam || 0 });
      continue;
    }

    await writeSnapshot(mint, {
      ...(previous || {}),
      priceUsd: info.priceUsd,
      pool: entry.pool || previous?.pool || '',
      liquidityUsd: info.liquidityUsd,
      pairs: info.pairs,
      venues: info.venues,
      boost: Number(boosts.get(mint)) || 0,
      socialAt: lastSocial,
      scamAt: lastScam,
      x: previous?.x || null,
      scam: previous?.scam || 0
    });
  }

  const delivered = [];
  for (const alert of alerts) {
    const prefix = alert.kind === 'rug' ? '🚨 ' : alert.kind === 'pump' ? '📈 ' : alert.kind === 'listing' ? '🔔 ' : alert.kind === 'boost' ? '📣 ' : alert.kind === 'x' ? '💬 ' : '⚠️ ';
    const delivery = await sendTelegram(prefix + alert.text + '\nhttps://www.jamddmaj.com/sniper.html');
    delivered.push({ ...alert, telegram: delivery.any, chats: delivery.results });
    await logAlert({ ...alert, at: Date.now(), telegram: delivery.any, chats: delivery.results });
  }

  return jsonResponse(request, { observedAt: Date.now(), watched: mints.length, devices: devices.length, alerts: delivered });
}
