import { corsHeaders, jsonResponse } from "../lib/server.js";
import { runProBacktest } from "../lib/pro-backtest.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (!["GET", "POST"].includes(request.method)) {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  const secret = String(process.env.JAMDDMAJ_CRON_SECRET || "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonResponse(request, { error: { message: "Unauthorized backtest request." } }, 401);
  }
  try {
    const backtest = await runProBacktest({ force: true });
    return jsonResponse(request, { ok: true, backtest });
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "The scheduled Pro backtest failed." }
    }, 500);
  }
}
