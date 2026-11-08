import test from 'node:test'
import assert from 'node:assert/strict'
import {mapMercadosToPhoenix, isFuturesOperable, normalizeSymbol} from '../lib/phoenix-market-map.js'

const mercados = [
  {symbol: 'BTC', id: 'bitcoin'},
  {symbol: 'ETH', id: 'ethereum'},
  {symbol: 'DOGE', id: 'dogecoin'},
  {symbol: 'pepe', id: 'pepe'},
  {symbol: 'BTC', id: 'bitcoin-duplicate'},
  {symbol: 'BAD SYMBOL', id: 'bad'},
]
const phoenix = {
  markets: [
    {symbol: 'BTC', active: true},
    {symbol: 'ETH', active: false},
    {symbol: 'doge', active: true},
  ],
}

test('normalizes symbols and rejects unusable ones', () => {
  assert.equal(normalizeSymbol(' btc '), 'BTC')
  assert.equal(normalizeSymbol('kPEPE'), 'KPEPE')
  assert.equal(normalizeSymbol('BAD SYMBOL'), null)
  assert.equal(normalizeSymbol(undefined), null)
})

test('maps operable, inactive and unsupported tokens without duplicates', () => {
  const result = mapMercadosToPhoenix(mercados, phoenix)
  assert.deepEqual(result.operable.map((entry) => entry.symbol), ['BTC', 'DOGE'])
  assert.deepEqual(result.inactive.map((entry) => entry.symbol), ['ETH'])
  assert.deepEqual(result.unsupported.map((entry) => entry.symbol), ['PEPE'])
  assert.deepEqual(result.counts, {mercados: 4, operable: 2, inactive: 1, unsupported: 1})
  assert.equal(result.operable[0].id, 'bitcoin')
  assert.equal(isFuturesOperable('doge', result), true)
  assert.equal(isFuturesOperable('ETH', result), false)
  assert.equal(isFuturesOperable('PEPE', result), false)
})

test('a token named only by Phoenix stays out of the mapping', () => {
  const result = mapMercadosToPhoenix([{symbol: 'BTC', id: 'bitcoin'}], phoenix)
  assert.equal(result.counts.operable, 1)
  assert.equal(result.counts.unsupported, 0)
  assert.ok(!result.operable.some((entry) => entry.symbol === 'DOGE'))
})
