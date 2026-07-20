import { corsHeaders, jsonResponse } from "../lib/server.js";
import { saveExecutorHeartbeat } from "../lib/pro-signals.js";
import { redisRequest } from "../lib/server.js";

const EXECUTOR_LEARNING_PREFIX = "jamd:pro:executor:learning:";
const EXECUTOR_LIVE_ALERT_PREFIX = "jamd:pro:executor:telegram:live:";
const EXECUTOR_EXIT_ALERT_PREFIX = "jamd:pro:executor:telegram:exit:";
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
    await maybeSendExitManagerAlert(enrichedInput).catch(() => {});
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

async function maybeSendExitManagerAlert(input) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId || String(input?.mode || "").toLowerCase() !== "live") return;
  const action = String(input?.exitManager?.lastAction || input?.lastAction || "").trim();
  if (!/^exit manager (protected|closed|close failed)/i.test(action)) return;
  const key = action.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 180);
  const claimed = await redisRequest("pipeline", [["SET", EXECUTOR_EXIT_ALERT_PREFIX + key, new Date().toISOString(), "NX", "EX", 604800]]);
  if (claimed?.[0]?.result !== "OK") return;
  await sendTelegram(token, chatId, formatExitManagerMessage(input, action));
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
  previous.selfImprovement = buildExecutorSelfImprovementPlan(input, previous);
  await redisRequest("pipeline", [["SET", key, JSON.stringify(previous), "EX", 604800]]);
  return compactExecutorLearning(previous);
}

