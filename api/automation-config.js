import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

async function redis(...command) {
  const base = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!base || !token) return null;
  try {
    const response = await fetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(6000) });
    const data = await response.json().catch(() => null);
    return response.ok ? data?.result ?? null : null;
  } catch { return null; }
}

const validDevice = value => /^[A-Za-z0-9_-]{16,64}$/.test(String(value || ''));
const bound = (value, min, max) => { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : null; };

function normalize(input) {
  const margin = bound(input?.marginUsdc, 1, 100000);
  const maxOpen = bound(input?.maxOpen, 1, 10);
  const minScore = bound(input?.minScore, 0, 100);
  const mode = ['off', 'watch', 'auto'].includes(String(input?.mode)) ? String(input.mode) : 'off';
  if (margin === null && maxOpen === null && minScore === null) return null;
  return { marginUsdc: margin, maxOpen: maxOpen === null ? null : Math.round(maxOpen), minScore: minScore === null ? null : Math.round(minScore), mode, updatedAt: Date.now() };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const device = url.searchParams.get('device') || '';
    if (!validDevice(device)) return jsonResponse(request, { error: { message: 'Invalid device' } }, 400);
    const raw = await redis('GET', 'jamd:auto:config:' + device);
    let value = null;
    try { value = raw ? JSON.parse(raw) : null; } catch {}
    return jsonResponse(request, { device, config: value });
  }
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const device = String(body?.device || '');
  if (!validDevice(device)) return jsonResponse(request, { error: { message: 'Invalid device' } }, 400);
  const config = normalize(body?.config);
  if (!config) return jsonResponse(request, { error: { message: 'Invalid configuration' } }, 400);
  const saved = await redis('SET', 'jamd:auto:config:' + device, JSON.stringify(config));
  if (saved === null) return jsonResponse(request, { error: { message: 'STORE_UNAVAILABLE' } }, 503);
  return jsonResponse(request, { ok: true, config });
}
