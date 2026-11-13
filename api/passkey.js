import {corsHeaders, jsonResponse, redisRequest, hashIdentifier} from '../lib/server.js';
import {authenticateTrial, issueTrialSession} from '../lib/web-trial-session.js';
import {sessionCookie, ACCOUNT_COOKIE} from '../lib/browser-account-session.js';
import {b64uEncode, b64uDecode, sha256, cborDecode, parseAuthenticatorData, coseToJwk, verifyAssertion} from '../lib/webauthn.js';
export const config = { runtime: 'edge' };

const RP_ID = 'jamddmaj.com';
const ORIGINS = ['https://www.jamddmaj.com', 'https://jamddmaj.com'];
const TTL = 300;

const cookieToken = request => {
  const cookie = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(ACCOUNT_COOKIE + '='));
  const value = cookie ? cookie.slice(ACCOUNT_COOKIE.length + 1) : '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
};
const accountOf = async request => {
  const token = cookieToken(request);
  if (!token) return '';
  try { const account = await authenticateTrial(new Request(request.url, { headers: { Authorization: 'Bearer ' + token } })); return /^[a-f0-9]{64}$/.test(account) ? account : ''; } catch { return ''; }
};
const credKey = idHash => 'jamd:pk:cred:' + idHash;
const accountKey = account => 'jamd:pk:by-account:' + account;

