import {corsHeaders, jsonResponse, redisRequest} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Fija la identidad canonica de un email de Google. Solo con la clave interna.
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || '');
  if (!secret || (request.headers.get('x-jamd-cron') || '') !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  const url = new URL(request.url);
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const account = String(url.searchParams.get('account') || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^[a-f0-9]{64}$/.test(account)) return jsonResponse(request, { error: { message: 'INVALID' } }, 400);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('google-email:' + email));
  const emailHash = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const key = 'jamd:account:email:' + emailHash;
  const saved = await redisRequest('pipeline', [['SET', key, account, 'EX', 63072000]]);
  if (saved?.[0]?.error) return jsonResponse(request, { error: { message: 'STORE_UNAVAILABLE' } }, 503);
  return jsonResponse(request, { ok: true, key });
}
