import {validClosedTradePerformance} from './closed-trade-performance.js'

/**
 * Aggregate a closed-trade page for the history header. Only trades whose
 * performance validates are counted: a missing figure is reported as
 * unavailable, never folded in as zero.
 */
export function summarizeClosedTrades(items) {
  const list = Array.isArray(items) ? items : []
  let total = 0n
  let counted = 0
  let wins = 0
  let losses = 0
  let unavailable = 0
  for (const item of list) {
    const performance = item?.performance &&
      validClosedTradePerformance(item.performance, item.receivedUsdcUnits, item.state)
      ? item.performance
      : null
    if (!performance) {
      unavailable += 1
      continue
    }
    let result
    try {
      result = BigInt(performance.resultUsdcUnits)
    } catch {
      unavailable += 1
      continue
    }
    total += result
    counted += 1
    if (result > 0n) wins += 1
    else if (result < 0n) losses += 1
  }
  return {
    count: list.length,
    counted,
    wins,
    losses,
    unavailable,
    totalUsdcUnits: counted ? total : null,
  }
}
