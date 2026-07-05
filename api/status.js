import { corsHeaders, isServiceConfigured, jsonResponse } from "../lib/server.js";

export const config = { runtime: "edge" };

export default function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "GET") {
    return jsonResponse(request, { error: { message: "Método no permitido." } }, 405);
  }
  return jsonResponse(request, {
    ready: isServiceConfigured(),
    mode: "managed-free-chat",
    backup: isServiceConfigured(),
    liveSearch: isServiceConfigured(),
    proServer: Boolean(
      process.env.UPSTASH_REDIS_REST_URL
      && process.env.UPSTASH_REDIS_REST_TOKEN
      && process.env.JAMDDMAJ_CRON_SECRET
    ),
    googleAccount: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.JAMDDMAJ_ACCOUNT_SECRET),
    version: "1.36.4",
    latestVersion: String(process.env.JAMDDMAJ_LATEST_VERSION || "1.36.4"),
    apkUrl: String(
      process.env.JAMDDMAJ_APK_URL
      || "https://github.com/JamdDmaj1/JamdDmaj/releases/latest/download/JamdDmaj-AI.apk"
    )
  });
}
