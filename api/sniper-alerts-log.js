import {corsHeaders, jsonResponse} from '../lib/server.js';
import {readAlerts} from '../lib/sniper-alerts-store.js';
export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || process.env.JAMDDMAJ_CRON_SECRET || '');
  const provided = request.headers.get('x-jamd-cron') || (new URL(request.url).searchParams.get('secret') || '');
  if (!secret || provided !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get('limit')) || 50));
  const items = await readAlerts(limit);
  return jsonResponse(request, { count: items.length, items });
}
