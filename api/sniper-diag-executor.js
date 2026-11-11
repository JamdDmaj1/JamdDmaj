import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

async function redis(command) {
  const base = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!base || !token) return null;
  try {
    const response = await fetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(7000) });
    const data = await response.json().catch(() => null);
    return data?.result ?? null;
  } catch { return null; }
}

const parse = value => { try { return value ? JSON.parse(value) : null; } catch { return value; } };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || '');
  const provided = request.headers.get('x-jamd-cron') || (new URL(request.url).searchParams.get('secret') || '');
  if (!secret || provided !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  const [configRaw, statusRaw, executorRaw, openRaw] = await Promise.all([
    redis(['GET', 'jamd:pro:server:config']),
    redis(['GET', 'jamd:pro:server:status']),
    redis(['GET', 'jamd:pro:executor:status']),
    redis(['GET', 'jamd:pro:server:open'])
  ]);
  const config = parse(configRaw) || {};
  const open = parse(openRaw);
  return jsonResponse(request, {
    livePaused: config.livePaused === true,
    config: { livePaused: config.livePaused, minScore: config.minScore, maxOpen: config.maxOpen, maxMarginUsd: config.maxMarginUsd, updatedAt: config.updatedAt },
    executor: parse(executorRaw),
    serverStatus: parse(statusRaw),
    openCount: Array.isArray(open) ? open.length : null
  });
}
