// Mercados → Phoenix market mapping. Pure: no network, no signing, no writes.
// A token is futures-operable only when Phoenix lists a market for it; the rest
// stay visible in Markets as research-only and must never be advertised as
// tradable.

const SYMBOL = /^[A-Za-z0-9_-]{1,32}$/

/** Uppercase symbol used for matching; returns null when unusable. */
export function normalizeSymbol(value) {
  if (typeof value !== 'string') return null
  const symbol = value.trim().toUpperCase()
  return SYMBOL.test(symbol) ? symbol : null
}

/**
 * Split the Markets catalog into tokens Phoenix can serve and tokens it cannot.
 * `phoenixCatalog` is the decoded catalog (`{markets:[{symbol,active,...}]}`);
 * inactive markets are reported separately: listed, but not open for new
 * entries.
 */
export function mapMercadosToPhoenix(mercados, phoenixCatalog) {
  const phoenix = new Map()
  for (const market of Array.isArray(phoenixCatalog?.markets) ? phoenixCatalog.markets : []) {
    const symbol = normalizeSymbol(market?.symbol)
    if (symbol && !phoenix.has(symbol)) phoenix.set(symbol, market)
  }
  const operable = []
  const inactive = []
  const unsupported = []
  const seen = new Set()
  for (const token of Array.isArray(mercados) ? mercados : []) {
    const symbol = normalizeSymbol(token?.symbol)
    if (!symbol || seen.has(symbol)) continue
    seen.add(symbol)
    const market = phoenix.get(symbol)
    if (!market) {
      unsupported.push({symbol, id: token?.id ?? null})
      continue
    }
    const entry = {symbol, id: token?.id ?? null, marketSymbol: market.symbol, venue: 'phoenix', market}
    if (market.active === true) operable.push(entry)
    else inactive.push(entry)
  }
  return {
    operable,
    inactive,
    unsupported,
    counts: {mercados: seen.size, operable: operable.length, inactive: inactive.length, unsupported: unsupported.length},
  }
}

/** True when a Mercados symbol can open a new futures position today. */
export function isFuturesOperable(symbol, mapping) {
  const target = normalizeSymbol(symbol)
  if (!target || !mapping) return false
  return mapping.operable.some((entry) => entry.symbol === target)
}
