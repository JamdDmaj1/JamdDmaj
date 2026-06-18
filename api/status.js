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
    version: "1.16.0"
  });
}
