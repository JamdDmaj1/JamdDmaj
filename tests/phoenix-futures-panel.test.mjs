import test from 'node:test'
import assert from 'node:assert/strict'
import {setupPhoenixFuturesPanel} from '../lib/phoenix-futures-panel.js'

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

async function settle(check, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for ' + label)
}

function fixture(client) {
  const doc = { createElement: (tag) => element(tag) }
  const parent = element('section')
  const dispose = setupPhoenixFuturesPanel(parent, 'es', doc, {client})
  return {parent, dispose}
}

test('lists only markets Phoenix actually serves and counts the rest', async (t) => {
  const client = {
    catalog: async () => ({
      markets: [
        {symbol: 'BTC', active: true, feeMicro: 300, tiers: [{leverageTenths: 100, maxSizeBaseLots: '1'}]},
        {symbol: 'XRP', active: true, feeMicro: 500, tiers: [{leverageTenths: 50, maxSizeBaseLots: '1'}]},
        {symbol: 'ETH', active: false, feeMicro: 300, tiers: [{leverageTenths: 100, maxSizeBaseLots: '1'}]},
      ],
    }),
  }
  const f = fixture(client)
  t.after(f.dispose)
  await settle(() => flatten(f.parent).some((text) => text.includes('tienen mercado activo')), 'status')
  const texts = flatten(f.parent)
  assert.ok(texts.some((text) => text.includes('BTC')))
  assert.ok(texts.some((text) => text.includes('XRP')))
  assert.ok(texts.some((text) => text.includes('mercado inactivo')))
  assert.ok(texts.some((text) => text.includes('136 todavía no tienen mercado de futuros')))
})

test('never invents markets when Phoenix cannot be read', async (t) => {
  const client = { catalog: async () => { throw new Error('offline') } }
  const f = fixture(client)
  t.after(f.dispose)
  await settle(() => flatten(f.parent).some((text) => text.includes('No se pudo consultar Phoenix')), 'error status')
  const texts = flatten(f.parent)
  assert.ok(!texts.some((text) => text.includes('hasta ')))
})
