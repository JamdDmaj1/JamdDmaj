const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.jamddmaj.com",
  "https://jamddmaj.com",
  "https://jamd-dmaj.vercel.app",
  "https://localhost",
  "capacitor://localhost",
  "http://localhost"
];

const RATE_LIMIT_SCRIPT = `#!lua flags=allow-key-locking
local counts = {}
for index, key in ipairs(KEYS) do
  local count = redis.call("INCR", key)
  if count == 1 then
    redis.call("EXPIRE", key, tonumber(ARGV[index]))
  end
  counts[index] = count
end
return counts
`;

export function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const configured = String(process.env.JAMDDMAJ_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
  const allowOrigin = allowed.has(origin) || /^https:\/\/jamd-dmaj-[a-z0-9-]+\.vercel\.app$/i.test(origin)
    ? origin
    : "https://www.jamddmaj.com";
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
  const command = [
    "EVAL",
    RATE_LIMIT_SCRIPT,
    keys.length,
    ...keys.map(({ key }) => key),
    ...keys.map(({ ttl }) => ttl)
  ];
  const results = await redisRequest("pipeline", [command]);
  const counts = Array.isArray(results[0]?.result)
    ? results[0].result.map((count) => Number(count || 0))
    : [];
  if (counts.length !== keys.length) throw new Error("La respuesta del control de uso no fue válida.");
  const exceeded = keys.find(({ limit }, index) => counts[index] > limit);
  if (!exceeded) {
    return {
      remaining: Math.max(0, dailyLimit - counts[2]),
      reset: dayWindow
    };
  }
  const error = new Error("Se alcanzó el límite temporal de JamdDmaj. Espera un momento e inténtalo de nuevo.");
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
