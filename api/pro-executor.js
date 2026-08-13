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
  if (!isMiamiDailyReportDue(now)) return;
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
  const dryRun = String(input?.mode || "").toLowerCase() === "dry-run";
  const slSuggestions = buildDailyStopLossSuggestions(outcomes);
  const order = dryRun ? input?.lastDryRunSignal : input?.lastLiveSignal;
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
  const rejectionSnapshot = executorRejectionSnapshot(input);
  previous.rejectionSnapshotKeys = Array.isArray(previous.rejectionSnapshotKeys) ? previous.rejectionSnapshotKeys : [];
  if (!previous.rejectionSnapshotKeys.includes(rejectionSnapshot)) {
    previous.rejectionSnapshotKeys.push(rejectionSnapshot);
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
  }
  previous.rejectionSnapshotKeys = previous.rejectionSnapshotKeys.slice(-500);
  previous.examples = previous.examples.slice(0, 12);
  applyOutcomeLearning(input, previous);
  previous.lesson = buildExecutorLesson(previous);
  previous.selfImprovement = buildExecutorSelfImprovementPlan(input, previous);
  await redisRequest("pipeline", [["SET", key, JSON.stringify(previous), "EX", 604800]]);
  return compactExecutorLearning(previous);
}

function createExecutorLearning(day) {
  return {
    day,
    runs: 0,
    liveOrders: 0,
    orderKeys: [],
    orders: [],
    outcomeKeys: [],
    wins: 0,
    tpHits: 0,
    losses: 0,
    slLosses: 0,
    stopLossHits: 0,
    invalidationLosses: 0,
    reversalLosses: 0,
    profitGivebacks: 0,
    lossReasons: {},
    lossExamples: [],
    winExamples: [],
    rejectionSnapshotKeys: [],
    rejections: {},
    examples: [],
    lesson: "Collecting executor data.",
    selfImprovement: [],
    updatedAt: new Date().toISOString()
  };
}

function compactExecutorLearning(value) {
  const topRejects = Object.entries(value.rejections || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);
  return {
    day: value.day,
    runs: Number(value.runs || 0),
    liveOrders: Number(value.liveOrders || 0),
    topRejects: topRejects.map(([reason, count]) => ({ reason, count: Number(count || 0) })),
    examples: (value.examples || []).slice(0, 5),
    outcomes: compactOutcomeSummary(value),
    lesson: value.lesson || buildExecutorLesson(value),
    selfImprovement: normalizeSelfImprovement(value.selfImprovement),
    updatedAt: value.updatedAt || null
  };
}

function applyOutcomeLearning(input, previous) {
  previous.outcomeKeys = Array.isArray(previous.outcomeKeys) ? previous.outcomeKeys : [];
  previous.lossReasons = previous.lossReasons && typeof previous.lossReasons === "object" ? previous.lossReasons : {};
  previous.lossExamples = Array.isArray(previous.lossExamples) ? previous.lossExamples : [];
  previous.winExamples = Array.isArray(previous.winExamples) ? previous.winExamples : [];
  for (const outcome of collectExecutorOutcomes(input)) {
    const key = String(outcome.id || `${outcome.pair}:${outcome.side}:${outcome.type}:${outcome.closedAt || outcome.createdAt}`).slice(0, 180);
    if (!key || previous.outcomeKeys.includes(key)) continue;
    previous.outcomeKeys.push(key);
    if (outcome.outcome === "win") {
      previous.wins = Number(previous.wins || 0) + 1;
      if (/\btp(?:1|2|3)?\b|take profit/.test(String(outcome.type || "").toLowerCase())) {
        previous.tpHits = Number(previous.tpHits || 0) + 1;
      }
      previous.winExamples.unshift(compactCohortExample(outcome));
      continue;
    }
    if (outcome.outcome !== "loss") continue;
    previous.losses = Number(previous.losses || 0) + 1;
    if (outcome.reason === "sl" || outcome.reason === "invalidation") previous.slLosses = Number(previous.slLosses || 0) + 1;
    if (outcome.reason === "sl") previous.stopLossHits = Number(previous.stopLossHits || 0) + 1;
    if (outcome.reason === "invalidation") previous.invalidationLosses = Number(previous.invalidationLosses || 0) + 1;
    if (outcome.reason === "reversal") previous.reversalLosses = Number(previous.reversalLosses || 0) + 1;
    if (outcome.reason === "profit-giveback") previous.profitGivebacks = Number(previous.profitGivebacks || 0) + 1;
    previous.lossReasons[outcome.reason] = (Number(previous.lossReasons[outcome.reason]) || 0) + 1;
    previous.lossExamples.unshift(compactCohortExample(outcome));
  }
  previous.outcomeKeys = previous.outcomeKeys.slice(-300);
  previous.lossExamples = previous.lossExamples.slice(0, 10);
  previous.winExamples = previous.winExamples.slice(0, 10);
}

