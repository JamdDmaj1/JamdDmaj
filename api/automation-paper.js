import {corsHeaders, jsonResponse} from '../lib/server.js';
import {getProServerState} from '../lib/pro-signals.js';
export const config = { runtime: 'edge' };

async function redis(...command) {
  const base = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!base || !token) return null;
  try {
    const response = await fetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => null);
    return response.ok ? data?.result ?? null : null;
  } catch { return null; }
}

const validDevice = value => /^[A-Za-z0-9_-]{16,64}$/.test(String(value || ''));
const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback } catch { return fallback } };
const paperKey = device => 'jamd:auto:paper:' + device;
const configKey = device => 'jamd:auto:config:' + device;
const TTL = 60 * 60 * 24 * 30;

function evaluate(open, config, paper) {
  const taken = new Set(paper.map(item => item.signalId));
  const active = paper.filter(item => item.status === 'OPEN');
  const maxOpen = Number(config.maxOpen) || 1;
  const minScore = Number(config.minScore) || 0;
  const margin = Number(config.marginUsdc) || 0;
  const added = [];
  for (const signal of open) {
    if (active.length >= maxOpen) break;
    const signalId = String(signal.id || signal.telegramMessageId || signal.pair + ':' + signal.side + ':' + signal.createdAt);
    if (taken.has(signalId)) continue;
    const score = Number(signal.score) || 0;
    if (score < minScore) continue;
    if (!(Number(signal.entry) > 0) || margin <= 0) continue;
    if (!['LONG', 'SHORT'].includes(String(signal.side))) continue;
    const item = {
      id: 'paper-' + Date.now().toString(36) + '-' + added.length,
      signalId,
      pair: String(signal.pair || signal.symbol || ''),
      side: String(signal.side),
      entry: Number(signal.entry),
      marginUsd: margin,
      score,
      tp1: Number(signal.tp1) || null,
      sl: Number(signal.sl) || null,
      status: 'OPEN',
      openedAt: Date.now(),
      note: 'simulacion'
    };
    added.push(item);
    taken.add(signalId);
    active.push(item);
  }
  return added;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const device = url.searchParams.get('device') || '';
    if (!validDevice(device)) return jsonResponse(request, { error: { message: 'Invalid device' } }, 400);
    const [configRaw, paperRaw] = await Promise.all([redis('GET', configKey(device)), redis('GET', paperKey(device))]);
    return jsonResponse(request, { device, config: parse(configRaw, null), paper: parse(paperRaw, []) });
  }
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const device = String(body?.device || '');
  if (!validDevice(device)) return jsonResponse(request, { error: { message: 'Invalid device' } }, 400);
  const config = parse(await redis('GET', configKey(device)), null);
  if (!config) return jsonResponse(request, { mode: 'unconfigured', paper: [], added: [] });
  if (String(config.mode) === 'off') return jsonResponse(request, { mode: 'off', paper: parse(await redis('GET', paperKey(device)), []), added: [] });

  let state;
  try { state = await getProServerState(); } catch { return jsonResponse(request, { error: { message: 'SIGNALS_UNAVAILABLE' } }, 503); }
  const open = Array.isArray(state?.open) ? state.open.filter(signal => signal && signal.status === 'OPEN' && Date.now() - Date.parse(signal.createdAt || 0) <= 86400000) : [];
  if (body?.reset === true) {
    await redis('SET', paperKey(device), JSON.stringify([]), 'EX', TTL);
    return jsonResponse(request, { mode: config.mode, paper: [], added: [] });
  }
  const paper = parse(await redis('GET', paperKey(device)), []);
  const added = evaluate(open, config, paper);
  if (added.length) {
    const next = [...added, ...paper].slice(0, 100);
    await redis('SET', paperKey(device), JSON.stringify(next), 'EX', TTL);
    return jsonResponse(request, { mode: config.mode, added, paper: next });
  }
  return jsonResponse(request, { mode: config.mode, added: [], paper });
}
