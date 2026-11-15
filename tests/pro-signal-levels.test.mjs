import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSignalLevels } from '../lib/pro-signals.js'
test('signal levels keep risk wider than the first target', () => {
  const levels = buildSignalLevels({ entry: 100, atrDistance: 0.02, leverage: 10 })
  assert.equal(levels.tpDistance, 0.016)
  assert.equal(levels.slDistance, 0.024)
  assert.equal(levels.protectionTriggerRoe, 16)
  assert.equal(levels.protectionLockRoe, 8)
})
test('protection is clamped for very small and very large volatility', () => {
  const tiny = buildSignalLevels({ entry: 1, atrDistance: 0.001, leverage: 10 })
  const huge = buildSignalLevels({ entry: 1, atrDistance: 0.05, leverage: 50 })
  assert.equal(tiny.protectionTriggerRoe, 3)
  assert.equal(tiny.protectionLockRoe, 1)
  assert.equal(huge.protectionTriggerRoe, 50)
  assert.equal(huge.protectionLockRoe, 40)
})
