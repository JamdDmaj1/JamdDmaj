import {corsHeaders, jsonResponse, redisRequest, hashIdentifier} from '../lib/server.js';
import {authenticateTrial} from '../lib/web-trial-session.js';
import {ACCOUNT_COOKIE} from '../lib/browser-account-session.js';
import {getProServerState, runProCycle} from '../lib/pro-signals.js';
const OWNER_ACCOUNT = '0d2f7571988ff6c71beeedc9ed2210f9a403e5433105f5f162cbb17b86a68810';
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

if (action === 'proState') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const state = await getProServerState();
  return jsonResponse(request, { ok: true, stats: state.stats, config: state.config, open: state.open, history: state.history, paper: state.paper });
}

if (action === 'proRun') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const cycle = await runProCycle({ force: true });
  const state = await getProServerState();
  return jsonResponse(request, { ok: true, cycle, stats: state.stats, open: state.open.slice(0, 10) });
}

 if (action === 'telegramSetup') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const secret = String(process.env.JAMDDMAJ_CRON_SECRET || "").trim();
  if (!token || !secret) return jsonResponse(request, { error: { message: "TELEGRAM_NOT_CONFIGURED" } }, 503);
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.jamddmaj.com/api/telegram?webhook=1",
      secret_token: secret,
      allowed_updates: ["message", "channel_post", "edited_message"],
      drop_pending_updates: false
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  return jsonResponse(request, { ok: response.ok && data?.ok === true, telegram: data });
 }

 if (action === 'telegramMessages') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const rows = await redisRequest("pipeline", [["LRANGE", "jamd:telegram:group:results", 0, 49]]);
  const messages = (Array.isArray(rows?.[0]?.result) ? rows[0].result : []).flatMap((value) => {
    try { const item = JSON.parse(value); return item && item.text ? [item] : []; } catch { return []; }
  });
  return jsonResponse(request, { ok: true, messages });
 }

 if (action === 'telegramChat') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chat = String(body.chat || "").trim();
  if (!token || !chat) return jsonResponse(request, { error: { message: "TELEGRAM_NOT_CONFIGURED" } }, 503);
  const response = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chat)}`, { signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => ({}));
  return jsonResponse(request, { ok: response.ok && data?.ok === true, telegram: data?.result || null });
 }

 if (action === 'telegramSendTest') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(body.chatId || process.env.TELEGRAM_CHAT_ID || "").trim();
  const threadId = Number(body.threadId);
  if (!token || !chatId) return jsonResponse(request, { error: { message: "TELEGRAM_NOT_CONFIGURED" } }, 503);
  if (!Number.isSafeInteger(threadId) || threadId <= 0) return jsonResponse(request, { error: { message: 'INVALID_THREAD' } }, 400);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_thread_id: threadId, text: "Prueba Trade Results · ignorar", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  return jsonResponse(request, { ok: response.ok && data?.ok === true, telegram: data });
 }

 if (action === 'telegramResultsThread') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const threadId = Number(body.threadId);
  if (!Number.isSafeInteger(threadId) || threadId <= 0) return jsonResponse(request, { error: { message: 'INVALID_THREAD' } }, 400);
  await redisRequest("pipeline", [["SET", "jamd:telegram:resultsThread", String(threadId)]]);
  return jsonResponse(request, { ok: true, threadId });
 }
 if (action === 'telegramInfo') {
  if (account !== OWNER_ACCOUNT) return jsonResponse(request, { error: { message: 'FORBIDDEN' } }, 403);
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return jsonResponse(request, { error: { message: "TELEGRAM_NOT_CONFIGURED" } }, 503);
  const [me, hook] = await Promise.all([
    fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null),
    fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null)
  ]);
  return jsonResponse(request, { ok: true, bot: me?.result || null, webhook: hook?.result || null });
 }

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
    next.push({ workflowId, walletAddress, account, tp, sl, symbol: String(body.symbol || '').slice(0, 20), side: body.side === 'SHORT' ? 'SHORT' : 'LONG', createdAt: Date.now() });
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
