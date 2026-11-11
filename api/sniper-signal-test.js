import {corsHeaders, jsonResponse} from '../lib/server.js';
import {sendSignalMirror} from './telegram.js';
import {sendTelegram as sendScannerSignal} from '../lib/pro-signals.js';
export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || '');
  const provided = request.headers.get('x-jamd-cron') || (new URL(request.url).searchParams.get('secret') || '');
  if (!secret || provided !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const primary = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  const channel = String(process.env.TELEGRAM_SIGNAL_CHANNEL_ID || '').trim();
  if (!token) return jsonResponse(request, { error: { message: 'NO_TOKEN' } }, 503);
  const text = '🧪 <b>Prueba de senal del bot</b>\nSi ves este mensaje, las senales del bot llegaran aqui.\nBTC LONG · ejemplo';
  const result = await sendSignalMirror(token, primary, channel, text);
  let scanner = null;
  try {
    const payload = await sendScannerSignal(token, channel || primary, '🧪 <b>Prueba de senal del scanner</b>\nRuta del scanner: canal + tema Trade Signals.');
    scanner = { sent: true, messageId: payload?.result?.message_id ?? null };
  } catch (error) {
    scanner = { sent: false, error: String(error?.message || error).slice(0, 120) };
  }
  return jsonResponse(request, { ok: true, result, scanner });
}
