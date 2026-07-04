import { corsHeaders, jsonResponse } from "../lib/server.js";
import { monitorProOpenEvents } from "../lib/pro-signals.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (!["GET", "POST"].includes(request.method)) {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  const configuredSecret = String(process.env.JAMDDMAJ_CRON_SECRET || "").trim();
  const authorization = String(request.headers.get("authorization") || "");
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return jsonResponse(request, { error: { message: "Unauthorized monitor request." } }, 401);
  }
  try {
    const result = await monitorProOpenEvents();
    return jsonResponse(request, result);
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "The fast Pro monitor failed." }
    }, 500);
  }
}