import {corsHeaders, jsonResponse} from '../lib/server.js';
import {saveWatchlist, readWatchlist} from '../lib/sniper-alerts-store.js';
export const config = { runtime: 'edge' };

const validDevice = value => /^[A-Za-z0-9_-]{16,64}$/.test(String(value || ''));
const validMint = value => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || ''));

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const device = url.searchParams.get('device') || '';
    if (!validDevice(device)) return jsonResponse(request, { error: { message: 'Invalid device' } }, 400);
    const items = await readWatchlist(device);
    return jsonResponse(request, { device, items });
  }
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const device = String(body?.device || '');
  if (!validDevice(device)) return jsonResponse(request, { error: { message: 'Invalid device' } }, 400);
  const entries = (Array.isArray(body?.items) ? body.items : [])
    .filter(item => validMint(item?.mint))
    .map(item => ({ mint: String(item.mint), symbol: String(item.symbol || '').slice(0, 20), pool: String(item.pool || '').slice(0, 44) }))
    .slice(0, 40);
  try {
    await saveWatchlist(device, entries);
    return jsonResponse(request, { ok: true, count: entries.length });
  } catch (error) {
    return jsonResponse(request, { error: { message: String(error?.message || error) } }, 503);
  }
}
