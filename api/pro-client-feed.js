import { corsHeaders, jsonResponse } from "../lib/server.js";
import { getProServerState } from "../lib/pro-signals.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "GET") {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  const url = new URL(request.url);
  const configuredToken = String(process.env.JAMDDMAJ_CLIENT_FEED_TOKEN || "").trim();
  const providedToken = String(request.headers.get("x-jamddmaj-client-token") || url.searchParams.get("token") || "").trim();
  if (configuredToken && providedToken !== configuredToken) {
    return jsonResponse(request, { error: { message: "Unauthorized client connector feed." } }, 401);
  }
  try {
    const state = await getProServerState();
    const open = Array.isArray(state.open) ? state.open.slice(0, 40).map(safeSignal) : [];
    const freshSignals = open.filter((signal) => signal.status === "OPEN").slice(0, 12);
    return jsonResponse(request, {
      ok: true,
      clientFeed: true,
      generatedAt: new Date().toISOString(),
      signals: freshSignals,
      open,
      events: [],
      executor: {
        livePaused: state.config?.clientLivePaused === true,
        maxOpen: Number(state.config?.maxLiveOpen || 1),
        maxNewOrdersPerRun: Number(state.config?.maxNewOrdersPerRun || 1),
        maxLiveMarginUsd: Number(state.config?.maxLiveMarginUsd || 35),
        fixedMarginUsd: Number(state.config?.fixedMarginUsd || 0),
        minScore: Number(state.config?.minLiveScore || 10),
        strictRegimeMinScore: Number(state.config?.strictRegimeMinScore || state.config?.minLiveScore || 10),
        minLiquidityUsd: Number(state.config?.minLiveLiquidityUsd || 0),
        allowMemeLive: state.config?.allowMemeLive !== false,
        defensiveMaxLeverage: Number(state.config?.defensiveMaxLeverage || 10),
        defensiveMaxMarginUsd: Number(state.config?.defensiveMaxMarginUsd || 10),
        exitManager: state.config?.exitManager !== false,
        exitProtectionTriggerRoe: Number(state.config?.exitProtectionTriggerRoe || 10),
        exitProtectionLockRoe: Number(state.config?.exitProtectionLockRoe || 2),
        exitCloseOnReversal: state.config?.exitCloseOnReversal !== false,
        maxDailyLossUsd: Number(state.config?.maxDailyLossUsd || 25),
        maxDailyLossPercent: Number(state.config?.maxDailyLossPercent || 3),
        maxConsecutiveLosses: Number(state.config?.maxConsecutiveLosses || 2),
        maxTradesPerDay: Number(state.config?.maxTradesPerDay || 3)
      },
      status: {
        lastRunAt: state.status?.lastRunAt || null,
        universeSize: state.status?.universeSize || 0
      }
    });
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "Client connector feed unavailable." }
    }, 500);
  }
}

function safeSignal(signal = {}) {
  return {
    id: String(signal.id || "").slice(0, 160),
    pair: String(signal.pair || signal.symbol || "").slice(0, 40),
    symbol: String(signal.symbol || signal.pair || "").slice(0, 40),
    bitgetPair: String(signal.bitgetPair || "").slice(0, 40),
    side: String(signal.side || "").slice(0, 12),
    status: String(signal.status || "").slice(0, 20),
    score: Number(signal.score || 0),
    rawScore: Number(signal.rawScore || signal.score || 0),
    category: String(signal.category || "").slice(0, 80),
    liquidityUsd: Number(signal.liquidityUsd || 0),
    entry: Number(signal.entry || signal.currentPrice || signal.lastPrice || 0),
    currentPrice: Number(signal.currentPrice || signal.entry || 0),
    lastPrice: Number(signal.lastPrice || signal.currentPrice || signal.entry || 0),
    tp1: Number(signal.tp1 || 0),
    tp2: Number(signal.tp2 || 0),
    tp3: Number(signal.tp3 || 0),
    sl: Number(signal.sl || 0),
    plannedUsd: Number(signal.plannedUsd || 0),
    leverage: Number(signal.leverage || 10),
    contractMultiplier: Number(signal.contractMultiplier || 1),
    createdAt: signal.createdAt || null,
    reasons: Array.isArray(signal.reasons) ? signal.reasons.slice(0, 5).map((item) => String(item).slice(0, 140)) : []
  };
}
