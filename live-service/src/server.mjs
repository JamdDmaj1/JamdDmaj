import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {createIdentityVerifier, bearerToken} from './auth.mjs';
import {loadConfig, loadMasterKey} from './config.mjs';
import {createVault, vaultContext} from './vault.mjs';
import {openStore} from './store.mjs';
import {startEngine} from './engine.mjs';
import {
  EXCHANGES, exchangeDefinition, publicExchanges, probeExchange, createAdapter,
  closeMarketPosition, safeError
} from './adapters/ccxt.mjs';

const MAX_BODY = 64 * 1024;
const CONSENT_VERSION = 'live-risk-v1';
const DEFAULT_CONFIG = Object.freeze({
  marginUsd: 25, leverage: 5, maxOpen: 1, protectionRoe: 4,
  dailyLossUsd: 50, maxTradesDay: 3
});

function jsonBody(value) {
  return JSON.stringify(value);
}

function parseNumber(value, min, max, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw Object.assign(Error(`LIVE_${name}_INVALID`), {status: 400});
  return number;
}

function parseInteger(value, min, max, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw Object.assign(Error(`LIVE_${name}_INVALID`), {status: 400});
  return number;
}

function cleanText(value, max = 80) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function publicConnection(row) {
  return {
    id: row.id,
    exchange: row.exchange,
    label: row.label,
    status: row.status,
    lastError: row.last_error || null,
    lastSyncAt: row.last_sync_at || null,
    balance: row.balance_json ? JSON.parse(row.balance_json) : null,
    positions: row.positions_json ? JSON.parse(row.positions_json) : [],
    permissions: row.permissions_json ? JSON.parse(row.permissions_json) : null,
    config: {
      marginUsd: row.margin_usd,
      leverage: row.leverage,
      maxOpen: row.max_open,
      protectionRoe: row.protection_roe,
      dailyLossUsd: row.daily_loss_usd,
      maxTradesDay: row.max_trades_day,
      liveEnabled: row.live_enabled === 1,
      liveEnabledAt: row.live_enabled_at || null
    }
  };
}

function credentialsFrom(row, vault, accountHash) {
  const context = vaultContext({accountHash, connectionId: row.id, exchange: row.exchange});
  return {
    apiKey: vault.open(row.key_enc, context),
    secret: vault.open(row.secret_enc, context),
    passphrase: row.passphrase_enc ? vault.open(row.passphrase_enc, context) : ''
  };
}

function persistExchangePositions(store, accountHash, row, positions) {
  for (const position of positions) {
    if (!position?.symbol || !(Number(position.amount) > 0)) continue;
    const existing = store.findOpenPosition(accountHash, row.id, position.symbol, position.side);
    store.upsertPosition(accountHash, {
      id: existing?.id,
      connectionId: row.id,
      exchange: row.exchange,
      symbol: position.symbol,
      side: position.side,
      amount: Number(position.amount),
      entry: Number(position.entry) || null,
      mark: Number(position.mark) || null,
      leverage: Number(position.leverage) || null,
      marginUsd: Number(position.margin) || null,
      unrealizedPnl: Number(position.unrealizedPnl) || 0,
      protectionRoe: existing?.protection_roe ?? row.protection_roe,
      tp: existing?.tp ?? null,
      sl: existing?.sl ?? null,
      status: 'OPEN',
      sourceSignal: existing?.source_signal ?? null,
      openedAt: existing?.opened_at || Date.now(),
      raw: position.raw
    });
  }
}

function createRateLimiter({windowMs = 60000, max = 60, now = Date.now} = {}) {
  const buckets = new Map();
  return function allow(key, cost = 1) {
    const at = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= at) {
      bucket = {used: 0, reset: at + windowMs};
      buckets.set(key, bucket);
    }
    bucket.used += cost;
    if (buckets.size > 20000) {
      for (const [candidate, value] of buckets) if (value.reset <= at) buckets.delete(candidate);
    }
    return bucket.used <= max;
  };
}

