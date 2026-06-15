const DEFAULT_ALLOWED_ORIGINS = [
  "https://jamd-dmaj.vercel.app",
  "https://localhost",
  "capacitor://localhost",
  "http://localhost"
];

export function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const configured = String(process.env.JAMDDMAJ_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
  const allowOrigin = allowed.has(origin) || /^https:\/\/jamd-dmaj-[a-z0-9-]+\.vercel\.app$/i.test(origin)
    ? origin
    : "https://jamd-dmaj.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, X-JamdDmaj-Device, X-JamdDmaj-Version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export function jsonResponse(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

export function isServiceConfigured() {
  return Boolean(
    process.env.OPENROUTER_API_KEY
    && process.env.UPSTASH_REDIS_REST_URL
    && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function getClientIp(request) {
  return (
    request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "unknown"
  ).split(",")[0].trim();
}

export async function hashIdentifier(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function enforceRateLimits(request, deviceId) {
  const ipHash = await hashIdentifier(getClientIp(request));
  const deviceHash = await hashIdentifier(deviceId);
  const hourWindow = Math.floor(Date.now() / 3600000);
  const dayWindow = new Date().toISOString().slice(0, 10);
  const hourlyLimit = positiveInteger(process.env.JAMDDMAJ_HOURLY_LIMIT, 25);
  const dailyLimit = positiveInteger(process.env.JAMDDMAJ_DAILY_LIMIT, 80);
  const ipHourlyLimit = positiveInteger(process.env.JAMDDMAJ_IP_HOURLY_LIMIT, 100);
  const ipDailyLimit = positiveInteger(process.env.JAMDDMAJ_IP_DAILY_LIMIT, 250);
  const globalLimit = positiveInteger(process.env.JAMDDMAJ_GLOBAL_DAILY_LIMIT, 1000);
  const keys = [
    { name: "device-hour", key: `jamd:hour:${deviceHash}:${hourWindow}`, limit: hourlyLimit, ttl: 3700 },
    { name: "ip-hour", key: `jamd:ip-hour:${ipHash}:${hourWindow}`, limit: ipHourlyLimit, ttl: 3700 },
    { name: "device-day", key: `jamd:day:${deviceHash}:${dayWindow}`, limit: dailyLimit, ttl: 90000 },
    { name: "ip-day", key: `jamd:ip-day:${ipHash}:${dayWindow}`, limit: ipDailyLimit, ttl: 90000 },
    { name: "global-day", key: `jamd:global:${dayWindow}`, limit: globalLimit, ttl: 90000 }
  ];
  const commands = keys.flatMap(({ key, ttl }) => [
    ["INCR", key],
    ["EXPIRE", key, ttl]
  ]);
  const results = await redisRequest("pipeline", commands);
  const counts = keys.map((_, index) => Number(results[index * 2]?.result || 0));
  const exceeded = keys.find(({ limit }, index) => counts[index] > limit);
  if (!exceeded) {
    return {
      remaining: Math.max(0, dailyLimit - counts[2]),
      reset: dayWindow
    };
  }
  const error = new Error("Se alcanzó el límite gratuito temporal de JamdDmaj. Inténtalo más tarde o conecta tu cuenta personal de OpenRouter.");
  error.status = 429;
  error.limit = exceeded.limit;
  throw error;
}

export async function redisRequest(path, body) {
  const baseUrl = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("No se pudo comprobar el límite de uso.");
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("La respuesta del control de uso no fue válida.");
  return data;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
