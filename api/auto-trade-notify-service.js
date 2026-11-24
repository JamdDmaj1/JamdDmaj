import {jsonResponse} from '../lib/server.js';

export const config = {runtime: 'edge'};

const EVENTS = new Set(['OPEN', 'CLOSE']);

function amount(units) {
  const text = String(units || '0').padStart(7, '0');
  const fraction = text.slice(-6).replace(/0+$/, '');
  return text.slice(0, -6) + (fraction ? '.' + fraction : '');
}

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse(request, {error: {code: 'method-not-allowed'}}, 405);
  const secret = String(process.env.JAMDDMAJ_AUTO_NOTIFY_SECRET || '').trim();
  const provided = String(request.headers.get('x-jamddmaj-auto-notify') || '').trim();
  if (!secret || provided !== secret) return jsonResponse(request, {error: {code: 'unauthorized'}}, 401);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, {error: {code: 'invalid-event'}}, 400); }
  const event = String(body?.event || '').toUpperCase();
  const symbol = String(body?.symbol || '').toUpperCase();
  const side = String(body?.side || '').toUpperCase();
  const margin = String(body?.marginUsdcUnits || '0');
  const entry = String(body?.entryPriceUsd || '0');
  const sl = String(body?.slUsdcUnits || '');
  const tp = String(body?.tp1UsdcUnits || '');
  const exit = String(body?.exitPriceUsd || '');
  const pnl = String(body?.pnlUsdcUnits || '');
  if (!EVENTS.has(event) || !/^[A-Z0-9]{2,16}$/.test(symbol) || !['LONG', 'SHORT'].includes(side)
    || !/^(0|[1-9][0-9]{0,15})$/.test(margin) || !/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,8})?$/.test(entry)
    || (sl && !/^(0|[1-9][0-9]{0,15})$/.test(sl)) || (tp && !/^(0|[1-9][0-9]{0,15})$/.test(tp))
    || (exit && !/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,8})?$/.test(exit)) || (pnl && !/^-?(0|[1-9][0-9]{0,15})$/.test(pnl))) {
    return jsonResponse(request, {error: {code: 'invalid-event'}}, 400);
  }
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_AUTOTRADES_CHAT_ID || '').trim();
  const threadId = String(process.env.TELEGRAM_AUTOTRADES_THREAD_ID || '').trim();
  if (!botToken || !chatId) return jsonResponse(request, {error: {code: 'automatic-trades-chat-missing'}}, 503);
  const icon = event === 'OPEN' ? '🟢' : '⚪';
  const title = event === 'OPEN' ? 'AUTO OPEN' : 'AUTO CLOSED';
  const levels = [sl ? 'SL: ' + (Number(sl) / 1e6) + ' USD' : '', tp ? 'TP: ' + (Number(tp) / 1e6) + ' USD' : ''].filter(Boolean).join(' · ');
  const closed = event === 'CLOSE' ? [exit ? 'Exit: ' + exit + ' USD' : '', pnl ? 'PnL: ' + (Number(pnl) / 1e6).toFixed(2) + ' USDC' : ''].filter(Boolean).join(' · ') : '';
  const text = `${icon} Automatic Trades · ${title}\n${symbol} ${side}\nMargin: ${amount(margin)} USDC\nEntry: ${entry} USD${levels ? '\n' + levels : ''}${closed ? '\n' + closed : ''}\nJamdDmaj · Not financial advice.`;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({chat_id: chatId, ...(threadId ? {message_thread_id: Number(threadId)} : {}), text, disable_web_page_preview: true})
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) return jsonResponse(request, {error: {code: 'telegram-unavailable'}}, 502);
    return jsonResponse(request, {ok: true});
  } catch {
    return jsonResponse(request, {error: {code: 'telegram-unavailable'}}, 502);
  }
}
