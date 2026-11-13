import {corsHeaders, jsonResponse, redisRequest} from '../lib/server.js';
export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || '');
  const provided = request.headers.get('x-jamd-cron') || '';
  if (!secret || provided !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  try {
    const rows = await redisRequest('pipeline', [['GET', 'jamd:account:last-error'], ['GET', 'jamd:diag:controls'], ['GET', 'jamd:x:last']]);
    const raw = rows?.[0]?.result || null;
    const controls = rows?.[1]?.result || null;
    const xLast = rows?.[2]?.result || null;
    return jsonResponse(request, { lastError: raw ? JSON.parse(raw) : null, controls: controls ? JSON.parse(controls) : null, x: xLast ? JSON.parse(xLast) : null });
  } catch { return jsonResponse(request, { error: { message: 'STORE_UNAVAILABLE' } }, 503); }
}
