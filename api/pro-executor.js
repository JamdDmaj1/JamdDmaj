import { corsHeaders, jsonResponse } from "../lib/server.js";
import { saveExecutorHeartbeat } from "../lib/pro-signals.js";
import { redisRequest } from "../lib/server.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Method not allowed." } }, 405);
  }
  const configuredSecret = String(process.env.JAMDDMAJ_CRON_SECRET || "").trim();
  const authorization = String(request.headers.get("authorization") || "");
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return jsonResponse(request, { error: { message: "Unauthorized executor request." } }, 401);
  }
  try {
    const input = await request.json().catch(() => ({}));
    const status = await saveExecutorHeartbeat(input);
    await maybeSendDryRunSummary(input).catch(() => {});
    return jsonResponse(request, { ok: true, status });
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "Executor heartbeat failed." }
    }, 500);
  }
}

async function maybeSendDryRunSummary(input) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId || String(input?.mode || "").toLowerCase() !== "dry-run") return;
  const decisions = input?.decisions || {};
  const executable = Number(decisions.executableSignals || 0);
  const total = Number(decisions.totalSignals || 0);
  const hasUsefulSignal = executable > 0 || input?.lastDryRunSignal;
  const key = hasUsefulSignal ? "jamd:pro:executor:telegram:dry-run-signal" : "jamd:pro:executor:telegram:dry-run-idle";
  const ttl = hasUsefulSignal ? 1800 : 7200;
  const claimed = await redisRequest("pipeline", [["SET", key, new Date().toISOString(), "NX", "EX", ttl]]);
  if (claimed?.[0]?.result !== "OK") return;
  const text = formatDryRunSummary(input, { total, executable });
  await sendTelegram(token, chatId, text);
}

function formatDryRunSummary(input, counts) {
  const order = input?.lastDryRunSignal;
  const rejected = input?.decisions?.rejected || {};
  const topReject = Object.entries(rejected).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return [
    "<b>JamdDmaj VPS dry-run</b>",
    `Mode: <code>${escapeHtml(String(input?.mode || "unknown").toUpperCase())}</code>`,
    `Signals: ${counts.executable}/${counts.total} executable`,
    order ? `Candidate: <b>${escapeHtml(order.pair || order.symbol)}</b> ${escapeHtml(order.side || "")} margin $${Number(order.marginUsd || 0).toFixed(2)}` : "",
    topReject ? `Top reject: ${escapeHtml(topReject[0])} (${topReject[1]})` : "",
    input?.lastAction ? `Last action: ${escapeHtml(input.lastAction)}` : "",
    input?.exitManager?.ready ? "Exit manager prep: TP1/SL plan ready; full auto-close still guarded." : ""
  ].filter(Boolean).join("\n");
}

async function sendTelegram(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(payload?.description || `Telegram ${response.status}`);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
