import { corsHeaders, jsonResponse, redisRequest } from "../lib/server.js";
import { getProServerState, runProCycle } from "../lib/pro-signals.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!["GET", "POST"].includes(request.method)) return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  const secret = String(process.env.JAMDDMAJ_CRON_SECRET || "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonResponse(request, { error: { message: "Unauthorized watchdog request." } }, 401);
  }
  const checkedAt = new Date();
  try {
    const state = await getProServerState();
    const lastRun = Date.parse(state.status?.lastRunAt || "");
    const ageMinutes = Number.isFinite(lastRun) ? Math.round((Date.now() - lastRun) / 60000) : null;
    if (ageMinutes !== null && ageMinutes <= 15) {
      return jsonResponse(request, { ok: true, healthy: true, recovered: false, ageMinutes, checkedAt: checkedAt.toISOString() });
    }
    const result = await runProCycle({ force: true });
    await notifyOnce(
      "recovered",
      `🛟 <b>JamdDmaj Pro watchdog recovered the scanner</b>\nPrevious cycle age: ${ageMinutes ?? "unknown"} min\nMarkets read: ${result.assetsRead || 0}/${result.universeSize || 0}`,
      1800
    );
    return jsonResponse(request, { ok: true, healthy: true, recovered: true, previousAgeMinutes: ageMinutes, result, checkedAt: checkedAt.toISOString() });
  } catch (error) {
    await notifyOnce(
      "failure",
      `🚨 <b>JamdDmaj Pro watchdog alert</b>\nThe 24/7 scanner could not be recovered.\n${escapeHtml(error?.message || "Unknown server error")}`,
      1800
    ).catch(() => {});
    return jsonResponse(request, { error: { message: error?.message || "Watchdog recovery failed." }, healthy: false }, 500);
  }
}

async function notifyOnce(kind, text, ttlSeconds) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return false;
  const claim = await redisRequest("pipeline", [["SET", `jamd:pro:watchdog:${kind}`, "1", "NX", "EX", ttlSeconds]]);
  if (claim?.[0]?.result !== "OK") return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true })
  });
  if (!response.ok) throw new Error(`Telegram watchdog ${response.status}`);
  return true;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
