import {corsHeaders, jsonResponse, redisRequest, hashIdentifier} from '../lib/server.js';
import {authenticateTrial, issueTrialSession} from '../lib/web-trial-session.js';
import {sessionCookie, ACCOUNT_COOKIE, sameOriginBrowser} from '../lib/browser-account-session.js';
export const config = { runtime: 'edge' };

const AUTHORIZE = 'https://twitter.com/i/oauth2/authorize';
const TOKEN = 'https://api.twitter.com/2/oauth2/token';
const ME = 'https://api.twitter.com/2/users/me?user.fields=username';
const SCOPE = 'users.read';
const SECONDS = 600;

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const redirect = (target, headers = {}) => new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store', ...headers } });
const home = (code) => 'https://www.jamddmaj.com/index.html?x=' + encodeURIComponent(code);

function tokenFrom(request) {
  const header = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (/^[a-f0-9]{64}$/.test(header)) return header;
  const cookie = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(ACCOUNT_COOKIE + '='));
  const value = cookie ? cookie.slice(ACCOUNT_COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const clientId = String(process.env.X_CLIENT_ID || '');
  const clientSecret = String(process.env.X_CLIENT_SECRET || '');
  const redirectUri = url.origin + '/api/x-callback';
  const action = url.searchParams.get('action') || 'config';

  if (action === 'config') {
    return jsonResponse(request, { enabled: Boolean(clientId && clientSecret), provider: 'x', purpose: 'backup' });
  }

  if (!clientId || !clientSecret) return redirect(home('not-configured'));
  if (!sameOriginBrowser(request) && action === 'start') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return jsonResponse(request, { error: { message: 'ORIGIN' } }, 403);
  }

  if (action === 'start') {
    if (request.method !== 'GET') return jsonResponse(request, { error: { message: 'METHOD' } }, 405);
    const mode = url.searchParams.get('mode') === 'link' ? 'link' : 'login';
    let account = '';
    if (mode === 'link') {
      const token = tokenFrom(request);
      if (!token) return redirect(home('login-required'));
      try { account = await authenticateTrial(new Request(request.url, { headers: { Authorization: 'Bearer ' + token } })); } catch { return redirect(home('login-required')); }
      if (!/^[a-f0-9]{64}$/.test(account)) return redirect(home('login-required'));
    }
    const state = hex(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const saved = await redisRequest('pipeline', [['SET', 'jamd:x:state:' + await hashIdentifier(state), JSON.stringify({ verifier, mode, account }), 'EX', SECONDS]]);
    if (saved?.[0]?.error) return redirect(home('store-unavailable'));
    const authorize = new URL(AUTHORIZE);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', clientId);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('scope', SCOPE);
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
    return redirect(authorize.toString());
  }

  if (action === 'callback') {
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    const denied = url.searchParams.get('error');
    if (denied) return redirect(home('denied'));
    if (!/^[a-f0-9]{64}$/.test(state) || !code) return redirect(home('invalid-callback'));
    const key = 'jamd:x:state:' + await hashIdentifier(state);
    const stored = await redisRequest('pipeline', [['GETDEL', key]]);
    const record = stored?.[0]?.result ? JSON.parse(stored[0].result) : null;
    if (!record?.verifier) return redirect(home('state-expired'));
    let token;
    try {
      const basic = btoa(clientId + ':' + clientSecret);
      const body = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: record.verifier });
      const exchanged = await fetch(TOKEN, { method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!exchanged.ok) return redirect(home('token-denied'));
      token = (await exchanged.json())?.access_token;
      if (typeof token !== 'string' || !token) return redirect(home('token-denied'));
    } catch { return redirect(home('network')); }
    let profile;
    try {
      const me = await fetch(ME, { headers: { Authorization: 'Bearer ' + token } });
      if (!me.ok) return redirect(home('profile-denied'));
      profile = (await me.json())?.data;
      if (!profile?.id) return redirect(home('profile-denied'));
    } catch { return redirect(home('network')); }
    const bindingKey = 'jamd:account:x:' + await hashIdentifier('x:' + profile.id);
    if (record.mode === 'link') {
      const account = String(record.account || '');
      if (!/^[a-f0-9]{64}$/.test(account)) return redirect(home('login-required'));
      const saved = await redisRequest('pipeline', [['SET', bindingKey, JSON.stringify({ account, handle: String(profile.username || '').slice(0, 15), linkedAt: Date.now() }), 'EX', 63072000]]);
      if (saved?.[0]?.error) return redirect(home('store-unavailable'));
      return redirect(home('linked'));
    }
    const found = await redisRequest('pipeline', [['GET', bindingKey]]);
    const binding = found?.[0]?.result ? JSON.parse(found[0].result) : null;
    if (!/^[a-f0-9]{64}$/.test(binding?.account || '')) return redirect(home('not-linked'));
    try {
      const session = await issueTrialSession(binding.account);
      return redirect(home('signed-in'), { 'Set-Cookie': sessionCookie(session.token, 604800) });
    } catch { return redirect(home('store-unavailable')); }
  }

  return jsonResponse(request, { error: { message: 'UNKNOWN_ACTION' } }, 404);
}
