import {corsHeaders, jsonResponse, redisRequest, hashIdentifier} from '../lib/server.js';
import {authenticateTrial, issueTrialSession} from '../lib/web-trial-session.js';
import {sessionCookie, ACCOUNT_COOKIE} from '../lib/browser-account-session.js';
export const config = { runtime: 'edge' };

const note = async (payload) => { try { await redisRequest('pipeline', [['SET', 'jamd:tg:last', JSON.stringify({ ...payload, at: Date.now() }), 'EX', 3600]]); } catch {} };
const BOT = String(process.env.TELEGRAM_BOT_USERNAME || 'JamdDmajbot').replace(/^@/, '');
const home = code => 'https://www.jamddmaj.com/index.html?tg=' + encodeURIComponent(code);
const redirect = (target, headers = {}) => new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store', ...headers } });
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

function cookieToken(request) {
  const cookie = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(ACCOUNT_COOKIE + '='));
  const value = cookie ? cookie.slice(ACCOUNT_COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const action = url.searchParams.get('action') || 'callback';

  if (action === 'config') return jsonResponse(request, { enabled: Boolean(botToken), bot: BOT, provider: 'telegram', purpose: 'backup' });
  if (action === 'status') {
    const token = cookieToken(request);
    if (!token) return jsonResponse(request, { linked: false });
    let account = '';
    try { account = await authenticateTrial(new Request(request.url, { headers: { Authorization: 'Bearer ' + token } })); } catch {}
    if (!/^[a-f0-9]{64}$/.test(account)) return jsonResponse(request, { linked: false });
    const rows = await redisRequest('pipeline', [['GET', 'jamd:account:tg-by-account:' + account]]);
    const value = rows?.[0]?.result ? JSON.parse(rows[0].result) : null;
    return jsonResponse(request, { linked: Boolean(value?.handle), handle: value?.handle || null });
  }
  if (!botToken) return redirect(home('not-configured'));

  const fields = ['id','first_name','last_name','username','photo_url','auth_date'];
  const data = {};
  for (const field of fields) if (url.searchParams.has(field)) data[field] = url.searchParams.get(field);
  const hash = url.searchParams.get('hash') || '';
  if (!/^[0-9]{1,20}$/.test(data.id || '') || !/^[a-f0-9]{64}$/i.test(hash)) { await note({ step: 'invalid-payload' }); return redirect(home('denied')); }
  const authDate = Number(data.auth_date);
  if (!Number.isSafeInteger(authDate) || Math.abs(Date.now() / 1000 - authDate) > 600) return redirect(home('denied'));
  const checkString = Object.keys(data).sort().map(key => key + '=' + data[key]).join('\n');
  const secret = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken)));
  const expected = hex(await hmac(secret, checkString));
  if (expected.toLowerCase() !== hash.toLowerCase()) { await note({ step: 'bad-hash' }); return redirect(home('denied')); }

  const bindingKey = 'jamd:account:tg:' + data.id;
  const token = cookieToken(request);
  let account = '';
  if (token) { try { account = await authenticateTrial(new Request(request.url, { headers: { Authorization: 'Bearer ' + token } })); } catch {} }
  const handle = String(data.username || data.first_name || 'telegram').slice(0, 32);
  if (/^[a-f0-9]{64}$/.test(account)) {
    const saved = await redisRequest('pipeline', [['SET', bindingKey, JSON.stringify({ account, handle, linkedAt: Date.now() }), 'EX', 63072000]]);
    if (saved?.[0]?.error) return redirect(home('denied'));
    await redisRequest('pipeline', [['SET', 'jamd:account:tg-by-account:' + account, JSON.stringify({ handle, linkedAt: Date.now() }), 'EX', 63072000]]);
    await note({ step: 'linked', handle });
    return redirect(home('linked'));
  }
  const found = await redisRequest('pipeline', [['GET', bindingKey]]);
  const binding = found?.[0]?.result ? JSON.parse(found[0].result) : null;
  if (!/^[a-f0-9]{64}$/.test(binding?.account || '')) { await note({ step: 'not-linked', handle }); return redirect(home('not-linked')); }
  try {
    const session = await issueTrialSession(binding.account);
    return redirect(home('signed-in'), { 'Set-Cookie': sessionCookie(session.token, 604800) });
  } catch { return redirect(home('denied')); }
}
