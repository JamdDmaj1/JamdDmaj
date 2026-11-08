// Public price evidence only. Neither a market quote nor a plan grants signing.
const quotes = new WeakSet();
const fail = code => { throw Error(`PHOENIX_QUOTE_${code}`); };

export function decodePhoenixMarketQuote(raw, {symbol, now = Date.now()} = {}) {
  if (typeof symbol !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(symbol) ||
      raw?.symbol !== symbol || !Number.isSafeInteger(now)) fail('IDENTITY');
  const stamp = typeof raw.timestamp_ms === 'string' && /^\d{1,16}$/.test(raw.timestamp_ms)
    ? Number(raw.timestamp_ms) : raw.timestamp_ms;
  if (!Number.isSafeInteger(stamp) || stamp > now + 2000 || now - stamp > 10000) fail('STALE');
  for (const price of [raw.mark_price, raw.oracle_price]) {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1e9) fail('PRICE');
  }
  // Preserve the decimal value carried by the API number; never round the
  // reference to six places before applying the user's exact protection.
  let referencePrice = String(raw.mark_price);
  if (referencePrice.includes('e')) {
    const [mantissa, exponentText] = referencePrice.split('e');
    const exponent = Number(exponentText), [whole, fraction = ''] = mantissa.split('.');
    const digits = whole + fraction, point = whole.length + exponent;
    referencePrice = point <= 0 ? '0.' + '0'.repeat(-point) + digits
      : point >= digits.length ? digits + '0'.repeat(point - digits.length)
      : digits.slice(0, point) + '.' + digits.slice(point);
  }
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,18})?$/.test(referencePrice)) fail('RESOLUTION');
  if (Math.abs(raw.mark_price / raw.oracle_price - 1) > 0.02) fail('ORACLE_DIVERGENCE');
  const result = Object.freeze({venue: 'phoenix', symbol, referencePrice,
    markPrice: raw.mark_price, oraclePrice: raw.oracle_price,
    timestamp: stamp, observedAt: now, expiresAt: Math.min(stamp + 10000, now + 5000),
    readyForSigning: false});
  quotes.add(result);
  return result;
}

export function requirePhoenixMarketQuote(quote, {symbol, now = Date.now()} = {}) {
  if (!quotes.has(quote) || quote.symbol !== symbol || !Number.isSafeInteger(now) ||
      quote.observedAt > now + 2000 || now >= quote.expiresAt) fail('EXPIRED');
  return quote;
}
