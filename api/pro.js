import { corsHeaders, jsonResponse } from "../lib/server.js";
import { getProServerState, resetPaperPortfolio, runProCycle, saveProServerConfig } from "../lib/pro-signals.js";
import { getCachedProBacktest, runProBacktest } from "../lib/pro-backtest.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  if (!isOwnerDevice(request)) {
    return jsonResponse(request, { error: { message: "This device is not authorized." } }, 403);
  }

  try {
    const input = await request.json();
    if (input?.action === "status" || input?.action === "history") {
      const state = await getProServerState();
      const backtest = await getCachedProBacktest();
      return jsonResponse(request, { ...publicState(state), backtest });
    }
    if (input?.action === "config") {
      const config = await saveProServerConfig(input.config);
      const state = await getProServerState();
      return jsonResponse(request, { ...publicState(state), config });
    }
    if (input?.action === "run") {
      const result = await runProCycle({ force: true });
      const state = await getProServerState();
      return jsonResponse(request, { ok: true, result, ...publicState(state) });
    }
    if (input?.action === "paperReset") {
      const paper = await resetPaperPortfolio();
      const state = await getProServerState();
      return jsonResponse(request, { ...publicState(state), paper });
    }
    if (input?.action === "backtest") {
      const backtest = await runProBacktest({ force: input?.force === true });
      const state = await getProServerState();
      return jsonResponse(request, { ...publicState(state), backtest });
    }
    return jsonResponse(request, { error: { message: "Invalid action." } }, 400);
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "The Pro server could not complete the request." }
    }, 500);
  }
}

function isOwnerDevice(request) {
  const expected = String(process.env.JAMDDMAJ_TELEGRAM_DEVICE_ID || "").trim();
  const provided = String(request.headers.get("x-jamddmaj-device") || "").trim();
  return Boolean(
    expected
    && /^[a-zA-Z0-9_-]{16,100}$/.test(provided)
    && provided === expected
  );
}

function publicState(state) {
  return {
    ok: true,
    authorized: true,
    config: state.config,
    status: state.status,
    stats: state.stats,
    open: state.open.slice(0, 30),
    history: state.history.slice(0, 80),
    paper: state.paper
  };
}
