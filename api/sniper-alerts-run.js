import {corsHeaders, jsonResponse} from '../lib/server.js';
import {listDevices, readWatchlist, readSnapshot, writeSnapshot, recentlyNotified, markNotified} from '../lib/sniper-alerts-store.js';
export const config = { runtime: 'edge' };

// Server side watcher: compares each watched token with its last snapshot and notifies.
const DEX = 'https://api.dexscreener.com/latest/dex/tokens/';

const num = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

async function fetchPairs(mints) {
  const map = new Map();
  for (let index = 0; index < mints.length; index += 25) {
    const chunk = mints.slice(index, index + 25);
    try {
      const response = await fetch(DEX + chunk.join(','), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
      const data = await response.json().catch(() => null);
      for (const pair of Array.isArray(data?.pairs) ? data.pairs : []) {
        const mint = String(pair?.baseToken?.address || '');
        if (!chunk.includes(mint)) continue;
        const current = map.get(mint);
        const liquidity = num(pair?.liquidity?.usd) || 0;
        if (!current || liquidity > (num(current.liquidityUsd) || 0)) {
          map.set(mint, {
            priceUsd: num(pair?.priceUsd),
            liquidityUsd: liquidity,
            fdvUsd: num(pair?.fdv),
            marketCapUsd: num(pair?.marketCap),
            change5m: num(pair?.priceChange?.m5),
            change1h: num(pair?.priceChange?.h1),
            buys5m: num(pair?.txns?.m5?.buys),
            sells5m: num(pair?.txns?.m5?.sells)
          });
        }
      }
    } catch {}
  }
  return map;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000)
    });
    return response.ok;
  } catch { return false; }
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
    const sent = await sendTelegram('Prueba de alertas de JamdDmaj Sniper. Si recibes esto, la vigilancia en la nube funciona.');
    return jsonResponse(request, { test: true, telegram: sent });
  }

  const devices = await listDevices();
  const watchByMint = new Map();
  for (const device of devices) {
    const entries = await readWatchlist(device);
    for (const entry of entries) if (entry?.mint) watchByMint.set(entry.mint, entry);
  }
  const mints = [...watchByMint.keys()].slice(0, 75);
  if (!mints.length) return jsonResponse(request, { observedAt: Date.now(), watched: 0, alerts: [] });

  const pairs = await fetchPairs(mints);
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
      const rugged = (drain !== null && drain <= -45) || (Number.isFinite(drop5) && drop5 <= -60 && sells >= buys);
      const pumped = Number.isFinite(drop5) && drop5 >= 40;
      if (rugged && !(await recentlyNotified(mint, 'rug'))) {
        const detail = [];
        if (drain !== null) detail.push('liquidez ' + drain.toFixed(0) + '%');
        if (Number.isFinite(drop5)) detail.push('precio ' + drop5.toFixed(0) + '% 5m');
        if (sells || buys) detail.push(sells + ' ventas / ' + buys + ' compras');
        alerts.push({ mint, symbol, kind: 'rug', text: 'RUG ' + symbol + ': ' + detail.join(' · ') });
        await markNotified(mint, 'rug', 1200);
      } else if (pumped && !(await recentlyNotified(mint, 'pump'))) {
        alerts.push({ mint, symbol, kind: 'pump', text: 'SUBIDA ' + symbol + ': +' + drop5.toFixed(0) + '% en 5 min · liquidez ' + Math.round(nowLiquidity) + ' USD' });
        await markNotified(mint, 'pump', 1800);
      }
    }
    await writeSnapshot(mint, { priceUsd: info.priceUsd, liquidityUsd: info.liquidityUsd, at: Date.now() });
  }

  const delivered = [];
  for (const alert of alerts) {
    const sent = await sendTelegram((alert.kind === 'rug' ? '🚨 ' : '📈 ') + alert.text + '\nhttps://www.jamddmaj.com/sniper.html');
    delivered.push({ ...alert, telegram: sent });
  }

  return jsonResponse(request, { observedAt: Date.now(), watched: mints.length, devices: devices.length, alerts: delivered });
}