export async function startServer({env = process.env} = {}) {
  const config = loadConfig(env);
  mkdirSync(config.dataDir, {recursive: true, mode: 0o700});
  const vault = createVault(loadMasterKey(config.keyFile));
  const store = openStore(join(config.dataDir, 'live.sqlite'));
  const identity = createIdentityVerifier({
    identityUrl: config.identityUrl,
    requestTimeoutMs: config.requestTimeoutMs
  });
  const allowRead = createRateLimiter({max: 120});
  const allowWrite = createRateLimiter({max: 30});
  const allowConnect = createRateLimiter({windowMs: 60000, max: 8});
  const startedAt = Date.now();
  const betaAccess = accountHash => !config.betaMode || config.betaAllowlist.includes(accountHash);
  const engine = startEngine({config, store, vault, vaultContext});

  function corsOrigin(request) {
    const origin = String(request.headers.origin || '');
    return config.allowedOrigins.includes(origin) ? origin : '';
  }

  function send(request, response, status, body, headers = {}) {
    const origin = corsOrigin(request);
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(origin ? {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin'} : {}),
      ...headers
    });
    response.end(jsonBody(body));
  }

  function fail(request, response, error) {
    const status = Number(error?.status) || 500;
    const code = status >= 500 ? 'live-service-error' : String(error?.message || 'live-request-failed').toLowerCase();
    if (status >= 500) console.error('LIVE_API_ERROR', code, safeError(error));
    return send(request, response, status, {error: {code}});
  }

  async function authenticated(request) {
    const token = bearerToken(request);
    if (!token) throw Object.assign(Error('LIVE_LOGIN_REQUIRED'), {status: 401});
    const accountHash = await identity.verify(token);
    if (!allowRead(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
    return accountHash;
  }

  async function readBody(request) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      request.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(Object.assign(Error('LIVE_BODY_TOO_LARGE'), {status: 413}));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const value = text ? JSON.parse(text) : {};
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
          resolve(value);
        } catch {
          reject(Object.assign(Error('LIVE_BODY_INVALID'), {status: 400}));
        }
      });
      request.on('error', reject);
    });
  }

  function connectionOrThrow(accountHash, id) {
    const row = store.getConnection(accountHash, id);
    if (!row) throw Object.assign(Error('LIVE_CONNECTION_NOT_FOUND'), {status: 404});
    return row;
  }

  async function refreshConnection(accountHash, row) {
    const definition = exchangeDefinition(row.exchange);
    if (!definition) throw Object.assign(Error('LIVE_EXCHANGE_UNSUPPORTED'), {status: 400});
    const credentials = credentialsFrom(row, vault, accountHash);
    const checked = await probeExchange(definition, credentials, {timeout: config.requestTimeoutMs});
    persistExchangePositions(store, accountHash, row, checked.positions);
    store.updateConnectionSync(accountHash, row.id, {
      status: 'connected', lastError: null, balance: checked.balance, positions: checked.positions,
      permissions: checked.permissions
    });
    return {status: 'connected', balance: checked.balance, positions: checked.positions, permissions: checked.permissions};
  }

  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      const origin = corsOrigin(request);
      if (!origin) return send(request, response, 403, {error: {code: 'origin-not-allowed'}});
      return send(request, response, 204, {});
    }
    const url = new URL(request.url, 'http://localhost');
    try {
      if (url.pathname === '/live/health' && request.method === 'GET') {
        return send(request, response, 200, {
          ok: true, service: 'jamddmaj-live', version: '0.1.0',
          startedAt, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          beta: config.betaMode, engineEnabled: config.engineEnabled, engine: engine.status()
        });
      }
      if (url.pathname === '/live/exchanges' && request.method === 'GET') {
        return send(request, response, 200, {ok: true, exchanges: publicExchanges().map(item => ({...item, verified: config.verifiedExchanges.includes(item.id)}))});
      }
      if (url.pathname.startsWith('/live/share/') && request.method === 'GET') {
        const token = url.pathname.slice('/live/share/'.length);
        const share = store.getShare(token);
        if (!share) return send(request, response, 404, {error: {code: 'live-share-not-found'}});
        return send(request, response, 200, {ok: true, share: JSON.parse(share.payload_json)});
      }

      const accountHash = await authenticated(request);

      if (url.pathname === '/live/me' && request.method === 'GET') {
        return send(request, response, 200, {ok: true, accountHash, beta: config.betaMode, betaAccess: betaAccess(accountHash), engineEnabled: config.engineEnabled, consentVersion: CONSENT_VERSION});
      }
      if (url.pathname === '/live/status' && request.method === 'GET') {
        const connections = store.listConnections(accountHash).map(publicConnection);
        return send(request, response, 200, {ok: true, connections, consentVersion: CONSENT_VERSION});
      }
      if (url.pathname === '/live/audit' && request.method === 'GET') {
        return send(request, response, 200, {ok: true, events: store.listAudit(accountHash, 100)});
      }
      if (url.pathname === '/live/positions' && request.method === 'GET') {
        const rows = store.listPositions(accountHash).filter(row => row.status === 'OPEN' || row.status === 'CLOSING');
        return send(request, response, 200, {ok: true, positions: rows.map(row => ({
          id: row.id, connectionId: row.connection_id, exchange: row.exchange, symbol: row.symbol,
          side: row.side, amount: row.amount, entry: row.entry, mark: row.mark,
          leverage: row.leverage, marginUsd: row.margin_usd, unrealizedPnl: row.unrealized_pnl,
          protectionRoe: row.protection_roe, tp: row.tp, sl: row.sl, status: row.status,
          sourceSignal: row.source_signal, openedAt: row.opened_at, closedAt: row.closed_at
        }))});
      }
      if (url.pathname === '/live/connect' && request.method === 'POST') {
        if (!allowConnect(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
        const body = await readBody(request);
        const definition = exchangeDefinition(body.exchange);
        if (!definition) throw Object.assign(Error('LIVE_EXCHANGE_UNSUPPORTED'), {status: 400});
        const apiKey = cleanText(body.apiKey, 200);
        const secret = cleanText(body.secret, 400);
        const passphrase = cleanText(body.passphrase, 200);
        const label = cleanText(body.label || definition.label, 40) || definition.label;
        if (!apiKey || apiKey.length < 8 || !secret || secret.length < 8) throw Object.assign(Error('LIVE_CREDENTIALS_INVALID'), {status: 400});
        if (definition.passphrase && !passphrase) throw Object.assign(Error('LIVE_PASSPHRASE_REQUIRED'), {status: 400});
        if (body.consent !== true) throw Object.assign(Error('LIVE_CONSENT_REQUIRED'), {status: 400});
        const existing = store.listConnections(accountHash);
        if (existing.length >= config.maxConnectionsPerUser) throw Object.assign(Error('LIVE_CONNECTION_LIMIT'), {status: 409});
        if (existing.some(row => row.exchange === definition.id && row.label === label)) {
          throw Object.assign(Error('LIVE_CONNECTION_EXISTS'), {status: 409});
        }
        const checked = await probeExchange(definition, {apiKey, secret, passphrase}, {timeout: config.requestTimeoutMs});
        if (checked.permissions?.withdrawals === true) throw Object.assign(Error('LIVE_WITHDRAWAL_PERMISSION_ENABLED'), {status: 409});
        const id = cryptoRandomId();
        const context = vaultContext({accountHash, connectionId: id, exchange: definition.id});
        const created = store.createConnection({
          accountHash, exchange: definition.id, label,
          keyEnc: vault.seal(apiKey, context),
          secretEnc: vault.seal(secret, context),
          passphraseEnc: passphrase ? vault.seal(passphrase, context) : null,
          status: 'connected', balance: checked.balance, positions: checked.positions,
          permissions: checked.permissions, consentVersion: CONSENT_VERSION,
          ...DEFAULT_CONFIG
        });
        persistExchangePositions(store, accountHash, created, checked.positions);
        return send(request, response, 201, {ok: true, connection: publicConnection(created)});
      }
      const connectionMatch = url.pathname.match(/^\/live\/connections\/([a-f0-9-]{36})(?:\/(refresh|config|live|delete))?$/);
      if (connectionMatch) {
        const row = connectionOrThrow(accountHash, connectionMatch[1]);
        const action = connectionMatch[2] || '';
        if (!action && request.method === 'GET') return send(request, response, 200, {ok: true, connection: publicConnection(row)});
        if (action === 'refresh' && request.method === 'POST') {
          if (!allowWrite(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
          const result = await refreshConnection(accountHash, row);
          const fresh = store.getConnection(accountHash, row.id);
          return send(request, response, 200, {ok: true, connection: publicConnection(fresh), checked: result});
        }
        if (action === 'config' && request.method === 'POST') {
          if (!allowWrite(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
          const body = await readBody(request);
          const marginUsd = parseNumber(body.marginUsd, 10, 1000, 'MARGIN');
          const leverage = parseInteger(body.leverage, 1, 20, 'LEVERAGE');
          const maxOpen = parseInteger(body.maxOpen, 1, 10, 'MAX_OPEN');
          const protectionRoe = parseNumber(body.protectionRoe, 0.5, 50, 'PROTECTION');
          const dailyLossUsd = body.dailyLossUsd === undefined ? row.daily_loss_usd : parseNumber(body.dailyLossUsd, 10, 1000, 'DAILY_LOSS');
          const maxTradesDay = body.maxTradesDay === undefined ? row.max_trades_day : parseInteger(body.maxTradesDay, 1, 20, 'MAX_TRADES');
          const updated = store.updateConfig(accountHash, row.id, {marginUsd, leverage, maxOpen, protectionRoe, dailyLossUsd, maxTradesDay});
          return send(request, response, 200, {ok: true, connection: publicConnection(updated)});
        }
        if (action === 'live' && request.method === 'POST') {
          if (!allowWrite(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
          const body = await readBody(request);
          if (body.enabled === true && !betaAccess(accountHash)) throw Object.assign(Error('LIVE_BETA_ACCESS_REQUIRED'), {status: 403});
          const definition = exchangeDefinition(row.exchange);
          const permissions = row.permissions_json ? JSON.parse(row.permissions_json) : null;
          if (body.enabled === true && permissions?.withdrawals === true) throw Object.assign(Error('LIVE_WITHDRAWAL_PERMISSION_ENABLED'), {status: 409});
          if (body.enabled === true && permissions?.trading === false) throw Object.assign(Error('LIVE_TRADING_PERMISSION_REQUIRED'), {status: 409});
          if (body.enabled === true && !config.verifiedExchanges.includes(row.exchange) && config.allowUnverifiedExchanges !== true) {
            throw Object.assign(Error('LIVE_EXCHANGE_NOT_VERIFIED'), {status: 409});
          }
          if (body.enabled === true && body.consent !== true) throw Object.assign(Error('LIVE_CONSENT_REQUIRED'), {status: 400});
          if (body.enabled === true && body.termsVersion !== CONSENT_VERSION) throw Object.assign(Error('LIVE_TERMS_REQUIRED'), {status: 400});
          if (body.enabled === true && body.eligibility !== true) throw Object.assign(Error('LIVE_ELIGIBILITY_REQUIRED'), {status: 400});
          if (body.enabled === true) {
            const result = await refreshConnection(accountHash, row);
            if (result.status !== 'connected') throw Object.assign(Error('LIVE_CONNECTION_NOT_READY'), {status: 409});
          }
          const updated = store.setLive(accountHash, row.id, body.enabled === true);
          return send(request, response, 200, {ok: true, connection: publicConnection(updated)});
        }
        if (action === 'delete' && request.method === 'POST') {
          if (!allowWrite(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
          store.audit(accountHash, row.id, 'CONNECTION_DELETED', row.exchange);
          store.deleteConnection(accountHash, row.id);
          return send(request, response, 200, {ok: true, deleted: true});
        }
      }
      const shareMatch = url.pathname.match(/^\/live\/positions\/([a-f0-9-]{36})\/share$/);
      if (shareMatch && request.method === 'POST') {
        if (!allowWrite(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
        const position = store.getPosition(accountHash, shareMatch[1]);
        if (!position) throw Object.assign(Error('LIVE_POSITION_NOT_FOUND'), {status: 404});
        const payload = {
          symbol: position.symbol,
          side: position.side,
          status: position.status,
          entry: position.entry,
          mark: position.mark,
          leverage: position.leverage,
          marginUsd: position.margin_usd,
          unrealizedPnl: position.unrealized_pnl,
          protectionRoe: position.protection_roe,
          openedAt: position.opened_at,
          exchange: position.exchange
        };
        const share = store.createShare(accountHash, position.id, payload);
        return send(request, response, 201, {ok: true, share: {token: share.token, url: `${config.publicBaseUrl}/live.html?share=${share.token}`}});
      }
      const closeMatch = url.pathname.match(/^\/live\/positions\/([a-f0-9-]{36})\/close$/);
      if (closeMatch && request.method === 'POST') {
        if (!allowWrite(accountHash)) throw Object.assign(Error('LIVE_RATE_LIMITED'), {status: 429});
        const position = store.getPosition(accountHash, closeMatch[1]);
        if (!position || position.status !== 'OPEN') throw Object.assign(Error('LIVE_POSITION_NOT_FOUND'), {status: 404});
        const row = connectionOrThrow(accountHash, position.connection_id);
        const definition = exchangeDefinition(row.exchange);
        const exchange = await createAdapter(definition, credentialsFrom(row, vault, accountHash), {timeout: config.requestTimeoutMs});
        try {
          await closeMarketPosition(exchange, {
            symbol: position.symbol, side: position.side, amount: position.amount,
            clientOrderId: `jlive-close-${position.id.slice(0, 12)}`
          });
        } finally {
          try { await exchange.close(); } catch {}
        }
        const direction = String(position.side).toLowerCase() === 'short' ? -1 : 1;
        const realizedPnl = Number(position.entry) > 0 ? (Number(position.mark) - Number(position.entry)) * Number(position.amount) * direction : null;
        const closed = store.upsertPosition(accountHash, {
          id: position.id, connectionId: position.connection_id, exchange: position.exchange,
          symbol: position.symbol, side: position.side, amount: position.amount,
          entry: position.entry, mark: position.mark, leverage: position.leverage,
          marginUsd: position.margin_usd, protectionRoe: position.protection_roe,
          realizedPnl, tp: position.tp, sl: position.sl, status: 'CLOSING', sourceSignal: position.source_signal,
          openedAt: position.opened_at, closedAt: Date.now(), raw: {closedBy: 'user'}
        });
        return send(request, response, 200, {ok: true, position: closed});
      }
      return send(request, response, 404, {error: {code: 'live-not-found'}});
    } catch (error) {
      return fail(request, response, error);
    }
  });

  await new Promise(resolve => server.listen(config.port, '127.0.0.1', resolve));
  return {server, config, store, engine, close: async () => {
    engine.stop();
    await new Promise(resolve => server.close(resolve));
    store.close();
  }};
}

function cryptoRandomId() {
  return requireNodeUuid();
}

function requireNodeUuid() {
  // Kept as a tiny wrapper so the id generation is explicit and testable.
  return globalThis.crypto.randomUUID();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().then(({config}) => {
    console.log(`jamddmaj-live listening on 127.0.0.1:${config.port} beta=${config.betaMode}`);
  }).catch(error => {
    console.error('LIVE_START_FAILED', safeError(error));
    process.exit(1);
  });
}
