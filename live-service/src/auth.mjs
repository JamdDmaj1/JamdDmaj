import {createHash} from 'node:crypto';

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createIdentityVerifier({identityUrl, requestTimeoutMs = 15000, cacheMs = 300000, fetchImpl = fetch, now = Date.now} = {}) {
  if (typeof identityUrl !== 'string' || !/^https:\/\//.test(identityUrl)) throw Error('LIVE_IDENTITY_URL_INVALID');
  if (typeof fetchImpl !== 'function' || typeof now !== 'function') throw Error('LIVE_IDENTITY_DEPENDENCY_INVALID');
  const cache = new Map();
  const inFlight = new Map();
  async function fetchAccount(token) {
    const response = await fetchImpl(identityUrl, {
      method: 'GET',
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
    if (response.status === 401 || response.status === 403) throw Object.assign(Error('LIVE_LOGIN_REQUIRED'), {status: 401});
    if (!response.ok) throw Object.assign(Error('LIVE_IDENTITY_UNAVAILABLE'), {status: 503});
    const text = await response.text();
    if (text.length > 2048) throw Object.assign(Error('LIVE_IDENTITY_INVALID'), {status: 503});
    let body;
    try { body = JSON.parse(text); } catch { throw Object.assign(Error('LIVE_IDENTITY_INVALID'), {status: 503}); }
    const accountHash = body?.accountHash;
    if (body?.ok !== true || typeof accountHash !== 'string' || !/^[a-f0-9]{64}$/.test(accountHash)) {
      throw Object.assign(Error('LIVE_IDENTITY_INVALID'), {status: 503});
    }
    return accountHash;
  }
  return Object.freeze({
    async verify(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Object.assign(Error('LIVE_LOGIN_REQUIRED'), {status: 401});
      const key = tokenHash(token);
      const hit = cache.get(key);
      if (hit && hit.expires > now()) return hit.accountHash;
      if (inFlight.has(key)) return inFlight.get(key);
      const task = (async () => {
        const accountHash = await fetchAccount(token);
        cache.set(key, {accountHash, expires: now() + cacheMs});
        if (cache.size > 5000) {
          for (const [candidate, entry] of cache) if (entry.expires <= now()) cache.delete(candidate);
        }
        return accountHash;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, task);
      return task;
    },
    clear(token) {
      if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) cache.delete(tokenHash(token));
    }
  });
}

export function bearerToken(request) {
  const value = String(request.headers.authorization || '');
  if (!value.startsWith('Bearer ')) return '';
  const token = value.slice(7).trim();
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}
