import {
  corsHeaders,
  hashIdentifier,
  jsonResponse,
  redisRequest
} from "../lib/server.js";

export const config = { runtime: "edge" };

const TELEGRAM_API = "https://api.telegram.org";

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Metodo no permitido." } }, 405);
  }

  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  const signalChannelId = String(process.env.TELEGRAM_SIGNAL_CHANNEL_ID || "").trim();
  const ownerDevice = String(process.env.JAMDDMAJ_TELEGRAM_DEVICE_ID || "").trim();
  if (!botToken || !chatId || !ownerDevice) {
    return jsonResponse(request, {
      error: { message: "Telegram aun no esta configurado en Vercel." }
    }, 503);
  }

  const deviceId = String(request.headers.get("x-jamddmaj-device") || "").trim();
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(deviceId) || deviceId !== ownerDevice) {
    return jsonResponse(request, {
      error: { message: "Este dispositivo no esta autorizado para enviar alertas." }
    }, 403);
  }

  try {
    const input = await request.json();
    if (input?.action === "status") {
      return jsonResponse(request, {
        ok: true,
        configured: true,
        authorized: true,
        signalMirrorConfigured: Boolean(signalChannelId && signalChannelId !== chatId)
      });
    }
    if (input?.action === "test") {
      const deviceHash = await hashIdentifier(deviceId);
      const allowed = await claimOnce(`jamd:telegram:test:${deviceHash}`, 20);
      if (!allowed) {
        return jsonResponse(request, { ok: true, sent: false, duplicate: true });
      }
      const testText = [
        "✅ <b>JamdDmaj Pro Signals conectado</b>",
        "",
        "Las alertas de Trade ya pueden llegar a este canal.",
        `🕒 ${formatDate(new Date().toISOString())}`
      ].join("\n");
      await sendTelegram(botToken, chatId, testText);
      const mirror = await sendSignalMirror(botToken, chatId, signalChannelId, testText);
      return jsonResponse(request, { ok: true, sent: true, ...mirror });
    }

    if (input?.action !== "signal") {
      return jsonResponse(request, { error: { message: "Accion invalida." } }, 400);
    }
    const signal = sanitizeSignal(input.signal);
    if (!signal) {
      return jsonResponse(request, { error: { message: "La senal no es valida." } }, 400);
    }
    if (signal.score < 5) {
      return jsonResponse(request, { ok: true, sent: false, lowScore: true });
    }

    const force = input?.force === true;
    if (!force) {
      const cooldownMinutes = clampCooldown(input?.cooldownMinutes);
      const signature = await hashIdentifier(`${chatId}:${signal.symbol}:${signal.side}`);
      const claimed = await claimOnce(`jamd:telegram:signal:${signature}`, cooldownMinutes * 60);
      if (!claimed) {
        return jsonResponse(request, { ok: true, sent: false, duplicate: true });
      }
    }

    const text = formatSignal(signal);
    await sendTelegram(botToken, chatId, text);
    const mirror = await sendSignalMirror(botToken, chatId, signalChannelId, text);
    return jsonResponse(request, { ok: true, sent: true, ...mirror });
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "No se pudo enviar la alerta a Telegram." }
    }, Number(error?.status) || 500);
  }
}

async function sendSignalMirror(token, primaryChatId, signalChannelId, text) {
  if (!signalChannelId || signalChannelId === primaryChatId) {
    return { mirrorConfigured: false, mirrorSent: false };
  }
  try {
    await sendTelegram(token, signalChannelId, text);
    return { mirrorConfigured: true, mirrorSent: true };
  } catch (error) {
    return {
      mirrorConfigured: true,
      mirrorSent: false,
      mirrorError: String(error?.message || "Telegram mirror failed.").slice(0, 180)
    };
  }
}

async function claimOnce(key, ttlSeconds) {
  const result = await redisRequest("pipeline", [["SET", key, "1", "NX", "EX", ttlSeconds]]);
  return result?.[0]?.result === "OK";
}

async function sendTelegram(token, chatId, text) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  if (response.ok) return;
  let message = `Telegram respondio con error ${response.status}.`;
  try {
    const data = await response.json();
    message = data.description || message;
  } catch {}
  const error = new Error(message);
  error.status = 502;
  throw error;
}

