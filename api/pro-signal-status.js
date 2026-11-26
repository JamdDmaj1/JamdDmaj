import {corsHeaders, jsonResponse} from '../lib/server.js';
import {getProServerState} from '../lib/pro-signals.js';

export const config = {runtime: 'edge'};

// Non-secret scanner health. Values such as the bot token and chat id never
// leave the server; only whether they are configured and what the last cycle did.
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(request)});
  if (request.method !== 'GET') return jsonResponse(request, {error: {code: 'method-not-allowed'}}, 405);
  try {
    const state = await getProServerState();
    const open = Array.isArray(state.open) ? state.open : [];
    return jsonResponse(request, {
      ok: true,
      generatedAt: new Date().toISOString(),
      scanner: {
        lastRunAt: state.status?.lastRunAt || null,
        lastHeartbeatAt: state.status?.lastHeartbeatAt || null,
        lastDailyReportDate: state.status?.lastDailyReportDate || null,
        created: Number(state.status?.created || 0),
        open: open.length,
        publishedOpen: open.filter(signal => Number(signal.telegramMessageId) > 0).length,
        telegram: state.status?.telegram || null,
        learning: state.learning?.summary || null
      },
      paper: state.paper ? {equity: state.paper.equity, realizedPnl: state.paper.realizedPnl, unrealizedPnl: state.paper.unrealizedPnl, open: state.paper.open?.length || 0, closed: state.paper.closed?.length || 0, winRate: state.paper.winRate, maxDrawdownPercent: state.paper.maxDrawdownPercent, openPositions: (state.paper.open || []).slice(0, 12).map(item => ({symbol: item.symbol, side: item.side, entry: item.entry, currentPrice: item.currentPrice, roePercent: item.roePercent, sl: item.sl, tp1: item.tp1, openedAt: item.openedAt, status: item.status, remainingFraction: item.remainingFraction}))} : null,
      config: {
        signalsEnabled: String(process.env.TELEGRAM_SIGNALS_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
        botConfigured: Boolean(String(process.env.TELEGRAM_BOT_TOKEN || '').trim()),
        chatConfigured: Boolean(String(process.env.TELEGRAM_CHAT_ID || '').trim())
      }
    }, 200, {'Cache-Control': 'no-store'});
  } catch (error) {
    return jsonResponse(request, {ok: false, error: {code: 'scanner-status-unavailable', message: String(error?.message || error).slice(0, 160)}}, 503);
  }
}