function compactCohortExample(outcome = {}) {
  return {
    pair: String(outcome.pair || "").slice(0, 40),
    side: String(outcome.side || "").slice(0, 12),
    reason: String(outcome.reason || outcome.outcome || "").slice(0, 40),
    score: Number(outcome.score || 0),
    roe: Number(outcome.roe || 0),
    maxRoe: Number(outcome.maxRoe || 0),
    category: String(outcome.category || "").slice(0, 80),
    volumeRatio: Number(outcome.volumeRatio || 0),
    adx: Number(outcome.adx || 0),
    higherTrend: String(outcome.higherTrend || "").slice(0, 80),
    marketAlignment: String(outcome.marketAlignment || "").slice(0, 30)
  };
}

function collectExecutorOutcomes(input) {
  const outcomes = [];
  for (const event of Array.isArray(input?.recentOutcomeEvents) ? input.recentOutcomeEvents : []) {
    const type = String(event?.type || event?.status || event?.outcome || "").toLowerCase();
    const outcome = String(event?.outcome || "").toLowerCase() || outcomeFromText(type);
    if (!outcome) continue;
    outcomes.push({
      id: event?.id,
      pair: event?.pair,
      side: event?.side,
      type,
      outcome,
      reason: lossReasonFromText(type, event),
      score: Number(event?.score || 0),
      category: event?.category || "",
      volumeRatio: Number(event?.volumeRatio || 0),
      adx: Number(event?.adx || 0),
      higherTrend: event?.higherTrend || "",
      marketAlignment: event?.marketAlignment || "",
      createdAt: event?.createdAt || "",
      closedAt: event?.closedAt || ""
    });
  }
  for (const order of Array.isArray(input?.recentOrders) ? input.recentOrders : []) {
    const status = String(order?.status || "").toLowerCase();
    const exitReason = String(order?.exitReason || "").toLowerCase();
    const text = `${status} ${exitReason}`;
    const currentRoe = Number(order?.currentRoe || 0);
    const maxRoe = Number(order?.maxRoe || 0);
    const closed = /(closed|invalid|reversal|sl|loss|win|tp)/i.test(text);
    if (!closed) continue;
    const outcome = outcomeFromText(text) || (currentRoe < -0.5 ? "loss" : (currentRoe > 0.5 ? "win" : ""));
    if (!outcome) continue;
    outcomes.push({
      id: order?.id || order?.clientOid || `${order?.pair || order?.symbol}:${status}:${order?.createdAt || ""}`,
      pair: order?.pair || order?.symbol,
      side: order?.side,
      type: text,
      outcome,
      reason: lossReasonFromText(text, { currentRoe, maxRoe }),
      score: Number(order?.score || 0),
      roe: currentRoe,
      maxRoe,
      category: order?.category || "",
      volumeRatio: Number(order?.volumeRatio || 0),
      adx: Number(order?.adx || 0),
      higherTrend: order?.higherTrend || "",
      marketAlignment: order?.marketAlignment || "",
      createdAt: order?.createdAt || "",
      closedAt: order?.closedAt || ""
    });
  }
  return outcomes;
}

function outcomeFromText(text) {
  const value = String(text || "").toLowerCase();
  if (/protected_win|partial_win|\btp\b|win|take profit/.test(value)) return "win";
  if (/invalid|reversal|\bsl\b|stop|loss/.test(value)) return "loss";
  return "";
}

function lossReasonFromText(text, item = {}) {
  const value = String(text || "").toLowerCase();
  const currentRoe = Number(item?.currentRoe || item?.roe || 0);
  const maxRoe = Number(item?.maxRoe || 0);
  if (/protected|lock/.test(value) && maxRoe >= 7 && currentRoe < 0) return "profit-giveback";
  if (/reversal/.test(value)) return "reversal";
  if (/invalid/.test(value)) return "invalidation";
  if (/\bsl\b|stop/.test(value)) return "sl";
  if (/closed_by_exit_manager/.test(value) && currentRoe < 0) return "negative-exit";
  return "loss";
}

