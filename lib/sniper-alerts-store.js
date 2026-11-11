import {redisRequest} from './server.js';

// Watchlists live in Redis: one list per device and one snapshot per mint.
const LIST_PREFIX = 'sniper:watch:';
const SNAP_PREFIX = 'sniper:snap:';
const TTL = 60 * 60 * 24 * 30;

const key = value => String(value).trim().slice(0, 120);

const unwrap = value => (value && typeof value === 'object' && 'result' in value ? value.result : value);

async function run(...command) {
  const result = await redisRequest('', [command]);
  if (!Array.isArray(result) || !result.length) return null;
  return unwrap(result[0]);
}

export async function saveWatchlist(deviceId, entries) {
  const id = key(deviceId);
  const list = JSON.stringify(Array.isArray(entries) ? entries.slice(0, 40) : []);
  const saved = await run('SET', LIST_PREFIX + id, list, 'EX', TTL);
  if (saved === null) throw Object.assign(Error('STORE_UNAVAILABLE'), {status: 503});
  await run('SADD', 'sniper:devices', id);
  return true;
}

export async function readWatchlist(deviceId) {
  const raw = await run('GET', LIST_PREFIX + key(deviceId));
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export async function listDevices() {
  const raw = await run('SMEMBERS', 'sniper:devices');
  return Array.isArray(raw) ? raw.map(key) : [];
}

export async function readSnapshot(mint) {
  const raw = await run('GET', SNAP_PREFIX + key(mint));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function writeSnapshot(mint, value) {
  await run('SET', SNAP_PREFIX + key(mint), JSON.stringify(value), 'EX', 604800);
}

export async function recentlyNotified(mint, kind) {
  const raw = await run('GET', 'sniper:alert:' + key(mint) + ':' + kind);
  return Boolean(raw);
}

export async function markNotified(mint, kind, ttlSeconds = 900) {
  await run('SET', 'sniper:alert:' + key(mint) + ':' + kind, '1', 'EX', ttlSeconds);
}
