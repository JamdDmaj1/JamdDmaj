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
    if (input?.action === "test") {
      const deviceHash = await hashIdentifier(deviceId);
      const allowed = await claimOnce(`jamd:telegram:test:${deviceHash}`, 20);
      if (!allowed) {
        return jsonResponse(request, { ok: true, sent: false, duplicate: true });
      }
      await sendTelegram(botToken, chatId, [
        "JamdDmaj Pro Signals conectado",
        "",
        "Las alertas de Trade ya pueden llegar a este chat.",
        `Hora: ${new Date().toISOString()}`
      ].join("\n"));
      return jsonResponse(request, { ok: true, sent: true });
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

    const signature = await hashIdentifier(`${signal.symbol}:${signal.side}`);
    const claimed = await claimOnce(`jamd:telegram:signal:${signature}`, 4500);
    if (!claimed) {
      return jsonResponse(request, { ok: true, sent: false, duplicate: true });
    }

    await sendTelegram(botToken, chatId, formatSignal(signal));
    return jsonResponse(request, { ok: true, sent: true });
  } catch (error) {
    return jsonResponse(request, {
      error: { message: error?.message || "No se pudo enviar la alerta a Telegram." }
    }, Number(error?.status) || 500);
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
    maxScore: Number(value?.maxScore) || 8,
    confidence: String(value?.confidence || "C").slice(0, 2),
    category: String(value?.category || "Market").slice(0, 80),
    entry,
    sl,
    tp1,
    tp2,
    tp3,
    createdAt: String(value?.createdAt || "").slice(0, 40),
    validUntil: String(value?.validUntil || "").slice(0, 40),
    summary: String(value?.summary || "").replace(/\s+/g, " ").slice(0, 700)
  };
}

function formatSignal(signal) {
  return [
    `JamdDmaj Pro Signal - ${signal.confidence}`,
    "",
    `${signal.symbol} | ${signal.side}`,
    `Categoria: ${signal.category}`,
    `Entrada: ${formatPrice(signal.entry)}`,
    `TP1: ${formatPrice(signal.tp1)}`,
    `TP2: ${formatPrice(signal.tp2)}`,
    `TP3: ${formatPrice(signal.tp3)}`,
    `SL: ${formatPrice(signal.sl)}`,
    `Score: ${signal.score}/${signal.maxScore}`,
    signal.createdAt ? `Creada: ${signal.createdAt}` : "",
    signal.validUntil ? `Valida hasta: ${signal.validUntil}` : "",
    "",
    signal.summary || "Confirma liquidez, noticias y tu propio riesgo.",
    "",
    "Senal educativa. No ejecuta ordenes automaticamente."
  ].filter(Boolean).join("\n");
}

function formatPrice(value) {
  const absolute = Math.abs(value);
  const decimals = absolute >= 1000 ? 2 : absolute >= 1 ? 4 : absolute >= 0.01 ? 6 : absolute >= 0.0001 ? 8 : 12;
  return `$${value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")}`;
}