function compactOutcomeSummary(value) {
  const topLossReasons = Object.entries(value.lossReasons || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4)
    .map(([reason, count]) => ({ reason, count: Number(count || 0) }));
  return {
    wins: Number(value.wins || 0),
    tpHits: Number(value.tpHits || 0),
    losses: Number(value.losses || 0),
    slLosses: Number(value.slLosses || 0),
    stopLossHits: Number(value.stopLossHits || 0),
    invalidationLosses: Number(value.invalidationLosses || 0),
    reversalLosses: Number(value.reversalLosses || 0),
    profitGivebacks: Number(value.profitGivebacks || 0),
    topLossReasons,
    lossExamples: (Array.isArray(value.lossExamples) ? value.lossExamples : []).slice(0, 5),
    comparison: buildOutcomeCohortComparison(value)
  };
}

export function buildOutcomeCohortComparison(value = {}) {
  const summarize = (items) => {
    const rows = (Array.isArray(items) ? items : []).slice(0, 10);
    const average = (key) => rows.length
      ? Number((rows.reduce((sum, item) => sum + Number(item?.[key] || 0), 0) / rows.length).toFixed(2))
      : 0;
    return {
      samples: rows.length,
      averageScore: average("score"),
      averageVolumeRatio: average("volumeRatio"),
      averageAdx: average("adx"),
      counterMarketPercent: rows.length
        ? Number(((rows.filter((item) => item?.marketAlignment === "counter-market").length / rows.length) * 100).toFixed(1))
        : 0
    };
  };
  return {
    winners: summarize(value.winExamples),
    losses: summarize(value.lossExamples)
  };
}

