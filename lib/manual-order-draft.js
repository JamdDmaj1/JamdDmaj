export function reviewManualOrder(value = {}) {
  const symbol = String(value.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) throw new Error('contract');
  if (!['LONG', 'SHORT'].includes(value.side)) throw new Error('side');
  const margin = Number(value.margin), leverage = Number(value.leverage);
  if (!Number.isFinite(margin) || margin < 1 || margin > 25) throw new Error('margin');
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > 10) throw new Error('leverage');
  const reference = Number(value.reference), stop = Number(value.stop), take = Number(value.take);
  if (![reference, stop, take].every(n => Number.isFinite(n) && n > 0)) throw new Error('prices');
  if (!(value.side === 'LONG' ? stop < reference && reference < take : take < reference && reference < stop)) throw new Error('geometry');
  return Object.freeze({symbol, side:value.side, margin, leverage, reference, stop, take,
    notional:margin*leverage, orderType:'market', marginMode:'isolated',
    contractVerified:false, submitted:false});
}
