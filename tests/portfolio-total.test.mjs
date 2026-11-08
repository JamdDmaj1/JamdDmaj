import assert from 'node:assert/strict'
import test from 'node:test'
import {sumUsd, perpsCollateralUsd, combinedTotal, splitUsd} from '../lib/portfolio-total.js'

test('sumUsd adds valid values and counts the unusable ones', () => {
  assert.deepEqual(sumUsd([1.5, 2.25]), {total: 3.75, counted: 2, missing: 0})
  assert.deepEqual(sumUsd([1, null, Number.NaN, -2]), {total: 1, counted: 1, missing: 3})
  assert.deepEqual(sumUsd([]), {total: 0, counted: 0, missing: 0})
  assert.deepEqual(sumUsd(undefined), {total: 0, counted: 0, missing: 0})
})

test('perpsCollateralUsd reads six-decimal units and skips malformed rows', () => {
  const positions = [
    {collateralUsdUnits: '10000000', sizeUsdUnits: '50000000'},
    {collateralUsdUnits: '2500000', sizeUsdUnits: '5000000'},
    {collateralUsdUnits: 'nope'},
    {},
    null,
  ]
  assert.deepEqual(perpsCollateralUsd(positions), {collateralUsd: 12.5, exposureUsd: 55, count: 2})
  assert.deepEqual(perpsCollateralUsd(null), {collateralUsd: 0, exposureUsd: 0, count: 0})
})

test('combinedTotal refuses to present a partial figure as the total', () => {
  const wallets = {total: 4.54, counted: 2, missing: 0}
  const futures = {state: 'ok', collateralUsd: 10, count: 1}
  assert.deepEqual(combinedTotal(wallets, futures), {
    totalUsd: 14.54, complete: true, walletsUsd: 4.54, futuresUsd: 10,
  })
  assert.equal(combinedTotal(wallets, null).totalUsd, null)
  assert.equal(combinedTotal({total: 4.54, missing: 1}, futures).totalUsd, 14.54)
  assert.equal(combinedTotal({total: 4.54, missing: 1}, futures).complete, false)
})

test('splitUsd formats two decimals and rejects unusable values', () => {
  assert.deepEqual(splitUsd(14.5), {integer: '14', fraction: '50', text: '14.50'})
  assert.equal(splitUsd(Number.NaN), null)
  assert.equal(splitUsd(-1), null)
})