function buildExecutorLesson(value) {
  const outcomes = compactOutcomeSummary(value);
  if (outcomes.slLosses >= 2) return "Multiple SL/invalidation losses today; require stronger trend, volume, and entry-price confirmation before live entries.";
  if (outcomes.reversalLosses >= 2) return "Multiple reversal losses today; entries need stricter trend alignment and faster invalidation checks.";
  if (outcomes.profitGivebacks >= 1) return "At least one trade gave back protected profit; review entry timing and avoid late momentum chases.";
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
  const outcomes = compactOutcomeSummary(learning || {});

  const add = (title, detail) => {
    const key = `${title}:${detail}`.toLowerCase();
    if (suggestions.some((item) => item.key === key)) return;
    suggestions.push({ key, title: String(title).slice(0, 64), detail: String(detail).slice(0, 180) });
  };

  if (topReason.includes("stale signal")) {
    add("Freshness", "Track unique 5 minute candidates and compare the AI simulation variant against the baseline instead of counting recycled Telegram calls.");
  }
  if (outcomes.slLosses >= 2) {
    add("SL review", "Test stronger 4h alignment, volume expansion, and cleaner entry drift in the simulation-only A/B variant before considering any strategy change.");
  }
  if (outcomes.reversalLosses >= 2) {
    add("Reversal filter", "Several trades reversed after entry; add a short-term momentum turn check before sending Bitget orders.");
  }
  if (outcomes.profitGivebacks >= 1) {
    add("Profit giveback", "A trade gave back profit after being protected; inspect whether entries are too late or too close to exhaustion candles.");
  }
  if (outcomes.lossExamples.length) {
    const sample = outcomes.lossExamples[0];
    add("Loss sample", `${sample.pair} ${sample.side} ended as ${sample.reason}; compare its score, category, and trend context with today's winners.`);
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
    order.marketDirectionLabel ? `Direccion dominante: <b>${escapeHtml(order.marketDirectionLabel)}</b> | score ${Number(order.marketDirectionScore || 0).toFixed(1)} | ${order.marketAlignment === "with-market" ? "A FAVOR" : order.marketAlignment === "counter-market" ? "CONTRA MERCADO" : "NEUTRAL"}` : "",
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
  const outcomes = learning.outcomes || {};
  const lossExamples = (outcomes.lossExamples || []).slice(0, 3).map((item) => `${escapeHtml(item.pair)} ${escapeHtml(item.side)}: ${escapeHtml(item.reason)}`);
  const lossReasons = (outcomes.topLossReasons || []).slice(0, 3).map((item) => `${escapeHtml(item.reason)} (${Number(item.count || 0)})`);
  const dryRun = String(input?.mode || "").toLowerCase() === "dry-run";
  return [
    "📌 <b>JamdDmaj Bitget daily learning</b>",
    `Day: ${escapeHtml(learning.day || dayKey())}`,
    "Hora del informe: 9:00 p. m. Miami",
    `VPS runs: ${Number(learning.runs || 0)} | ${dryRun ? "Simulated entries" : "Live entries"}: ${Number(learning.liveOrders || 0)}`,
    formatExecutorMarketDirection(input?.marketDirection),
    `🎯 TP tocados: <b>${Number(outcomes.tpHits || 0)}</b> | 🛑 SL tocados: <b>${Number(outcomes.stopLossHits || 0)}</b>`,
    `Resultados: wins ${Number(outcomes.wins || 0)} | losses ${Number(outcomes.losses || 0)} | invalidaciones ${Number(outcomes.invalidationLosses || 0)} | reversals ${Number(outcomes.reversalLosses || 0)}`,
    Number(outcomes.profitGivebacks || 0) ? `Profit givebacks: ${Number(outcomes.profitGivebacks || 0)}` : "",
    lossReasons.length ? `Loss reasons: ${lossReasons.join(" | ")}` : "",
    lossExamples.length ? `Loss examples: ${lossExamples.join(" | ")}` : "",
    formatOutcomeCohortComparison(outcomes.comparison),
    top.length ? `Top filters: ${top.join(" | ")}` : "Top filters: none yet",
    examples.length ? `Examples: ${examples.join(" | ")}` : "",
    `Lesson: ${escapeHtml(learning.lesson || "Collecting data.")}`,
    "\n<b>Sugerencias de SL</b>",
    ...slSuggestions.map((suggestion, index) => `${index + 1}. ${escapeHtml(suggestion)}`),
    formatAiSimulationExperiment(input?.aiExperiment),
    improvements.length ? "\n<b>AI self-improvement requests</b>" : "",
    ...improvements.map((item, index) => `${index + 1}. <b>${escapeHtml(item.title)}</b>: ${escapeHtml(item.detail)}`),
    dryRun
      ? "Simulation only: no real order was sent. Tomorrow the executor will keep comparing the baseline with the AI variant."
      : "Tomorrow the executor will keep using fresh-signal limits, score gates, account risk, and the current profit-protection rules."
  ].filter(Boolean).join("\n");
}

function formatOutcomeCohortComparison(value) {
  const wins = value?.winners || {};
  const losses = value?.losses || {};
  if (!Number(wins.samples || 0) || !Number(losses.samples || 0)) return "";
  return `Winner/loss comparison: score ${Number(wins.averageScore || 0).toFixed(1)}/${Number(losses.averageScore || 0).toFixed(1)} | volume ${Number(wins.averageVolumeRatio || 0).toFixed(2)}x/${Number(losses.averageVolumeRatio || 0).toFixed(2)}x | ADX ${Number(wins.averageAdx || 0).toFixed(1)}/${Number(losses.averageAdx || 0).toFixed(1)} | counter-market ${Number(wins.counterMarketPercent || 0).toFixed(0)}%/${Number(losses.counterMarketPercent || 0).toFixed(0)}%`;
}

export function buildDailyStopLossSuggestions(outcomes = {}) {
  const suggestions = [];
  const stopLossHits = Number(outcomes.stopLossHits || 0);
  const invalidations = Number(outcomes.invalidationLosses || 0);
  const givebacks = Number(outcomes.profitGivebacks || 0);
  const losses = Number(outcomes.losses || 0);
  if (stopLossHits >= 2) {
    suggestions.push("Hubo varios SL: revisar si la entrada quedó demasiado cerca del ruido/ATR; validar en simulación antes de ampliar el stop.");
  } else if (stopLossHits === 1) {
    suggestions.push("Revisar el trade que tocó SL y comparar distancia ATR, estructura y spread con los trades que alcanzaron TP.");
  }
  if (invalidations >= 2) {
    suggestions.push("Las invalidaciones se repitieron: exigir confirmación de tendencia 4h y cierre de vela antes de entrar.");
  }
  if (givebacks > 0) {
    suggestions.push("Hubo devolución de beneficio: después de TP1 conviene evaluar protección a break-even o beneficio, primero en simulación.");
  }
  if (!suggestions.length && losses === 0) {
    suggestions.push("Sin pérdidas registradas hoy: mantener el SL técnico actual y no aflojarlo sin más muestras.");
  } else if (!suggestions.length) {
    suggestions.push("Mantener el SL detrás de la invalidación técnica; no moverlo para aumentar riesgo después de abrir el trade.");
  }
  suggestions.push("Cualquier cambio de distancia o gestión del SL debe probarse en A/B simulado antes de aplicarse al bot.");
  return suggestions.slice(0, 3);
}

function formatAiSimulationExperiment(value) {
  if (!value?.enabled || value?.simulationOnly !== true) return "";
  const baseline = value.baseline || {};
  const ai = value.ai || {};
  const top = Array.isArray(value.topRejections) && value.topRejections[0]
    ? ` | top AI filter: ${escapeHtml(value.topRejections[0].reason)} (${Number(value.topRejections[0].count || 0)})`
    : "";
  const quality = ["A", "B", "C"].map((tier) => {
    const bucket = value?.quality?.[tier] || {};
    return `${tier} ${Number(bucket.wins || 0)}W/${Number(bucket.losses || 0)}L (${bucket.calibrated ? `${Number(bucket.winRate || 0).toFixed(1)}%` : `muestra ${Number(bucket.decided || 0)}/${Number(value.minimumCalibrationSamples || 30)}`})`;
  }).join(" | ");
  return `Simulation A/B: baseline ${Number(baseline.candidates || 0)} candidates, ${Number(baseline.wins || 0)}W/${Number(baseline.losses || 0)}L (${Number(baseline.winRate || 0).toFixed(1)}%) | AI variant ${Number(ai.candidates || 0)} candidates, ${Number(ai.wins || 0)}W/${Number(ai.losses || 0)}L (${Number(ai.winRate || 0).toFixed(1)}%)\nCalibración: ${quality}${top}`;
}

export function executorRejectionSnapshot(input = {}) {
  const decisions = input?.decisions || {};
  const rejected = Object.entries(decisions.rejected || {})
    .map(([reason, count]) => [String(reason || "unknown").slice(0, 140), Number(count) || 0])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const examples = (Array.isArray(decisions.examples) ? decisions.examples : [])
    .map((item) => [
      String(item?.pair || "").slice(0, 40),
      String(item?.side || "").slice(0, 12),
      Number(item?.score || 0),
      String(item?.reason || "").slice(0, 140)
    ])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const stable = JSON.stringify({
    rejected,
    examples,
    totalSignals: Number(decisions.totalSignals || 0),
    newSignals: Number(decisions.newSignals || 0),
    recentOpenSignals: Number(decisions.recentOpenSignals || 0),
    executableSignals: Number(decisions.executableSignals || 0)
  });
  let hash = 2166136261;
  for (let index = 0; index < stable.length; index += 1) {
    hash ^= stable.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function formatExecutorMarketDirection(direction) {
  if (!direction || !Number(direction.samples || 0)) return "";
  const bias = String(direction.bias || "mixed").toLowerCase();
  const icon = bias === "bullish" ? "🟢" : bias === "bearish" ? "🔴" : "🟡";
  const guidance = bias === "bullish"
    ? "favorece LONG; SHORT va contra mercado"
    : bias === "bearish"
      ? "favorece SHORT; LONG va contra mercado"
      : "sin lado favorecido; exigir mas confirmacion";
  return `${icon} Direccion dominante: <b>${escapeHtml(direction.label || "MIXTA / SIN DIRECCION CLARA")}</b> | score ${Number(direction.score || 0).toFixed(1)}\nAmplitud: ${Number(direction.bullishPercent || 0).toFixed(0)}% alcista / ${Number(direction.bearishPercent || 0).toFixed(0)}% bajista / ${Number(direction.mixedPercent || 0).toFixed(0)}% mixta | ${escapeHtml(guidance)}`;
}

export function dayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isMiamiDailyReportDue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (Number(values.hour) * 60) + Number(values.minute) >= 21 * 60;
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
