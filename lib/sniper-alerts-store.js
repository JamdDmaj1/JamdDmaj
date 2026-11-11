// Watchlists y snapshots en Redis para la vigilancia en la nube.
const TTL = 60 * 60 * 24 * 30;
const key = value => String(value).trim().slice(0, 120);

async function cmd(...args) {
  const base = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!base || !token) return null;
  try {
    const response = await fetch(base, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(6000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return null;
    return data?.result ?? null;
  } catch { return null; }
}

export async function saveWatchlist(deviceId, entries) {
  const saved = await cmd('SET', 'sniper:watch:' + key(deviceId), JSON.stringify(Array.isArray(entries) ? entries.slice(0, 40) : []), 'EX', TTL);
  if (saved === null) throw Object.assign(Error('STORE_UNAVAILABLE'), { status: 503 });
  await cmd('SADD', 'sniper:devices', key(deviceId));
  return true;
}

export async function readWatchlist(deviceId) {
  const raw = await cmd('GET', 'sniper:watch:' + key(deviceId));
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export async function listDevices() {
  const raw = await cmd('SMEMBERS', 'sniper:devices');
  return Array.isArray(raw) ? raw.map(key) : [];
}

export async function readSnapshot(mint) {
  const raw = await cmd('GET', 'sniper:snap:' + key(mint));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function writeSnapshot(mint, value) {
  await cmd('SET', 'sniper:snap:' + key(mint), JSON.stringify(value), 'EX', 604800);
}

export async function recentlyNotified(mint, kind) {
  return Boolean(await cmd('GET', 'sniper:alert:' + key(mint) + ':' + kind));
}

export async function markNotified(mint, kind, ttlSeconds = 900) {
  await cmd('SET', 'sniper:alert:' + key(mint) + ':' + kind, '1', 'EX', ttlSeconds);
}
