import {readFileSync} from 'node:fs';
import {isAbsolute, resolve} from 'node:path';

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw Error(`${name}_REQUIRED`);
  return value.trim();
}

function positiveInt(value, fallback, name) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number <= 0) throw Error(`${name}_INVALID`);
  return number;
}

export function loadConfig(env = process.env) {
  const dataDir = resolve(required(env.JAMDDMAJ_LIVE_DATA_DIR || '/var/lib/jamddmaj-live', 'LIVE_DATA_DIR'));
  const keyFile = resolve(required(env.JAMDDMAJ_LIVE_MASTER_KEY_FILE || '/etc/jamddmaj-live/master.key', 'LIVE_MASTER_KEY_FILE'));
  if (!isAbsolute(dataDir) || !isAbsolute(keyFile)) throw Error('LIVE_PATH_INVALID');
  const origins = String(env.JAMDDMAJ_LIVE_ALLOWED_ORIGINS || 'https://www.jamddmaj.com,https://jamddmaj.com,https://localhost,capacitor://localhost')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length || origins.some(value => !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value) && value !== 'capacitor://localhost')) throw Error('LIVE_ORIGINS_INVALID');
  const allowlist = String(env.JAMDDMAJ_LIVE_BETA_ALLOWLIST || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (allowlist.some(value => !/^[a-f0-9]{64}$/.test(value))) throw Error('LIVE_BETA_ALLOWLIST_INVALID');
  return Object.freeze({
    port: positiveInt(env.PORT, 8790, 'LIVE_PORT'),
    dataDir,
    keyFile,
    identityUrl: required(env.JAMDDMAJ_LIVE_IDENTITY_URL || 'https://www.jamddmaj.com/api/perps-identity', 'LIVE_IDENTITY_URL'),
    signalUrl: required(env.JAMDDMAJ_LIVE_SIGNAL_URL || 'https://www.jamddmaj.com/api/pro-cron', 'LIVE_SIGNAL_URL'),
    cronSecret: required(env.JAMDDMAJ_CRON_SECRET, 'LIVE_CRON_SECRET'),
    allowedOrigins: Object.freeze(origins),
    betaAllowlist: Object.freeze(allowlist),
    publicBaseUrl: String(env.JAMDDMAJ_LIVE_PUBLIC_URL || 'https://www.jamddmaj.com').replace(/\/+$/, ''),
    betaMode: String(env.JAMDDMAJ_LIVE_BETA || 'true').toLowerCase() !== 'false',
    engineIntervalMs: positiveInt(env.JAMDDMAJ_LIVE_ENGINE_INTERVAL_MS, 30000, 'LIVE_ENGINE_INTERVAL'),
    engineEnabled: String(env.JAMDDMAJ_LIVE_ENGINE_ENABLED || 'false').toLowerCase() === 'true',
    allowUnverifiedExchanges: String(env.JAMDDMAJ_LIVE_ALLOW_UNVERIFIED_EXCHANGES || 'false').toLowerCase() === 'true',
    requestTimeoutMs: positiveInt(env.JAMDDMAJ_LIVE_REQUEST_TIMEOUT_MS, 15000, 'LIVE_REQUEST_TIMEOUT'),
    maxConnectionsPerUser: positiveInt(env.JAMDDMAJ_LIVE_MAX_CONNECTIONS, 8, 'LIVE_MAX_CONNECTIONS')
  });
}

export function loadMasterKey(path) {
  const value = readFileSync(path, 'utf8').trim();
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw Error('LIVE_MASTER_KEY_INVALID');
  return key;
}
