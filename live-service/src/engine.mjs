import {
  closeMarketPosition, clientOrderId, createAdapter, exchangeDefinition,
  marketPrice, normalizePositions, placeMarketOrder, resolveMarket, safeError
} from './adapters/ccxt.mjs';

const MIN_SCORE = 12;
const MAX_SIGNAL_AGE_MS = 10 * 60 * 1000;

function timestamp(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function utcDayStart(at) {
  return Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth(), new Date(at).getUTCDate());
}

function direction(side) {
  return String(side || '').toLowerCase() === 'short' ? -1 : 1;
}

function normalizeSignal(signal) {
  const pair = String(signal?.pair || signal?.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const side = String(signal?.side || '').toLowerCase();
  const score = Number(signal?.score);
  const createdAt = timestamp(signal?.createdAt || signal?.publishedAt);
  if (!pair || !['long', 'short'].includes(side)) return null;
  if (!Number.isFinite(score) || score < MIN_SCORE) return null;
  if (signal?.bitgetEligible === false) return null;
  if (signal?.status && signal.status !== 'OPEN') return null;
  if (!createdAt || Date.now() - createdAt > MAX_SIGNAL_AGE_MS) return null;
  return {
    id: String(signal.id || `${pair}-${side}-${createdAt}`),
    pair, side, score, createdAt,
    entry: Number(signal.entry) || null,
    tp: Number(signal.tp1 || signal.takeProfit) || null,
    sl: Number(signal.sl || signal.stopLoss) || null,
    category: String(signal.category || '')
  };
}

async function fetchSignals({config, fetchImpl, now}) {
  const response = await fetchImpl(config.signalUrl, {
    headers: {Authorization: `Bearer ${config.cronSecret}`, Accept: 'application/json'},
    redirect: 'error',
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  });
  if (!response.ok) throw Error('LIVE_SIGNAL_FEED_UNAVAILABLE');
  const text = await response.text();
  if (text.length > 2_000_000) throw Error('LIVE_SIGNAL_FEED_INVALID');
  const body = JSON.parse(text);
  const rows = Array.isArray(body?.open) ? body.open
    : Array.isArray(body?.openSignals) ? body.openSignals
      : Array.isArray(body?.signals) ? body.signals : [];
  const seen = new Set();
  return rows.map(normalizeSignal).filter(signal => {
    if (!signal || seen.has(signal.id)) return false;
    seen.add(signal.id);
    return signal.createdAt <= now() && now() - signal.createdAt <= MAX_SIGNAL_AGE_MS;
  });
}

async function syncExchangePositions(store, accountHash, row, exchange, positions) {
  const liveKeys = new Set(positions.map(position => `${position.symbol}|${position.side}`));
  for (const local of store.listPositions(accountHash, row.id)) {
    if ((local.status === 'OPEN' || local.status === 'CLOSING') && !liveKeys.has(`${local.symbol}|${local.side}`)) {
      store.upsertPosition(accountHash, {
        id: local.id, connectionId: local.connection_id, exchange: local.exchange, symbol: local.symbol,
        side: local.side, amount: local.amount, entry: local.entry, mark: local.mark,
        leverage: local.leverage, marginUsd: local.margin_usd, unrealizedPnl: local.unrealized_pnl,
        protectionRoe: local.protection_roe, realizedPnl: local.realized_pnl,
        tp: local.tp, sl: local.sl, status: 'CLOSED', sourceSignal: local.source_signal,
        openedAt: local.opened_at, closedAt: Date.now(), raw: {closedBy: 'exchange-or-manual'}
      });
    }
  }
  for (const position of positions) {
    const existing = store.findOpenPosition(accountHash, row.id, position.symbol, position.side);
    if (existing) {
      store.upsertPosition(accountHash, {
        id: existing.id, connectionId: row.id, exchange: row.exchange, symbol: position.symbol,
        side: position.side, amount: position.amount, entry: position.entry, mark: position.mark,
        leverage: position.leverage, marginUsd: position.margin, unrealizedPnl: position.unrealizedPnl,
        protectionRoe: existing.protection_roe, tp: existing.tp, sl: existing.sl,
        status: 'OPEN', sourceSignal: existing.source_signal, openedAt: existing.opened_at, raw: position.raw
      });
    } else {
      store.upsertPosition(accountHash, {
        connectionId: row.id, exchange: row.exchange, symbol: position.symbol, side: position.side,
        amount: position.amount, entry: position.entry, mark: position.mark, leverage: position.leverage,
        marginUsd: position.margin, unrealizedPnl: position.unrealizedPnl, protectionRoe: row.protection_roe,
        status: 'OPEN', sourceSignal: null, openedAt: Date.now(), raw: position.raw
      });
    }
  }
  store.updateConnectionSync(accountHash, row.id, {
    status: 'connected', lastError: null,
    balance: row.balance_json ? JSON.parse(row.balance_json) : null,
    positions: positions.map(position => ({
      symbol: position.symbol, side: position.side, amount: position.amount,
      entry: position.entry, mark: position.mark, leverage: position.leverage,
      margin: position.margin, unrealizedPnl: position.unrealizedPnl
    }))
  });
}

async function manageExits({store, accountHash, row, exchange, positions}) {
  for (const local of store.listPositions(accountHash, row.id)) {
    if (local.status !== 'OPEN') continue;
    const live = positions.find(position => position.symbol === local.symbol && position.side === local.side);
    if (!live) continue;
    let mark = Number(live.mark);
    if (!(mark > 0)) mark = await marketPrice(exchange, local.symbol);
    const dir = direction(local.side);
    const roe = local.entry > 0 ? ((mark - local.entry) / local.entry) * dir * Number(local.leverage || 1) * 100 : 0;
    const realizedPnl = local.entry > 0 ? (mark - local.entry) * Number(local.amount || 0) * dir : 0;
    store.upsertPosition(accountHash, {
      id: local.id, connectionId: local.connection_id, exchange: local.exchange, symbol: local.symbol,
      side: local.side, amount: local.amount, entry: local.entry, mark,
      leverage: local.leverage, marginUsd: local.margin_usd, unrealizedPnl: live.unrealizedPnl,
      protectionRoe: local.protection_roe, realizedPnl, tp: local.tp, sl: local.sl, status: 'OPEN',
      sourceSignal: local.source_signal, openedAt: local.opened_at, raw: live.raw
    });
    const hitTp = local.tp > 0 && (dir === 1 ? mark >= local.tp : mark <= local.tp);
    const hitSl = local.sl > 0 && (dir === 1 ? mark <= local.sl : mark >= local.sl);
    const hitProtection = Number(local.protection_roe) > 0 && roe >= Number(local.protection_roe);
    if (!hitTp && !hitSl && !hitProtection) continue;
    await closeMarketPosition(exchange, {
      symbol: local.symbol, side: local.side, amount: local.amount,
      clientOrderId: `jlive-exit-${local.id.slice(0, 12)}`
    });
    store.upsertPosition(accountHash, {
      id: local.id, connectionId: local.connection_id, exchange: local.exchange, symbol: local.symbol,
      side: local.side, amount: local.amount, entry: local.entry, mark,
      leverage: local.leverage, marginUsd: local.margin_usd, unrealizedPnl: live.unrealizedPnl,
      protectionRoe: local.protection_roe, realizedPnl, tp: local.tp, sl: local.sl, status: 'CLOSED',
      sourceSignal: local.source_signal, openedAt: local.opened_at, closedAt: Date.now(),
      raw: {exit: hitTp ? 'TP' : hitSl ? 'SL' : 'PROTECTION', roe}
    });
  }
}

async function executeSignals({store, accountHash, row, exchange, positions, signals}) {
  const open = positions.length;
  if (open >= row.max_open) return 0;
  if (store.countOrdersSince(row.id, utcDayStart(Date.now())) >= row.max_trades_day) return 0;
  const realized = store.realizedPnlSince(row.id, utcDayStart(Date.now()));
  if (row.daily_loss_usd > 0 && realized <= -Number(row.daily_loss_usd)) {
    store.setLive(accountHash, row.id, false);
    store.audit(accountHash, row.id, 'DAILY_LOSS_LIMIT', String(realized));
    return 0;
  }
  for (const signal of signals) {
    if (!(signal.tp > 0) || !(signal.sl > 0)) continue;
    if (store.orderForSignal(row.id, signal.id)) continue;
    const market = resolveMarket(exchange, signal.pair);
    if (!market) continue;
    if (open + 1 > row.max_open) break;
    const orderId = clientOrderId(row.id, signal.id);
    const pending = store.recordOrder(accountHash, {
      connectionId: row.id, signalId: signal.id, clientOrderId: orderId,
      symbol: market.symbol, side: signal.side, type: 'market', status: 'PENDING'
    });
    try {
      const placed = await placeMarketOrder(exchange, {
        symbol: market.symbol, side: signal.side,
        marginUsd: row.margin_usd, leverage: row.leverage, clientOrderId: orderId,
        takeProfit: signal.tp, stopLoss: signal.sl
      });
      store.updateOrder(row.id, pending.id, 'OPEN');
      store.upsertPosition(accountHash, {
        connectionId: row.id, exchange: row.exchange, symbol: market.symbol, side: signal.side,
        amount: placed.amount, entry: placed.price, mark: placed.price,
        leverage: row.leverage, marginUsd: row.margin_usd, protectionRoe: row.protection_roe,
        tp: signal.tp, sl: signal.sl, status: 'OPEN', sourceSignal: signal.id,
        openedAt: Date.now(), raw: {orderId: placed.order?.id || null, score: signal.score}
      });
      return 1;
    } catch (error) {
      store.updateOrder(row.id, pending.id, 'FAILED', safeError(error));
      throw error;
    }
  }
  return 0;
}

export function startEngine({config, store, vault, vaultContext, fetchImpl = fetch, now = Date.now, log = console, adapterFactory = createAdapter}) {
  if (config.engineEnabled !== true) return Object.freeze({stop() {}, runOnce: async () => ({disabled: true})});
  let running = false;
  let timer = null;
  const health = {enabled: true, lastRunAt: null, lastSummary: null, lastError: null};

  async function runOnce() {
    if (running) return {skipped: true};
    running = true;
    const summary = {connections: 0, executed: 0, errors: 0};
    health.lastRunAt = now();
    try {
      const signals = await fetchSignals({config, fetchImpl, now});
      const rows = store.activeConnections().filter(row => (!config.betaMode || config.betaAllowlist.includes(row.account_hash))
        && (config.allowUnverifiedExchanges === true || config.verifiedExchanges.includes(row.exchange)));
      summary.connections = rows.length;
      for (const row of rows) {
        try {
          const definition = exchangeDefinition(row.exchange);
          if (!definition) throw Error('LIVE_EXCHANGE_UNSUPPORTED');
          const credentials = {
            apiKey: vault.open(row.key_enc, vaultContext({accountHash: row.account_hash, connectionId: row.id, exchange: row.exchange})),
            secret: vault.open(row.secret_enc, vaultContext({accountHash: row.account_hash, connectionId: row.id, exchange: row.exchange})),
            passphrase: row.passphrase_enc ? vault.open(row.passphrase_enc, vaultContext({accountHash: row.account_hash, connectionId: row.id, exchange: row.exchange})) : ''
          };
          const exchange = await adapterFactory(definition, credentials, {timeout: config.requestTimeoutMs});
          try {
            const positions = normalizePositions(await exchange.fetchPositions());
            await syncExchangePositions(store, row.account_hash, row, exchange, positions);
            await manageExits({store, accountHash: row.account_hash, row, exchange, positions});
            summary.executed += await executeSignals({store, accountHash: row.account_hash, row, exchange, positions, signals});
          } finally {
            try { await exchange.close(); } catch {}
          }
        } catch (error) {
          summary.errors += 1;
          log.warn('LIVE_ENGINE_CONNECTION_ERROR', row.id, safeError(error));
          try {
            store.updateConnectionSync(row.account_hash, row.id, {
              status: 'error', lastError: safeError(error), balance: null, positions: []
            });
          } catch {}
        }
      }
    } catch (error) {
      summary.errors += 1;
      health.lastError = safeError(error);
      log.warn('LIVE_ENGINE_ERROR', safeError(error));
    } finally {
      health.lastSummary = summary;
      running = false;
    }
    return summary;
  }

  timer = setInterval(() => { void runOnce(); }, config.engineIntervalMs);
  timer.unref?.();
  return Object.freeze({
    stop() { if (timer) clearInterval(timer); timer = null; },
    runOnce,
    status() { return Object.freeze({...health}); }
  });
}
