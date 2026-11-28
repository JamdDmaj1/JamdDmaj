import {createHash} from 'node:crypto';

export const EXCHANGES = Object.freeze([
  {id: 'bitget', label: 'Bitget', ccxt: 'bitget', passphrase: true, defaultType: 'swap', verified: true},
  {id: 'binance', label: 'Binance USDⓈ-M', ccxt: 'binanceusdm', passphrase: false, defaultType: 'swap', verified: false},
  {id: 'bybit', label: 'Bybit', ccxt: 'bybit', passphrase: false, defaultType: 'swap', verified: false},
  {id: 'okx', label: 'OKX', ccxt: 'okx', passphrase: true, defaultType: 'swap', verified: false},
  {id: 'kucoin', label: 'KuCoin Futures', ccxt: 'kucoinfutures', passphrase: true, defaultType: 'swap', verified: false},
  {id: 'gate', label: 'Gate.io', ccxt: 'gate', passphrase: false, defaultType: 'swap', verified: false},
  {id: 'mexc', label: 'MEXC', ccxt: 'mexc', passphrase: false, defaultType: 'swap', verified: false}
]);

const BY_ID = new Map(EXCHANGES.map(item => [item.id, Object.freeze(item)]));

export function exchangeDefinition(id) {
  return BY_ID.get(String(id || '').toLowerCase()) || null;
}

