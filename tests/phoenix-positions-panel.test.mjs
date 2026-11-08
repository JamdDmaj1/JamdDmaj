import test from 'node:test'
import assert from 'node:assert/strict'
import {setupPhoenixPositionsPanel} from '../lib/phoenix-positions-panel.js'
import {rememberWalletAccount, selectWalletAccount} from '../lib/wallet-portfolio-store.js'

const bot = '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T'
const workflowId = 'a'.repeat(64)

function element(tag) {
  return {
    tag, id: '', className: '', textContent: '', type: '', disabled: false, hidden: false, checked: false, onclick: null,
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

function findButton(node, label) {
  if (node?.tag === 'button' && node.textContent === label) return node
  for (const child of node?.children || []) {
    const hit = findButton(child, label)
    if (hit) return hit
  }
  return null
}

function findInput(node) {
  if (node?.tag === 'input') return node
  for (const child of node?.children || []) {
    const hit = findInput(child)
    if (hit) return hit
  }
  return null
}

async function settle(check, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for ' + label)
}

function fixture(client) {
  const doc = { createElement: (tag) => element(tag), defaultView: undefined }
  rememberWalletAccount(doc, {address: bot, source: 'watch', name: 'Solo consulta'})
  selectWalletAccount(doc, {address: bot, source: 'watch', name: 'Solo consulta'})
  const parent = element('section')
  const dispose = setupPhoenixPositionsPanel(parent, 'es', doc, {client})
  return {doc, parent, dispose}
}

test('reviews and confirms a full close only after explicit consent', async (t) => {
  const calls = []
  const client = {
    positions: async (wallet) => { calls.push(['positions', wallet]); return {items: [{workflowId, symbol: 'SOL', subaccountIndex: 1}]} },
    prepareClose: async (wallet, id) => {
      calls.push(['prepareClose', wallet, id])
      return {symbol: 'SOL', side: 'LONG', referencePrice: '150.5', priceLimitUsd: '149.75', baseLots: '10', estimatedReceivedCollateralUnits: '9800000', maximumNetworkAndRentLamports: '20000', expiresAt: Date.now() + 10000}
    },
    confirmClose: async (review, approval) => { calls.push(['confirmClose', approval]); return {state: 'SIGNED', phase: 'CLOSE'} },
  }
  const f = fixture(client)
  t.after(f.dispose)
  findButton(f.parent, 'Consultar posiciones').onclick()
  await settle(() => flatten(f.parent).some((text) => text.includes('SOL')), 'position row')
  findButton(f.parent, 'Revisar cierre').onclick()
  await settle(() => flatten(f.parent).some((text) => text.includes('Límite de precio')), 'review')
  const texts = flatten(f.parent)
  assert.ok(texts.some((text) => text.includes('149.75')))
  assert.ok(texts.some((text) => text.includes('no garantizado')))
  const confirm = findButton(f.parent, 'Confirmar cierre completo')
  assert.equal(confirm.disabled, true)
  const consent = findInput(f.parent)
  assert.ok(consent)
  consent.checked = true
  consent.onchange()
  assert.equal(confirm.disabled, false)
  confirm.onclick()
  await settle(() => calls.some(([name]) => name === 'confirmClose'), 'confirm call')
  assert.deepEqual(calls.at(-1), ['confirmClose', true])
})

test('explains when the server has not enabled Phoenix', async (t) => {
  const client = {
    positions: async () => { const error = new Error('phoenix-unavailable'); error.code = 'phoenix-unavailable'; throw error },
    prepareClose: async () => { throw new Error('unused') },
    confirmClose: async () => { throw new Error('unused') },
  }
  const f = fixture(client)
  t.after(f.dispose)
  findButton(f.parent, 'Consultar posiciones').onclick()
  await settle(() => flatten(f.parent).some((text) => text.includes('no está habilitado en el servidor')), 'unavailable')
  assert.ok(!flatten(f.parent).some((text) => text.includes('Revisar cierre')))
})
