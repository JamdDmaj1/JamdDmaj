import {corsHeaders, jsonResponse, redisRequest, hashIdentifier} from '../lib/server.js';
import {authenticateTrial} from '../lib/web-trial-session.js';
import {ACCOUNT_COOKIE} from '../lib/browser-account-session.js';
export const config = { runtime: 'edge' };

const cookieToken = request => {
  const cookie = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(ACCOUNT_COOKIE + '='));
  const value = cookie ? cookie.slice(ACCOUNT_COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
};
const bearer = request => {
  const header = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  return /^[a-f0-9]{64}$/.test(header) ? header : '';
};
async function accountOf(request) {
  const token = bearer(request) || cookieToken(request);
  if (!token) return '';
  try { const account = await authenticateTrial(new Request(request.url, { headers: { Authorization: 'Bearer ' + token } })); return /^[a-f0-9]{64}$/.test(account) ? account : ''; } catch { return ''; }
}
const keyOf = account => 'jamd:protect:' + account;

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const account = await accountOf(request);
  if (!account) return jsonResponse(request, { error: { message: 'LOGIN_REQUIRED' } }, 401);
  const key = keyOf(account);

  if (request.method === 'GET') {
    const rows = await redisRequest('pipeline', [['GET', key]]);
    const rules = rows?.[0]?.result ? JSON.parse(rows[0].result) : [];
    return jsonResponse(request, { ok: true, rules: Array.isArray(rules) ? rules : [] });
  }

  let body = {};
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'INPUT' } }, 400); }
  const action = String(body.action || '');

  const rows = await redisRequest('pipeline', [['GET', key]]);
  const current = rows?.[0]?.result ? JSON.parse(rows[0].result) : [];
  const rules = Array.isArray(current) ? current : [];

  if (action === 'save') {
    const workflowId = String(body.workflowId || '');
    if (!/^[a-f0-9]{64}$/.test(workflowId)) return jsonResponse(request, { error: { message: 'INPUT' } }, 400);
    const walletAddress = String(body.walletAddress || '');
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) return jsonResponse(request, { error: { message: 'INPUT' } }, 400);
    const tp = body.tp === null || body.tp === '' ? null : Number(body.tp);
    const sl = body.sl === null || body.sl === '' ? null : Number(body.sl);
    for (const value of [tp, sl]) if (value !== null && (!Number.isFinite(value) || value <= 0)) return jsonResponse(request, { error: { message: 'INPUT' } }, 400);
    if (tp === null && sl === null) return jsonResponse(request, { error: { message: 'INPUT' } }, 400);
    const next = rules.filter(rule => rule.workflowId !== workflowId);
    next.push({ workflowId, walletAddress, tp, sl, symbol: String(body.symbol || '').slice(0, 20), side: body.side === 'SHORT' ? 'SHORT' : 'LONG', createdAt: Date.now() });
    await redisRequest('pipeline', [['SET', key, JSON.stringify(next.slice(-25)), 'EX', 63072000]]);
    return jsonResponse(request, { ok: true, rules: next.slice(-25) });
  }

  if (action === 'remove') {
    const workflowId = String(body.workflowId || '');
    const next = rules.filter(rule => rule.workflowId !== workflowId);
    await redisRequest('pipeline', [['SET', key, JSON.stringify(next), 'EX', 63072000]]);
    return jsonResponse(request, { ok: true, rules: next });
  }

  return jsonResponse(request, { error: { message: 'UNKNOWN_ACTION' } }, 404);
}
