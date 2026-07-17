import { corsHeaders, jsonResponse } from "../lib/server.js";
import { saveExecutorHeartbeat } from "../lib/pro-signals.js";
import { redisRequest } from "../lib/server.js";

const EXECUTOR_LEARNING_PREFIX = "jamd:pro:executor:learning:";
const EXECUTOR_LIVE_ALERT_PREFIX = "jamd:pro:executor:telegram:live:";
const EXECUTOR_DAILY_PIN_PREFIX = "jamd:pro:executor:telegram:daily-pin:";

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
    const executorLearning = await updateExecutorLearning(input).catch(() => null);
    const enrichedInput = executorLearning ? { ...input, executorLearning } : input;
    const status = await saveExecutorHeartbeat(enrichedInput);
    await maybeSendLiveOrderAlert(enrichedInput).catch(() => {});
    await maybeSendPinnedDailyLearning(enrichedInput, executorLearning).catch(() => {});
    await maybeSendDryRunSummary(enrichedInput).catch(() => {});
    return jsonResponse(request, { ok: true, status });
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "Executor heartbeat failed." }
    }, 500);
  }
}

async function maybeSendLiveOrderAlert(input) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId || String(input?.mode || "").toLowerCase() !== "live") return;
  const order = input?.lastLiveSignal;
  if (!order?.pair && !order?.symbol) return;
  const orderKey = String(order.id || `${order.pair || order.symbol}:${order.side || ""}:${order.createdAt || ""}`).replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 180);
  const claimed = await redisRequest("pipeline", [["SET", `${EXECUTOR_LIVE_ALERT_PREFIX}${orderKey}`, new Date().toISOString(), "NX", "EX", 2592000]]);
  if (claimed?.[0]?.result !== "OK") return;
  await sendTelegram(token, chatId, formatLiveOrderMessage(input, order));
}

async function maybeSendPinnedDailyLearning(input, learning) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId || !learning) return;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(now));
  if (hour < 20) return;
  const day = dayKey(now);
  const claimed = await redisRequest("pipeline", [["SET", `${EXECUTOR_DAILY_PIN_PREFIX}${day}`, new Date().toISOString(), "NX", "EX", 172800]]);
  if (claimed?.[0]?.result !== "OK") return;
  const message = await sendTelegram(token, chatId, formatExecutorDailyLearningMessage(input, learning));
  const messageId = telegramMessageId(message);
  if (messageId) await pinTelegramMessage(token, chatId, messageId).catch(() => {});
}

async function updateExecutorLearning(input) {
  const day = dayKey();
  const key = `${EXECUTOR_LEARNING_PREFIX}${day}`;
  const previous = parseJson((await redisRequest("pipeline", [["GET", key]]))?.[0]?.result, null) || createExecutorLearning(day);
  previous.runs += 1;
  previous.mode = String(input?.mode || previous.mode || "unknown").slice(0, 20);
  previous.updatedAt = new Date().toISOString();
  const order = input?.lastLiveSignal;
  if (order?.pair || order?.symbol) {
    const orderKey = String(order.id || `${order.pair || order.symbol}:${order.side || ""}:${order.createdAt || ""}`).slice(0, 160);
    previous.orderKeys = Array.isArray(previous.orderKeys) ? previous.orderKeys : [];
    if (!previous.orderKeys.includes(orderKey)) {
      previous.orderKeys.push(orderKey);
      previous.liveOrders += 1;
      previous.orders = [{
        pair: String(order.pair || order.symbol || "").slice(0, 40),
        side: String(order.side || "").slice(0, 12),
        marginUsd: Number(order.marginUsd || 0),
        entry: Number(order.entry || 0),
        createdAt: order.createdAt || new Date().toISOString()
      }, ...(Array.isArray(previous.orders) ? previous.orders : [])].slice(0, 10);
    }
  }
  const rejected = input?.decisions?.rejected || {};
  for (const [reason, count] of Object.entries(rejected)) {
    const keyReason = String(reason || "unknown").slice(0, 140);
    previous.rejections[keyReason] = (Number(previous.rejections[keyReason]) || 0) + (Number(count) || 0);
  }
  for (const item of Array.isArray(input?.decisions?.examples) ? input.decisions.examples : []) {
    previous.examples.unshift({
      pair: String(item.pair || "").slice(0, 40),
      side: String(item.side || "").slice(0, 12),
      score: Number(item.score || 0),
      reason: String(item.reason || "").slice(0, 140)
    });
  }
  previous.examples = previous.examples.slice(0, 12);
  previous.lesson = buildExecutorLesson(previous);
  await redisRequest("pipeline", [["SET", key, JSON.stringify(previous), "EX", 604800]]);
  return compactExecutorLearning(previous);
}

