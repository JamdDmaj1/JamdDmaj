import { corsHeaders, jsonResponse } from "../lib/server.js";
import { takeExecutorTestSignal } from "../lib/pro-signals.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  const configuredSecret = String(process.env.JAMDDMAJ_CRON_SECRET || "").trim();
  const feedToken = String(process.env.JAMDDMAJ_CLIENT_FEED_TOKEN || "").trim();
  const authorization = String(request.headers.get("authorization") || "");
  const cronAuthorized = Boolean(configuredSecret) && authorization === `Bearer ${configuredSecret}`;
  const feedAuthorized = Boolean(feedToken) && authorization === `Bearer ${feedToken}`;
  if (!cronAuthorized && !feedAuthorized) {
    return jsonResponse(request, { error: { message: "Unauthorized executor request." } }, 401);
  }
  try {
    const executorTest = await takeExecutorTestSignal();
    return jsonResponse(request, { ok: true, executorTest });
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "Executor test request failed." }
    }, 500);
  }
}