export function publicExchanges() {
  return EXCHANGES.map(({id, label, passphrase, verified}) => ({id, label, passphrase, verified: verified === true}));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeError(error) {
  const text = String(error?.message || error || 'exchange-error').replace(/[\r\n]+/g, ' ').slice(0, 220);
  return text || 'exchange-error';
}

async function ccxtModule() {
  try {
    return await import('ccxt');
  } catch {
    throw Object.assign(Error('LIVE_EXCHANGE_LIBRARY_UNAVAILABLE'), {status: 503});
  }
}

export async function createAdapter(definition, credentials, {timeout = 15000} = {}) {
  if (!definition) throw Object.assign(Error('LIVE_EXCHANGE_UNSUPPORTED'), {status: 400});
  const module = await ccxtModule();
  const Constructor = module[definition.ccxt] || module.default?.[definition.ccxt];
  if (typeof Constructor !== 'function') throw Object.assign(Error('LIVE_EXCHANGE_UNSUPPORTED'), {status: 503});
  const exchange = new Constructor({
    apiKey: credentials.apiKey,
    secret: credentials.secret,
    ...(credentials.passphrase ? {password: credentials.passphrase} : {}),
    enableRateLimit: true,
    timeout,
    options: {defaultType: definition.defaultType, adjustForTimeDifference: true}
  });
  await exchange.loadMarkets();
  return exchange;
}

export async function probeExchange(definition, credentials, options = {}) {
  const exchange = await createAdapter(definition, credentials, options);
  try {
    let balance;
    try {
      balance = await exchange.fetchBalance({type: 'swap'});
    } catch {
      balance = await exchange.fetchBalance();
    }
    const total = number(balance?.total?.USDT ?? balance?.USDT?.total);
    const free = number(balance?.free?.USDT ?? balance?.USDT?.free);
    const used = number(balance?.used?.USDT ?? balance?.USDT?.used);
    let positions = [];
    try {
      positions = normalizePositions(await exchange.fetchPositions());
    } catch {
      positions = [];
    }
    return {
      status: 'connected',
      balance: {currency: 'USDT', total, free, used},
      positions,
      checkedAt: Date.now()
    };
  } finally {
    try { await exchange.close(); } catch {}
  }
}

export function normalizePositions(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(position => {
    const amount = Math.abs(number(position?.contracts ?? position?.contractSize ?? position?.info?.total));
    if (!(amount > 0)) return [];
    return [{
      symbol: String(position?.symbol || position?.info?.symbol || ''),
      side: String(position?.side || '').toLowerCase(),
      amount,
      entry: number(position?.entryPrice ?? position?.info?.openPriceAvg),
      mark: number(position?.markPrice ?? position?.info?.markPrice),
      leverage: number(position?.leverage ?? position?.info?.leverage),
      margin: number(position?.initialMargin ?? position?.info?.margin),
      unrealizedPnl: number(position?.unrealizedPnl ?? position?.info?.unrealizedPL),
      tp: number(position?.takeProfitPrice ?? position?.info?.presetTakeProfitPrice),
      sl: number(position?.stopLossPrice ?? position?.info?.presetStopLossPrice),
      raw: {
        id: position?.id || null,
        symbol: position?.symbol || null,
        side: position?.side || null
      }
    }];
  });
}

export function resolveMarket(exchange, pair) {
  const cleaned = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return null;
  const candidates = [];
  for (const market of Object.values(exchange.markets || {})) {
    if (!market || market.swap === false) continue;
    const id = String(market.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const symbol = String(market.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (id === cleaned || symbol === cleaned || symbol === `${cleaned}USDT`) {
      candidates.push(market);
    }
  }
  candidates.sort((a, b) => (a.linear === true ? -1 : 0) - (b.linear === true ? -1 : 0));
  return candidates[0] || null;
}

export async function marketPrice(exchange, symbol) {
  const ticker = await exchange.fetchTicker(symbol);
  const price = number(ticker?.last ?? ticker?.close ?? ticker?.ask ?? ticker?.bid);
  if (!(price > 0)) throw Object.assign(Error('LIVE_MARKET_PRICE_UNAVAILABLE'), {status: 503});
  return price;
}

export async function placeMarketOrder(exchange, {symbol, side, marginUsd, leverage, clientOrderId, takeProfit, stopLoss}) {
  try { await exchange.setMarginMode('isolated', symbol); } catch {}
  await exchange.setLeverage(leverage, symbol);
  const price = await marketPrice(exchange, symbol);
  const notional = Number(marginUsd) * Number(leverage);
  if (!(notional > 0)) throw Object.assign(Error('LIVE_ORDER_SIZE_INVALID'), {status: 400});
  let amount = exchange.amountToPrecision(symbol, notional / price);
  amount = Number(amount);
  if (!(amount > 0)) throw Object.assign(Error('LIVE_ORDER_SIZE_INVALID'), {status: 400});
  const orderSide = String(side).toLowerCase() === 'short' ? 'sell' : 'buy';
  const request = {clientOrderId};
  let order;
  const tp = Number(takeProfit) || 0, sl = Number(stopLoss) || 0;
  if (tp > 0 && sl > 0 && typeof exchange.createOrderWithTakeProfitAndStopLoss === 'function') {
    try {
      order = await exchange.createOrderWithTakeProfitAndStopLoss(symbol, 'market', orderSide, amount, undefined, tp, sl, {
        ...request, takeProfitType: 'market', stopLossType: 'market'
      });
    } catch (error) {
      // The entry itself has not been submitted when the bracket request is
      // rejected. Surface the error instead of silently opening an unprotected
      // position.
      throw error;
    }
  } else {
    order = await exchange.createOrder(symbol, 'market', orderSide, amount, undefined, request);
  }
  return {order, amount, price, notional, orderSide, clientOrderId, protected: tp > 0 && sl > 0};
}

export async function closeMarketPosition(exchange, {symbol, side, amount, clientOrderId}) {
  const closeSide = String(side).toLowerCase() === 'long' ? 'sell' : 'buy';
  const order = await exchange.createOrder(symbol, 'market', closeSide, amount, undefined, {
    reduceOnly: true,
    clientOrderId
  });
  return order;
}

export function clientOrderId(connectionId, signalId) {
  return 'jlive-' + createHash('sha256').update(`${connectionId}|${signalId}`).digest('hex').slice(0, 24);
}

export {safeError};