function createExecutorLearning(day) {
  return { day, runs: 0, liveOrders: 0, orderKeys: [], orders: [], rejections: {}, examples: [], lesson: "Collecting executor data.", updatedAt: new Date().toISOString() };
}

function compactExecutorLearning(value) {
  const topRejects = Object.entries(value.rejections || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);
  return {
    day: value.day,
    runs: Number(value.runs || 0),
    liveOrders: Number(value.liveOrders || 0),
    topRejects: topRejects.map(([reason, count]) => ({ reason, count: Number(count || 0) })),
    examples: (value.examples || []).slice(0, 5),
    lesson: value.lesson || buildExecutorLesson(value),
    updatedAt: value.updatedAt || null
  };
}

function buildExecutorLesson(value) {
  const top = Object.entries(value.rejections || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  if (!top) return value.liveOrders ? "Entry automation is working; keep monitoring TP/SL behavior." : "No strong executor lesson yet.";
  const reason = String(top[0] || "").toLowerCase();
  if (reason.includes("risk-off")) return "Risk-off market is blocking meme/unknown-cap trades; prefer stronger liquid majors until regime improves.";
  if (reason.includes("score below")) return "Signals are arriving, but score is below live gate; wait for stronger confirmation instead of forcing entries.";
  if (reason.includes("daily") || reason.includes("loss")) return "Daily risk guard protected the account; reduce new entries until PnL recovers.";
  if (reason.includes("bitget rejected") || reason.includes("price")) return "Bitget validation rejected an order; precision/symbol rules should be reviewed before retrying that setup.";
  return `Main lesson: ${top[0]}`;
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
  return payload;
}

async function pinTelegramMessage(token, chatId, messageId) {
  const response = await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      disable_notification: false
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(payload?.description || `Telegram pin ${response.status}`);
  return payload;
}

function telegramMessageId(payload) {
  return Number(payload?.result?.message_id || payload?.message_id || 0) || null;
}

function formatLiveOrderMessage(input, order) {
  const risk = input?.accountRisk || {};
  return [
    "🚨 <b>BITGET AUTO ENTRY EXECUTED</b>",
    `<b>${escapeHtml(order.pair || order.symbol)}</b> ${escapeHtml(order.side || "")}`,
    `Mode: <code>${escapeHtml(String(input?.mode || "live").toUpperCase())}</code> | Source: ${escapeHtml(order.source || "executor")}`,
    `Margin: ${Number(order.marginUsd || 0).toFixed(2)} | Notional: ${Number(order.notionalUsd || 0).toFixed(2)}`,
    Number(order.entry || 0) ? `Entry ref: <code>${Number(order.entry).toPrecision(8)}</code>` : "",
    Number(order.tp1 || 0) ? `TP1 preset: <code>${Number(order.tp1).toPrecision(8)}</code>` : "",
    Number(order.sl || 0) ? `SL preset: <code>${Number(order.sl).toPrecision(8)}</code>` : "",
    risk.enabled ? `Auto risk: equity ${Number(risk.equity || 0).toFixed(2)} | per trade ${Number(risk.marginCapUsd || 0).toFixed(2)}` : "",
    "The VPS confirmed Bitget accepted the entry. Monitor protection and exit behavior."
  ].filter(Boolean).join("\n");
}

function formatExecutorDailyLearningMessage(input, learning) {
  const top = (learning.topRejects || []).slice(0, 4).map((item) => `${escapeHtml(item.reason)} (${Number(item.count || 0)})`);
  const examples = (learning.examples || []).slice(0, 3).map((item) => `${escapeHtml(item.pair)} ${escapeHtml(item.side)}: ${escapeHtml(item.reason)}`);
  return [
    "📌 <b>JamdDmaj Bitget daily learning</b>",
    `Day: ${escapeHtml(learning.day || dayKey())}`,
    `VPS runs: ${Number(learning.runs || 0)} | Live entries: ${Number(learning.liveOrders || 0)}`,
    top.length ? `Top filters: ${top.join(" | ")}` : "Top filters: none yet",
    examples.length ? `Examples: ${examples.join(" | ")}` : "",
    `Lesson: ${escapeHtml(learning.lesson || "Collecting data.")}`,
    "Tomorrow the executor will keep using score gates, risk-off filters, account auto-risk, and learned weak-pattern cooldowns."
  ].filter(Boolean).join("\n");
}

function dayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
