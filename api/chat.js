import {
  corsHeaders,
  enforceRateLimits,
  hashIdentifier,
  isServiceConfigured,
  jsonResponse
} from "../lib/server.js";
import { authenticateTrial, trialHash } from "../lib/web-trial-session.js";
import { consumeTrial, refundTrial } from "../lib/trial-credits.js";

export const config = { runtime: "edge" };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_BODY_BYTES = 4_000_000;
const MAX_MESSAGES = 20;

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: { message: "Método no permitido." } }, 405);
  }
  if (!isServiceConfigured()) {
    return jsonResponse(request, {
      error: { message: "El acceso automático de JamdDmaj todavía no está configurado en Vercel." }
    }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(request, { error: { message: "La solicitud es demasiado grande." } }, 413);
  }

  const deviceId = normalizeDeviceId(request.headers.get("x-jamddmaj-device"));
  if (!deviceId) {
    return jsonResponse(request, { error: { message: "No se pudo identificar este dispositivo." } }, 400);
  }

  let trialAccount, trialRequest, reserved = false;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(request, { error: { message: "La solicitud es demasiado grande." } }, 413);
    }
    let input;
    try {
      input = JSON.parse(rawBody);
    } catch {
      return jsonResponse(request, { error: { message: "La solicitud no contiene datos válidos." } }, 400);
    }
    const messages = sanitizeMessages(input.messages);
    if (!messages.length) {
      return jsonResponse(request, { error: { message: "No se recibió ningún mensaje válido." } }, 400);
    }

    const usage = await enforceRateLimits(request, deviceId);
    trialAccount = await authenticateTrial(request);
    if (!/^[a-f0-9-]{36}$/.test(input.trialRequestId || "")) {
      return jsonResponse(request, {error:{code:"trial-request"}},400);
    }
    trialRequest = await trialHash(input.trialRequestId);
    const trial = await consumeTrial(trialAccount, trialRequest);
    if (trial.status !== "active") return jsonResponse(request,{error:{code:`trial-${trial.status}`}},403);
    reserved = true;
    const configuredModel = String(process.env.JAMDDMAJ_OPENROUTER_MODEL || "openrouter/free").trim();
    const allowPaid = process.env.JAMDDMAJ_ALLOW_PAID_MODELS === "true";
    const model = allowPaid || configuredModel === "openrouter/free" || configuredModel.endsWith(":free")
      ? configuredModel
      : "openrouter/free";
    const userHash = await hashIdentifier(deviceId);
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.jamddmaj.com/",
        "X-OpenRouter-Title": "JamdDmaj AI"
      },
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: clampNumber(input.max_tokens, 100, 1400, 800),
        temperature: clampNumber(input.temperature, 0, 1.2, 0.55),
        provider: { allow_fallbacks: true },
        user: `jamd-${userHash}`,
        messages
      }),
      signal: AbortSignal.timeout(60000)
    });

    const headers = {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      "X-JamdDmaj-Remaining": String(usage.remaining)
    };
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;
    if (!upstream.ok) {
      await refundTrial(trialAccount, trialRequest);
      reserved = false;
      let message = `El proveedor de IA respondió con error ${upstream.status}.`;
      try {
        const data = await upstream.json();
        message = data.error?.message || message;
      } catch {}
      return jsonResponse(request, { error: { code: "trial-upstream" } }, upstream.status, headers);
    }
    const completed = await upstream.json();
    const content = completed.choices?.[0]?.message?.content;
    if (completed.error || typeof content !== "string" || !content.trim()) throw new Error("trial-empty-response");
    reserved = false;
    headers["Content-Type"] = input.stream !== false ? "text/event-stream" : "application/json";
    const responseBody = input.stream !== false
      ? `data: ${JSON.stringify({choices:[{delta:{content},finish_reason:null}]})}\n\ndata: [DONE]\n\n`
      : JSON.stringify(completed);
    return new Response(responseBody, {
      status: upstream.status,
      headers
    });
  } catch (error) {
    if (reserved) {
      try { await refundTrial(trialAccount, trialRequest); }
      catch { console.error("trial-refund-reconciliation-required", trialRequest); }
    }
    const status = Number(error.status) || 500;
    const message = status === 429
      ? error.message
      : "El acceso automático no está disponible temporalmente.";
    return jsonResponse(request, { error: { code: status === 401 ? "trial-login" : "trial-unavailable" } }, status);
  }
}

function normalizeDeviceId(value) {
  const clean = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{16,100}$/.test(clean) ? clean : "";
}

function sanitizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_MESSAGES).flatMap((message) => {
    const role = ["system", "user", "assistant"].includes(message?.role) ? message.role : "";
    if (!role) return [];
    if (typeof message.content === "string") {
      return [{ role, content: message.content.slice(0, 50000) }];
    }
    if (role !== "user" || !Array.isArray(message.content)) return [];
    const parts = message.content.slice(0, 4).flatMap((part) => {
      if (part?.type === "text" && typeof part.text === "string") {
        return [{ type: "text", text: part.text.slice(0, 50000) }];
      }
      const imageUrl = part?.image_url?.url;
      if (
        part?.type === "image_url"
        && typeof imageUrl === "string"
        && (imageUrl.startsWith("data:image/") || imageUrl.startsWith("https://"))
      ) {
        return [{ type: "image_url", image_url: { url: imageUrl } }];
      }
      return [];
    });
    return parts.length ? [{ role, content: parts }] : [];
  });
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