function sanitizeSignal(value) {
  const symbol = String(value?.symbol || "").trim().slice(0, 40);
  const side = String(value?.side || "").toUpperCase();
  const score = Number(value?.score);
  const entry = Number(value?.entry);
  const sl = Number(value?.sl);
  const tp1 = Number(value?.tp1);
  const tp2 = Number(value?.tp2);
  const tp3 = Number(value?.tp3);
  if (!symbol || !["LONG", "SHORT"].includes(side)) return null;
  if (![score, entry, sl, tp1, tp2, tp3].every(Number.isFinite)) return null;
  return {
    symbol,
    side,
    score,
    maxScore: Number(value?.maxScore) || 13,
    confidence: String(value?.confidence || "C").slice(0, 2),
    category: String(value?.category || "Market").slice(0, 80),
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    createdAt: String(value?.createdAt || "").slice(0, 40),
    validUntil: String(value?.validUntil || "").slice(0, 40),
    summary: String(value?.summary || "").replace(/\s+/g, " ").slice(0, 700),
    marketCap: Number(value?.marketCap) || 0,
    marketCapRank: Number(value?.marketCapRank) || 0,
    venue: String((Array.isArray(value?.venues) ? value.venues : [value?.venue]).filter(Boolean).join(" + ")).slice(0, 80),
    plannedUsd: Number(value?.plannedUsd) || 25,
    leverage: Number(value?.leverage) || 10,
    protectionTriggerRoe: Number(value?.protectionTriggerRoe) || 4,
    protectionLockRoe: Number(value?.protectionLockRoe) || 2
  };
}

function formatSignal(signal) {
  const sideEmoji = signal.side === "LONG" ? "🟢" : "🔴";
  const lowCapWarning = signal.marketCap > 0 && signal.marketCap < 250_000_000
    ? `⚠️ <b>${signal.marketCap < 50_000_000 ? "MICRO CAP" : "SMALL CAP"}:</b> mayor riesgo de volatilidad y slippage.`
    : "";
  return [
    "🚀 <b>JamdDmaj Pro Signal</b>",
    "",
    `${sideEmoji} <b>${escapeHtml(signal.side)}</b>`,
    `📊 <code>${escapeHtml(signal.symbol)}</code>`,
    `🏷️ ${escapeHtml(signal.category)} | ${escapeHtml(signal.confidence)} ${signal.score}/${signal.maxScore}`,
    signal.venue ? `🏛️ Venue: ${escapeHtml(signal.venue)}` : "",
    `📈 Market cap: ${signal.marketCap ? `$${formatCompact(signal.marketCap)}${signal.marketCapRank ? ` (#${signal.marketCapRank})` : ""}` : "no disponible"}`,
    `💵 Plan: $${signal.plannedUsd.toFixed(2)} a ${signal.leverage}x (no ejecutado)`,
    "",
    `🎯 <b>Entrada:</b> <code>${formatPrice(signal.entry)}</code>`,
    `✅ <b>TP1:</b> <code>${formatPrice(signal.tp1)}</code>`,
    `✅ <b>TP2:</b> <code>${formatPrice(signal.tp2)}</code>`,
    `✅ <b>TP3:</b> <code>${formatPrice(signal.tp3)}</code>`,
    `🚧 <b>Invalidacion sugerida:</b> <code>${formatPrice(signal.sl)}</code>`,
    signal.createdAt ? `🕒 <b>Creada:</b> ${formatDate(signal.createdAt)}` : "",
    signal.validUntil ? `🔎 <b>Monitoreada hasta:</b> ${formatDate(signal.validUntil)}` : "",
    lowCapWarning,
    "",
    `🧠 <b>Motivo:</b>\n${escapeHtml(signal.summary || "Confirma liquidez, noticias y tu propio riesgo.")}`,
    "",
    "⚠️ <i>Monitoreo educativo. JamdDmaj no coloca SL ni ejecuta ordenes automaticamente.</i>"
  ].filter(Boolean).join("\n");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
  return date.toLocaleString("es-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function clampCooldown(value) {
  const minutes = Number(value);
  return [5, 15, 30, 75].includes(minutes) ? minutes : 75;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPrice(value) {
  const absolute = Math.abs(value);
  const decimals = absolute >= 1000 ? 2 : absolute >= 1 ? 4 : absolute >= 0.01 ? 6 : absolute >= 0.0001 ? 8 : 12;
  return `$${value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