function createExecutorLearning(day) {
  return { day, runs: 0, liveOrders: 0, orderKeys: [], orders: [], rejections: {}, examples: [], lesson: "Collecting executor data.", selfImprovement: [], updatedAt: new Date().toISOString() };
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
    selfImprovement: normalizeSelfImprovement(value.selfImprovement),
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

function buildExecutorSelfImprovementPlan(input, learning) {
  const suggestions = [];
  const rejected = learning?.rejections || input?.decisions?.rejected || {};
  const topRejects = Object.entries(rejected).sort((a, b) => Number(b[1]) - Number(a[1]));
  const topReason = String(topRejects[0]?.[0] || "").toLowerCase();
  const executable = Number(input?.decisions?.executableSignals || 0);
  const total = Number(input?.decisions?.totalSignals || 0);
  const recentOpen = Number(input?.decisions?.recentOpenSignals || 0);
  const realOpen = Number(input?.bitgetPositions?.open || input?.remotePositions?.open || 0);
  const maxOpen = Number(input?.effectivePolicy?.maxOpen || input?.settings?.maxOpen || 0);
  const marketGate = String(input?.marketGate?.regime || input?.marketGate?.label || "").toLowerCase();
  const weakCategory = selectWeakLearning(input?.categoryLearning);
  const weakSymbol = selectWeakLearning(input?.symbolLearning || input?.rejectedSymbols);

  const add = (title, detail) => {
    const key = `${title}:${detail}`.toLowerCase();
    if (suggestions.some((item) => item.key === key)) return;
    suggestions.push({ key, title: String(title).slice(0, 64), detail: String(detail).slice(0, 180) });
  };

  if (topReason.includes("stale signal")) {
    add("Freshness", "Keep the 5 minute live window, but make the scanner prioritize brand-new Bitget-ready setups instead of recycling old Telegram calls.");
  }
  if (topReason.includes("already seen") || topReason.includes("already ordered") || topReason.includes("duplicate")) {
    add("Dedup memory", "Do not reopen the same symbol-side after a Bitget rejection or manual close; wait for a new setup with a fresh id and fresh price.");
  }
  if (topReason.includes("take profit") || topReason.includes("current price") || topReason.includes("precision") || topReason.includes("multiple of")) {
    add("Bitget validation", "Before sending an order, compare TP/SL against live mark price and round to Bitget tick size so rejected entries stop repeating.");
  }
  if (topReason.includes("risk-off") || marketGate.includes("risk-off")) {
    add("Regime filter", "In risk-off, demand stronger confirmation for longs and favor cleaner shorts with liquidity, volume expansion, and low spread.");
  }
  if (topReason.includes("score below")) {
    add("Score model", "Add one more confirmation input before live entries: volume acceleration, open interest change, or funding pressure.");
  }
  if (weakCategory) {
    add("Weak category", `Cooldown ${weakCategory.label}; it is underperforming and should need extra confirmation before live entries.`);
  }
  if (weakSymbol) {
    add("Weak symbol", `Reduce priority for ${weakSymbol.label}; recent learning says it has weak follow-through.`);
  }
  if (realOpen >= maxOpen && maxOpen > 0) {
    add("Capacity", `Max open is doing its job (${realOpen}/${maxOpen}); only use new slots for fresh signals, not old queued calls.`);
  }
  if (!total && !recentOpen) {
    add("Opportunity scan", "No executable signals reached the VPS; broaden the rotating Bitget universe or add a momentum breakout detector.");
  }
  if (executable > 0) {
    add("Execution priority", "Executable signals existed today; rank them by freshness, spread, volume, learning score, and Bitget availability before ordering.");
  }
  if (!suggestions.length) {
    add("Next experiment", "Test an open-interest plus funding acceleration indicator and compare its TP1 hit rate against the current score gate.");
  }
  return suggestions.slice(0, 5).map(({ title, detail }) => ({ title, detail }));
}

function selectWeakLearning(source) {
  const rows = Array.isArray(source) ? source : Object.entries(source || {}).map(([label, value]) => ({ label, ...(value || {}) }));
  return rows
    .map((item) => ({
      label: String(item.label || item.category || item.symbol || item.pair || item.key || "").slice(0, 48),
      winRate: Number(item.winRate ?? item.rate ?? item.successRate ?? item.tpRate ?? 1),
      samples: Number(item.samples ?? item.count ?? item.total ?? 0)
    }))
    .filter((item) => item.label && item.samples >= 5 && item.winRate <= 0.45)
    .sort((a, b) => a.winRate - b.winRate || b.samples - a.samples)[0] || null;
}

function normalizeSelfImprovement(value) {
  return (Array.isArray(value) ? value : []).slice(0, 5).map((item) => ({
    title: String(item?.title || "").slice(0, 64),
    detail: String(item?.detail || "").slice(0, 180)
  })).filter((item) => item.title && item.detail);
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

function formatExitManagerMessage(input, action) {
  const exit = input?.exitManager || {};
  const recent = Array.isArray(input?.recentOrders) ? input.recentOrders.find((order) => action.includes(order.pair || order.symbol || "")) : null;
  return [
    "<b>JamdDmaj Bitget exit manager</b>",
    "Action: " + escapeHtml(action),
    recent ? "Trade: <b>" + escapeHtml(recent.pair || recent.symbol) + "</b> " + escapeHtml(recent.side || "") : "",
    Number(recent?.currentRoe || 0) ? "Current ROE: " + Number(recent.currentRoe || 0).toFixed(2) + "% | Max ROE: " + Number(recent.maxRoe || 0).toFixed(2) + "%" : "",
    exit.enabled ? "Protection: +" + Number(exit.protectionTriggerRoe || 10).toFixed(0) + "% -> " + Number(exit.protectionLockRoe || 2).toFixed(0) + "% ROE" : "",
    "This is an automatic VPS protection/exit decision. Check Bitget after any close-failed alert."
  ].filter(Boolean).join("\n");
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
  const improvements = normalizeSelfImprovement(learning.selfImprovement);
  return [
    "📌 <b>JamdDmaj Bitget daily learning</b>",
    `Day: ${escapeHtml(learning.day || dayKey())}`,
    `VPS runs: ${Number(learning.runs || 0)} | Live entries: ${Number(learning.liveOrders || 0)}`,
    top.length ? `Top filters: ${top.join(" | ")}` : "Top filters: none yet",
    examples.length ? `Examples: ${examples.join(" | ")}` : "",
    `Lesson: ${escapeHtml(learning.lesson || "Collecting data.")}`,
    improvements.length ? "\n<b>AI self-improvement requests</b>" : "",
    ...improvements.map((item, index) => `${index + 1}. <b>${escapeHtml(item.title)}</b>: ${escapeHtml(item.detail)}`),
    "Tomorrow the executor will keep using fresh-signal limits, score gates, account risk, and the current profit-protection rules."
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
