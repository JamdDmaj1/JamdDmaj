import {DatabaseSync} from 'node:sqlite';
import {randomBytes, randomUUID} from 'node:crypto';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  account_hash TEXT PRIMARY KEY,
  consent_version TEXT,
  consented_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  account_hash TEXT NOT NULL REFERENCES users(account_hash) ON DELETE CASCADE,
  exchange TEXT NOT NULL,
  label TEXT NOT NULL,
  key_enc TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  passphrase_enc TEXT,
  status TEXT NOT NULL,
  last_error TEXT,
  balance_json TEXT,
  positions_json TEXT,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(account_hash, exchange, label)
) STRICT;
CREATE INDEX IF NOT EXISTS connections_account ON connections(account_hash);

CREATE TABLE IF NOT EXISTS configs (
  connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
  margin_usd REAL NOT NULL,
  leverage INTEGER NOT NULL,
  max_open INTEGER NOT NULL,
  protection_roe REAL NOT NULL,
  daily_loss_usd REAL NOT NULL,
  max_trades_day INTEGER NOT NULL,
  live_enabled INTEGER NOT NULL,
  live_enabled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  account_hash TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  amount REAL NOT NULL,
  entry REAL,
  mark REAL,
  leverage INTEGER,
  margin_usd REAL,
  unrealized_pnl REAL,
  protection_roe REAL,
  tp REAL,
  sl REAL,
  status TEXT NOT NULL,
  source_signal TEXT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  raw_json TEXT,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS positions_account ON positions(account_hash, status);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  account_hash TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  client_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL,
  price REAL,
  status TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(connection_id, signal_id)
) STRICT;

CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  account_hash TEXT NOT NULL,
  position_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  account_hash TEXT NOT NULL,
  connection_id TEXT,
  type TEXT NOT NULL,
  detail TEXT,
  at INTEGER NOT NULL
) STRICT;
`;

function nowMs(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) throw Error('LIVE_TIME_INVALID');
  return value;
}

function json(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function openStore(path, {now = Date.now} = {}) {
  const db = new DatabaseSync(path, {timeout: 5000});
  db.exec(SCHEMA);
  const tx = fn => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  };
  const user = (accountHash, consentVersion) => {
    const at = nowMs(now);
    db.prepare(`INSERT INTO users(account_hash,consent_version,consented_at,created_at,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(account_hash) DO UPDATE SET
        consent_version=COALESCE(excluded.consent_version,users.consent_version),
        consented_at=CASE WHEN excluded.consented_at IS NULL THEN users.consented_at ELSE excluded.consented_at END,
        updated_at=excluded.updated_at`)
      .run(accountHash, consentVersion || null, consentVersion ? at : null, at, at);
    return db.prepare('SELECT * FROM users WHERE account_hash=?').get(accountHash);
  };
  return Object.freeze({
    user,
    createConnection(input) {
      const id = randomUUID();
      const at = nowMs(now);
      return tx(() => {
        user(input.accountHash, input.consentVersion);
        db.prepare(`INSERT INTO connections(
          id,account_hash,exchange,label,key_enc,secret_enc,passphrase_enc,status,last_error,
          balance_json,positions_json,last_sync_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, input.accountHash, input.exchange, input.label, input.keyEnc, input.secretEnc,
          input.passphraseEnc || null, input.status || 'connected', input.lastError || null,
          json(input.balance), json(input.positions), input.lastSyncAt || at, at, at
        );
        db.prepare(`INSERT INTO configs(
          connection_id,margin_usd,leverage,max_open,protection_roe,daily_loss_usd,max_trades_day,
          live_enabled,live_enabled_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, input.marginUsd, input.leverage, input.maxOpen, input.protectionRoe,
          input.dailyLossUsd, input.maxTradesDay, 0, null, at, at
        );
        this.audit(input.accountHash, id, 'CONNECTION_CREATED', input.exchange);
        return this.getConnection(input.accountHash, id);
      });
    },
    listConnections(accountHash) {
      return db.prepare(`SELECT c.*, g.margin_usd,g.leverage,g.max_open,g.protection_roe,
        g.daily_loss_usd,g.max_trades_day,g.live_enabled,g.live_enabled_at
        FROM connections c JOIN configs g ON g.connection_id=c.id
        WHERE c.account_hash=? ORDER BY c.created_at ASC`).all(accountHash);
    },
    getConnection(accountHash, id) {
      return db.prepare(`SELECT c.*, g.margin_usd,g.leverage,g.max_open,g.protection_roe,
        g.daily_loss_usd,g.max_trades_day,g.live_enabled,g.live_enabled_at
        FROM connections c JOIN configs g ON g.connection_id=c.id
        WHERE c.account_hash=? AND c.id=?`).get(accountHash, id);
    },
    updateConnectionSync(accountHash, id, {status, lastError = null, balance, positions}) {
      const at = nowMs(now);
      const result = db.prepare(`UPDATE connections SET status=?,last_error=?,balance_json=?,positions_json=?,
        last_sync_at=?,updated_at=? WHERE account_hash=? AND id=?`)
        .run(status, lastError, json(balance), json(positions), at, at, accountHash, id);
      if (!result.changes) throw Error('LIVE_CONNECTION_NOT_FOUND');
      return this.getConnection(accountHash, id);
    },
    updateConfig(accountHash, id, config) {
      const at = nowMs(now);
      return tx(() => {
        const row = this.getConnection(accountHash, id);
        if (!row) throw Error('LIVE_CONNECTION_NOT_FOUND');
        db.prepare(`UPDATE configs SET margin_usd=?,leverage=?,max_open=?,protection_roe=?,
          daily_loss_usd=?,max_trades_day=?,updated_at=? WHERE connection_id=?`).run(
          config.marginUsd, config.leverage, config.maxOpen, config.protectionRoe,
          config.dailyLossUsd, config.maxTradesDay, at, id
        );
        this.audit(accountHash, id, 'CONFIG_UPDATED', null);
        return this.getConnection(accountHash, id);
      });
    },
    setLive(accountHash, id, enabled) {
      const at = nowMs(now);
      return tx(() => {
        const row = this.getConnection(accountHash, id);
        if (!row) throw Error('LIVE_CONNECTION_NOT_FOUND');
        db.prepare('UPDATE configs SET live_enabled=?,live_enabled_at=?,updated_at=? WHERE connection_id=?')
          .run(enabled ? 1 : 0, enabled ? at : null, at, id);
        this.audit(accountHash, id, enabled ? 'LIVE_ENABLED' : 'LIVE_DISABLED', null);
        return this.getConnection(accountHash, id);
      });
    },
    deleteConnection(accountHash, id) {
      const result = db.prepare('DELETE FROM connections WHERE account_hash=? AND id=?').run(accountHash, id);
      if (!result.changes) throw Error('LIVE_CONNECTION_NOT_FOUND');
      return true;
    },
    activeConnections() {
      return db.prepare(`SELECT c.*, g.margin_usd,g.leverage,g.max_open,g.protection_roe,
        g.daily_loss_usd,g.max_trades_day,g.live_enabled,g.live_enabled_at
        FROM connections c JOIN configs g ON g.connection_id=c.id
        WHERE g.live_enabled=1 AND c.status='connected' ORDER BY c.created_at ASC`).all();
    },
    countOrdersSince(connectionId, since) {
      return db.prepare('SELECT COUNT(*) AS count FROM orders WHERE connection_id=? AND created_at>=?')
        .get(connectionId, since).count;
    },
    listPositions(accountHash, connectionId = null) {
      if (connectionId) return db.prepare('SELECT * FROM positions WHERE account_hash=? AND connection_id=? ORDER BY opened_at DESC').all(accountHash, connectionId);
      return db.prepare('SELECT * FROM positions WHERE account_hash=? ORDER BY opened_at DESC').all(accountHash);
    },
    getPosition(accountHash, id) {
      return db.prepare('SELECT * FROM positions WHERE account_hash=? AND id=?').get(accountHash, id);
    },
    findOpenPosition(accountHash, connectionId, symbol, side) {
      return db.prepare(`SELECT * FROM positions WHERE account_hash=? AND connection_id=? AND symbol=?
        AND side=? AND status IN ('OPEN','CLOSING') ORDER BY opened_at DESC LIMIT 1`)
        .get(accountHash, connectionId, symbol, side);
    },
    updateOrder(connectionId, id, status, error = null) {
      const result = db.prepare('UPDATE orders SET status=?,error=?,updated_at=? WHERE connection_id=? AND id=?')
        .run(status, error, nowMs(now), connectionId, id);
      if (!result.changes) throw Error('LIVE_ORDER_NOT_FOUND');
      return db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    },
    upsertPosition(accountHash, input) {
      const at = nowMs(now);
      const id = input.id || randomUUID();
      db.prepare(`INSERT INTO positions(
        id,connection_id,account_hash,exchange,symbol,side,amount,entry,mark,leverage,margin_usd,
        unrealized_pnl,protection_roe,tp,sl,status,source_signal,opened_at,closed_at,raw_json,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET mark=excluded.mark,unrealized_pnl=excluded.unrealized_pnl,
          status=excluded.status,closed_at=excluded.closed_at,raw_json=excluded.raw_json,updated_at=excluded.updated_at`)
        .run(id, input.connectionId, accountHash, input.exchange, input.symbol, input.side,
          input.amount, input.entry ?? null, input.mark ?? null, input.leverage ?? null,
          input.marginUsd ?? null, input.unrealizedPnl ?? null, input.protectionRoe ?? null,
          input.tp ?? null, input.sl ?? null, input.status || 'OPEN', input.sourceSignal ?? null,
          input.openedAt || at, input.closedAt ?? null, json(input.raw), at);
      return this.getPosition(accountHash, id);
    },
    orderForSignal(connectionId, signalId) {
      return db.prepare('SELECT * FROM orders WHERE connection_id=? AND signal_id=?').get(connectionId, signalId);
    },
    recordOrder(accountHash, input) {
      const at = nowMs(now);
      const id = input.id || randomUUID();
      db.prepare(`INSERT INTO orders(id,connection_id,account_hash,signal_id,client_order_id,symbol,side,type,
        amount,price,status,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, input.connectionId, accountHash, input.signalId, input.clientOrderId, input.symbol,
          input.side, input.type || 'market', input.amount ?? null, input.price ?? null,
          input.status || 'PENDING', input.error ?? null, at, at);
      return db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    },
    audit(accountHash, connectionId, type, detail) {
      db.prepare('INSERT INTO events(id,account_hash,connection_id,type,detail,at) VALUES(?,?,?,?,?,?)')
        .run(randomUUID(), accountHash, connectionId || null, type, detail ? String(detail).slice(0,500) : null, nowMs(now));
    },
    createShare(accountHash, positionId, payload) {
      const token = randomBytes(24).toString('base64url');
      const at = nowMs(now);
      db.prepare('INSERT INTO shares(token,account_hash,position_id,payload_json,created_at,revoked) VALUES(?,?,?,?,?,0)')
        .run(token, accountHash, positionId, json(payload), at);
      return {token, createdAt: at};
    },
    getShare(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
      return db.prepare('SELECT * FROM shares WHERE token=? AND revoked=0').get(token) || null;
    },
    revokeShare(accountHash, token) {
      const result = db.prepare('UPDATE shares SET revoked=1 WHERE token=? AND account_hash=?').run(token, accountHash);
      return result.changes > 0;
    },
    close() { db.close(); }
  });
}
