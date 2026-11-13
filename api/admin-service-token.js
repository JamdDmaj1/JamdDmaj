import {corsHeaders, jsonResponse, redisRequest, hashIdentifier} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Issues a scoped session token for the TP/SL watcher. Sniper-token protected.
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || '');
  if (!secret || (request.headers.get('x-jamd-cron') || '') !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  const url = new URL(request.url);
  const account = String(url.searchParams.get('account') || '');
  if (!/^[a-f0-9]{64}$/.test(account)) return jsonResponse(request, { error: { message: 'INVALID' } }, 400);
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  const saved = await redisRequest('pipeline', [['SET', 'jamd:trial:session:' + await hashIdentifier(token), account, 'EX', 63072000]]);
  if (saved?.[0]?.error) return jsonResponse(request, { error: { message: 'STORE' } }, 503);
  return jsonResponse(request, { ok: true, token, accountPrefix: account.slice(0, 8) });
}
