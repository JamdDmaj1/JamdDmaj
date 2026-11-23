import {jsonResponse} from '../lib/server.js';

export const config = {runtime: 'edge'};

const EVENTS = new Set(['OPEN', 'CLOSE']);

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse(request, {error: {code: 'method-not-allowed'}}, 405);
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return jsonResponse(request, {error: {code: 'login-required'}}, 401);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, {error: {code: 'invalid-event'}}, 400); }
  const event = String(body?.event || '').toUpperCase();
  const symbol = String(body?.symbol || '').toUpperCase();
  const side = String(body?.side || '').toUpperCase();
  const margin = String(body?.marginUsdcUnits || '0');
  const entry = String(body?.entryPriceUsd || '0');
  if (!EVENTS.has(event) || !/^[A-Z0-9]{2,16}$/.test(symbol) || !['LONG', 'SHORT'].includes(side)
    || !/^(0|[1-9][0-9]{0,15})$/.test(margin) || !/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,8})?$/.test(entry)) {
    return jsonResponse(request, {error: {code: 'invalid-event'}}, 400);
  }
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_AUTOTRADES_CHAT_ID || '').trim();
  if (!botToken || !chatId) return jsonResponse(request, {error: {code: 'automatic-trades-chat-missing'}}, 503);
  // Verify the session before allowing a message to a private group.
  try {
    const identity = await fetch('https://www.jamddmaj.com/api/perps-identity', {
      headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'},
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    const data = await identity.json().catch(() => null);
    if (!identity.ok || data?.ok !== true) return jsonResponse(request, {error: {code: 'login-required'}}, 401);
  } catch {
    return jsonResponse(request, {error: {code: 'identity-unavailable'}}, 503);
  }
  const amount = (units) => {
    const text = units.padStart(7, '0');
    const fraction = text.slice(-6).replace(/0+$/, '');
    return text.slice(0, -6) + (fraction ? '.' + fraction : '');
  };
  const icon = event === 'OPEN' ? '🟢' : '⚪';
  const title = event === 'OPEN' ? 'AUTO OPEN' : 'AUTO CLOSED';
  const text = `${icon} Automatic Trades · ${title}\n${symbol} ${side}\nMargin: ${amount(margin)} USDC\nEntry: ${entry} USD\nJamdDmaj · Not financial advice.`;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({chat_id: chatId, text, disable_web_page_preview: true})
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) return jsonResponse(request, {error: {code: 'telegram-unavailable'}}, 502);
    return jsonResponse(request, {ok: true});
  } catch {
    return jsonResponse(request, {error: {code: 'telegram-unavailable'}}, 502);
  }
}
