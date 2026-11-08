import test from 'node:test'
import assert from 'node:assert/strict'
import {setupPortfolioSummary} from '../lib/portfolio-summary.js'
import {rememberWalletAccount} from '../lib/wallet-portfolio-store.js'

const native = '7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy'
const bot = '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T'

function element(tag) {
  return {
    tag, id: '', className: '', textContent: '', type: '', disabled: false, onclick: null,
    children: [], attributes: {},
    append(...items) { this.children.push(...items) },
    prepend(...items) { this.children.unshift(...items) },
    replaceChildren(...items) { this.children = [...items] },
    remove() { this.removed = true },
    setAttribute(name, value) { this.attributes[name] = value },
  }
}

function flatten(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (node.textContent) out.push(String(node.textContent))
  for (const child of node.children || []) flatten(child, out)
  return out
}

function fixture({portfolios = {}, failClient = false, accounts = []} = {}) {
  const doc = new EventTarget()
  const host = element('section')
  doc.head = element('head')
  doc.hidden = false
  doc.defaultView = {Event, CustomEvent}
  doc.getElementById = (id) => (id === 'terminal-assets' ? host : null)
  doc.createElement = (tag) => element(tag)
  for (const account of accounts) rememberWalletAccount(doc, account)
  const win = {
    Capacitor: undefined,
    fetch: async (url) => {
      const address = new URL(url, 'https://www.jamddmaj.com').searchParams.get('address')
      const value = portfolios[address]
      if (value === undefined) return {ok: false, json: async () => ({ok: false})}
      return {ok: true, json: async () => ({ok: true, address, network: 'solana:mainnet', estimatedValueUsd: value})}
    },
  }
  const client = {
    positions: async () => {
      if (failClient) {
        const error = new Error('controls-unavailable')
        error.code = 'controls-unavailable'
        throw error
      }
      return {positions: [{collateralUsdUnits: '10000000', sizeUsdUnits: '50000000'}]}
    },
  }
  return {doc, win, host, client, dispose: setupPortfolioSummary('es', doc, win, {client})}
}

async function settle(check, label) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('timed out waiting for ' + label)
}

test('totals every linked wallet plus futures collateral', async (t) => {
  const f = fixture({
    portfolios: {[native]: 4.54, [bot]: 0.5},
    accounts: [
      {address: native, source: 'native', name: 'JamdDmaj'},
      {address: bot, source: 'watch', name: 'Solo consulta'},
    ],
  })
  t.after(f.dispose)
  await settle(() => flatten(f.host).some((text) => text.includes('15,04')), 'total')
  const texts = flatten(f.host)
  assert.ok(texts.some((text) => text.includes('Total estimado')))
  assert.ok(texts.some((text) => text.includes('4,54')))
  assert.ok(texts.some((text) => text.includes('1 posición')))
  assert.ok(!texts.some((text) => text.includes('parcial')))
})

test('shows no total when futures cannot be read, and says so', async (t) => {
  const f = fixture({
    portfolios: {[native]: 4.54},
    failClient: true,
    accounts: [
      {address: native, source: 'native', name: 'JamdDmaj'},
      {address: bot, source: 'watch', name: 'Solo consulta'},
    ],
  })
  t.after(f.dispose)
  await settle(() => flatten(f.host).some((text) => text.includes('Falta leer una parte')), 'missing note')
  const texts = flatten(f.host)
  assert.ok(texts.some((text) => text.includes('No disponible ahora')))
  assert.ok(!texts.some((text) => text.includes('14,54')))
})

test('marks the total partial when a wallet does not respond', async (t) => {
  const f = fixture({
    portfolios: {[bot]: 10},
    accounts: [
      {address: native, source: 'native', name: 'JamdDmaj'},
      {address: bot, source: 'watch', name: 'Solo consulta'},
    ],
  })
  t.after(f.dispose)
  await settle(() => flatten(f.host).some((text) => text.includes('No disponible')), 'unavailable wallet')
  const texts = flatten(f.host)
  assert.ok(texts.some((text) => text.includes('20')))
  assert.ok(texts.some((text) => text.includes('parcial')))
})
