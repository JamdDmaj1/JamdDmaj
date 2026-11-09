import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeClosedTrades } from '../lib/closed-trade-history-summary.js'
import { performanceFromTotals } from '../lib/closed-trade-performance.js'

function trade(margin, fees, received, overrides = {}) {
  const performance = performanceFromTotals(margin, fees, received)
  return {
    state: 'COMPLETED',
    receivedUsdcUnits: received,
    performance,
    ...overrides,
  }
}

test('aggregates wins, losses and the net result', () => {
  const summary = summarizeClosedTrades([
    trade('10000000', '20000', '15567307'),
    trade('10000000', '20000', '10190000'),
    trade('10000000', '20000', '9700000'),
  ])
  assert.equal(summary.count, 3)
  assert.equal(summary.counted, 3)
  assert.equal(summary.wins, 2)
  assert.equal(summary.losses, 1)
  assert.equal(
    summary.totalUsdcUnits,
    BigInt(performanceFromTotals('10000000', '20000', '15567307').resultUsdcUnits)
      + BigInt(performanceFromTotals('10000000', '20000', '10190000').resultUsdcUnits)
      + BigInt(performanceFromTotals('10000000', '20000', '9700000').resultUsdcUnits),
  )
  assert.equal(summary.unavailable, 0)
})

test('never folds an unavailable trade in as zero', () => {
  const summary = summarizeClosedTrades([trade('10000000', '20000', '15567307'), { state: 'COMPLETED', receivedUsdcUnits: null, performance: null }])
  assert.equal(summary.count, 2)
  assert.equal(summary.counted, 1)
  assert.equal(summary.unavailable, 1)
  assert.equal(summary.totalUsdcUnits, BigInt(performanceFromTotals('10000000', '20000', '15567307').resultUsdcUnits))
})

test('reports no total when nothing can be reconciled', () => {
  const summary = summarizeClosedTrades([{ state: 'CANCELLED', receivedUsdcUnits: null, performance: null }])
  assert.equal(summary.totalUsdcUnits, null)
  assert.equal(summary.unavailable, 1)
  assert.equal(summarizeClosedTrades(undefined).count, 0)
})
