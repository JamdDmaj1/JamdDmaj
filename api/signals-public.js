import {corsHeaders, jsonResponse} from '../lib/server.js';
import {getProServerState} from '../lib/pro-signals.js';

export const config = {runtime: 'edge'};

// Public, sanitized signal feed for in-app notices. It only exposes already
// published OPEN signals; it never exposes scanner candidates, tokens or orders.
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(request)});
  if (request.method !== 'GET') return jsonResponse(request, {error: {message: 'Method not allowed.'}}, 405);
  try {
    const state = await getProServerState();
    const open = (Array.isArray(state.open) ? state.open : [])
      .filter(s => s && s.status === 'OPEN')
      .slice(0, 40)
      .map(s => ({
        id: String(s.id || '').slice(0, 160),
        pair: String(s.pair || s.symbol || '').slice(0, 40),
        symbol: String(s.symbol || s.pair || '').slice(0, 40),
        side: String(s.side || '').slice(0, 12),
        status: 'OPEN',
        entry: Number(s.entry) || 0,
        sl: Number(s.sl) || 0,
        tp1: Number(s.tp1) || 0,
        score: Number(s.score) || 0,
        createdAt: s.createdAt || null,
        telegramMessageId: Number(s.telegramMessageId) || null,
        telegramSentAt: s.telegramSentAt || null
      }));
    return jsonResponse(request, {
      ok: true,
      generatedAt: new Date().toISOString(),
      open
    });
  } catch {
    return jsonResponse(request, {error: {message: 'Signals unavailable.'}}, 503);
  }
}
