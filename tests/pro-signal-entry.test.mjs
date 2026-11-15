import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSignalEntry } from '../lib/pro-signals.js'
test('high ADX waits for a pullback in the signal direction', () => {
  const long = buildSignalEntry({ price: 100, adx: 50, atrDistance: 0.02, direction: 1 })
  assert.ok(Math.abs(long.entry - 99.996) < 1e-9)
  assert.equal(long.entryType, 'pullback-0.2atr')
  const short = buildSignalEntry({ price: 100, adx: 50, atrDistance: 0.02, direction: -1 })
  assert.ok(Math.abs(short.entry - 100.004) < 1e-9)
})
test('normal ADX enters at market', () => {
  const entry = buildSignalEntry({ price: 100, adx: 30, atrDistance: 0.02, direction: 1 })
  assert.equal(entry.entry, 100)
  assert.equal(entry.entryType, 'market')
})
