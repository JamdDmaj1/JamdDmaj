import { corsHeaders, jsonResponse } from "../lib/server.js";
import { readJamdDevnetBalance } from "../lib/jamd-devnet-balance.js";
import { normalizePublicKey } from "../lib/fair-launch-devnet-verifier.js";
export const config = { runtime: "edge" };
const cache = new Map();
export default async function handler(request) {
  const headers = { "Cache-Control": "no-store" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET") return jsonResponse(request, { error: { code: "method" } }, 405, headers);
  const owner = new URL(request.url).searchParams.get("address") || "";
  try { normalizePublicKey(owner); } catch { return jsonResponse(request, { error: { code: "address" } }, 400, headers); }
  try {
    const cached = cache.get(owner);
    if (cached && Date.now() - cached.at < 20000) return jsonResponse(request, cached.data, 200, headers);
    const data = await readJamdDevnetBalance(owner);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(owner, { at: Date.now(), data });
    return jsonResponse(request, data, 200, headers);
  }
  catch { return jsonResponse(request, { error: { code: "unavailable" } }, 502, headers); }
}