async function readAccountCreds(account) {
  const rows = await redisRequest('pipeline', [['GET', accountKey(account)]]);
  const list = rows?.[0]?.result ? JSON.parse(rows[0].result) : [];
  return Array.isArray(list) ? list : [];
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  let body = {};
  if (request.method === 'POST') { try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'INPUT' } }, 400); } }

  if (action === 'status') {
    const account = await accountOf(request);
    if (!account) return jsonResponse(request, { linked: false });
    const creds = await readAccountCreds(account);
    return jsonResponse(request, { linked: creds.length > 0, count: creds.length });
  }

  if (action === 'register-options') {
    const account = await accountOf(request);
    if (!account) return jsonResponse(request, { error: { message: 'LOGIN_REQUIRED' } }, 401);
    const challenge = b64uEncode(crypto.getRandomValues(new Uint8Array(32)));
    const saved = await redisRequest('pipeline', [['SET', 'jamd:pk:ch:' + await hashIdentifier(challenge), JSON.stringify({ type: 'register', account, at: Date.now() }), 'EX', TTL]]);
    if (saved?.[0]?.error) return jsonResponse(request, { error: { message: 'STORE' } }, 503);
    const creds = await readAccountCreds(account);
    const exclude = [];
    for (const idHash of creds) {
      const rows = await redisRequest('pipeline', [['GET', credKey(idHash)]]);
      if (rows?.[0]?.result) { try { exclude.push({ type: 'public-key', id: b64uDecode(JSON.parse(rows[0].result).credentialId) }); } catch {} }
    }
    return jsonResponse(request, {
      challenge,
      rp: { id: RP_ID, name: 'JamdDmaj' },
      user: { id: b64uEncode(new TextEncoder().encode(account)), name: 'JamdDmaj', displayName: 'JamdDmaj account' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 120000,
      attestation: 'none',
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
      excludeCredentials: exclude
    });
  }

  if (action === 'register-verify') {
    const credential = body.credential;
    if (!credential?.rawId || !credential?.response) return jsonResponse(request, { error: { message: 'INPUT' } }, 400);
    const clientData = JSON.parse(new TextDecoder().decode(b64uDecode(credential.response.clientDataJSON)));
    if (clientData.type !== 'webauthn.create' || !ORIGINS.includes(clientData.origin)) return jsonResponse(request, { error: { message: 'ORIGIN' } }, 400);
    const challengeKey = 'jamd:pk:ch:' + await hashIdentifier(clientData.challenge);
    const stored = await redisRequest('pipeline', [['GETDEL', challengeKey]]);
    const record = stored?.[0]?.result ? JSON.parse(stored[0].result) : null;
    if (!record || record.type !== 'register' || Date.now() - Number(record.at || 0) > TTL * 1000) return jsonResponse(request, { error: { message: 'CHALLENGE' } }, 400);
    const account = record.account;
    const attestation = b64uDecode(credential.response.attestationObject);
    const [attestationMap] = cborDecode(attestation);
    const authData = attestationMap.authData;
    if (!(authData instanceof Uint8Array)) return jsonResponse(request, { error: { message: 'ATTESTATION' } }, 400);
    const parsed = parseAuthenticatorData(authData);
    const rpHash = await sha256(new TextEncoder().encode(RP_ID));
    if (b64uEncode(parsed.rpIdHash) !== b64uEncode(rpHash) || !(parsed.flags & 0x01) || !parsed.credentialId || !parsed.publicKey) return jsonResponse(request, { error: { message: 'AUTH_DATA' } }, 400);
    const jwk = await coseToJwk(parsed.publicKey);
    const credentialId = b64uEncode(parsed.credentialId);
    const idHash = await hashIdentifier(credentialId);
    await redisRequest('pipeline', [['SET', credKey(idHash), JSON.stringify({ account, credentialId, publicKey: jwk, counter: parsed.counter, createdAt: Date.now() }), 'EX', 63072000]]);
    const creds = await readAccountCreds(account);
    if (!creds.includes(idHash)) creds.push(idHash);
    await redisRequest('pipeline', [['SET', accountKey(account), JSON.stringify(creds.slice(-10)), 'EX', 63072000]]);
    return jsonResponse(request, { ok: true, credentialId });
  }

  if (action === 'login-options') {
    const challenge = b64uEncode(crypto.getRandomValues(new Uint8Array(32)));
    const saved = await redisRequest('pipeline', [['SET', 'jamd:pk:ch:' + await hashIdentifier(challenge), JSON.stringify({ type: 'login', at: Date.now() }), 'EX', TTL]]);
    if (saved?.[0]?.error) return jsonResponse(request, { error: { message: 'STORE' } }, 503);
    return jsonResponse(request, {
      challenge,
      rpId: RP_ID,
      timeout: 120000,
      userVerification: 'preferred',
      allowCredentials: []
    });
  }

  if (action === 'login-verify') {
    const credential = body.credential;
    if (!credential?.rawId || !credential?.response) return jsonResponse(request, { error: { message: 'INPUT' } }, 400);
    const clientData = JSON.parse(new TextDecoder().decode(b64uDecode(credential.response.clientDataJSON)));
    if (clientData.type !== 'webauthn.get' || !ORIGINS.includes(clientData.origin)) return jsonResponse(request, { error: { message: 'ORIGIN' } }, 400);
    const challengeKey = 'jamd:pk:ch:' + await hashIdentifier(clientData.challenge);
    const stored = await redisRequest('pipeline', [['GETDEL', challengeKey]]);
    const record = stored?.[0]?.result ? JSON.parse(stored[0].result) : null;
    if (!record || record.type !== 'login' || Date.now() - Number(record.at || 0) > TTL * 1000) return jsonResponse(request, { error: { message: 'CHALLENGE' } }, 400);
    const idHash = await hashIdentifier(credential.rawId);
    const rows = await redisRequest('pipeline', [['GET', credKey(idHash)]]);
    const storedCred = rows?.[0]?.result ? JSON.parse(rows[0].result) : null;
    if (!storedCred?.account) return jsonResponse(request, { error: { message: 'NOT_REGISTERED' } }, 401);
    const authData = b64uDecode(credential.response.authenticatorData);
    const parsed = parseAuthenticatorData(authData);
    const rpHash = await sha256(new TextEncoder().encode(RP_ID));
    if (b64uEncode(parsed.rpIdHash) !== b64uEncode(rpHash)) return jsonResponse(request, { error: { message: 'AUTH_DATA' } }, 400);
    if (!(parsed.flags & 0x01)) return jsonResponse(request, { error: { message: 'USER_PRESENCE' } }, 400);
    if (Number(storedCred.counter) > 0 && parsed.counter <= Number(storedCred.counter)) return jsonResponse(request, { error: { message: 'COUNTER' } }, 400);
    const ok = await verifyAssertion({
      publicKey: storedCred.publicKey,
      authenticatorData: authData,
      clientDataJSON: b64uDecode(credential.response.clientDataJSON),
      signature: b64uDecode(credential.response.signature)
    }).catch(() => false);
    if (!ok) return jsonResponse(request, { error: { message: 'SIGNATURE' } }, 401);
    await redisRequest('pipeline', [['SET', credKey(idHash), JSON.stringify({ ...storedCred, counter: parsed.counter, usedAt: Date.now() }), 'EX', 63072000]]);
    try {
      const session = await issueTrialSession(storedCred.account);
      return jsonResponse(request, { ok: true, token: session.token }, 200, { 'Set-Cookie': sessionCookie(session.token, 604800) });
    } catch { return jsonResponse(request, { error: { message: 'SESSION' } }, 503); }
  }

  return jsonResponse(request, { error: { message: 'UNKNOWN_ACTION' } }, 404);
}
