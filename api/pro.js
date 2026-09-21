import { corsHeaders, jsonResponse } from "../lib/server.js";
import { getProServerState, queueExecutorTestSignal, resetPaperPortfolio, runProCycle, saveProServerConfig } from "../lib/pro-signals.js";
import { getCachedProBacktest, runProBacktest } from "../lib/pro-backtest.js";
import { manualTradingReadiness } from "../lib/manual-trading-readiness.js";
import { getBitgetPublicReview } from "../lib/bitget-public-review.js";
import { preflightManualOrder } from "../lib/manual-order-preflight.js";
import { reviewManualOrder } from "../lib/manual-order-draft.js";
import { manualTerminalService } from "../lib/manual-terminal-service.js";
import { redisRequest } from "../lib/server.js";

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
    if (input?.action === "manualOrderStatus") {
      const id=String(input.requestId||"");
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))return jsonResponse(request,{error:{message:"Invalid order ID"}},400);
      const state=await getProServerState(),signalId="manual-terminal-"+id.toLowerCase();
      const order=state.executor?.recentOrders?.find(order=>order.id===signalId);
      return jsonResponse(request,{ok:true,requestId:id,
        status:order?(order.acknowledgementUncertain?"uncertain":"reported_by_executor"):(state.executorTest?.id===signalId?"queued":"unconfirmed"),
        order:order||null,receivedAt:state.executor?.receivedAt||null,
        note:"Executor report only; missing status is not permission to resubmit."});
    }
    if (input?.action === "manualPrepare" || input?.action === "manualConfirm") {
      const terminal = manualTerminalService({redis:redisRequest,getState:getProServerState,getQuote:getBitgetPublicReview,
        enabled:process.env.JAMDDMAJ_MANUAL_TRADING_ENABLED === "true"});
      const result = input.action === "manualPrepare" ? await terminal.prepare(input.draft) : await terminal.confirm(input);
      return jsonResponse(request, {ok:true,...result});
    }
    if (input?.action === "manualOrderPreview") {
      const draft = reviewManualOrder(input.draft);
      const [quote, state] = await Promise.all([getBitgetPublicReview(draft.symbol), getProServerState()]);
      return jsonResponse(request, { ok: true, preview: preflightManualOrder(draft, quote, state) });
    }
    if (input?.action === "manualQuote") {
      return jsonResponse(request, { ok: true, quote: await getBitgetPublicReview(input.symbol) });
    }
    if (input?.action === "manualReadiness") {
      const state = await getProServerState();
      const executor = state.executor || {};
      const readiness = manualTradingReadiness(state);
      return jsonResponse(request, {
        ok: true, readiness,
        account: executor.bitgetSynced === true && executor.accountRisk?.updatedAt ? {
          equity: executor.accountRisk.equity,
          available: executor.accountRisk.available,
          updatedAt: executor.accountRisk.updatedAt
        } : null,
        positions: executor.bitgetSynced === true ? executor.remotePositions : null,
        positionsMayBeTruncated: true,
        receivedAt: executor.receivedAt || null
      });
    }
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
    if (input?.action === "executorTest") {
      const executorTest = await queueExecutorTestSignal(input || {});
      const state = await getProServerState();
      return jsonResponse(request, { ok: true, executorTest, ...publicState(state) });
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
    paper: state.paper,
    executor: state.executor,
    executorTest: state.executorTest
  };
}
