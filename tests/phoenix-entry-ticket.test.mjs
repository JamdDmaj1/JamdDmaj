import test from 'node:test'
import assert from 'node:assert/strict'
import {setupPhoenixEntryTicket} from '../lib/phoenix-entry-ticket.js'
import {rememberWalletAccount, selectWalletAccount} from '../lib/wallet-portfolio-store.js'

const bot = '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T'

function element(tag) {
  return {
    tag, id: '', className: '', textContent: '', type: '', value: '', min: '', max: '', step: '', disabled: false, hidden: false, checked: false, onclick: null,
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

function findBy(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of node.children || []) {
    const hit = findBy(child, predicate)
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
  const doc = { createElement: (tag) => element(tag) }
  rememberWalletAccount(doc, {address: bot, source: 'watch', name: 'Solo consulta'})
  selectWalletAccount(doc, {address: bot, source: 'watch', name: 'Solo consulta'})
  const parent = element('section')
  const dispose = setupPhoenixEntryTicket(parent, 'es', doc, {
    markets: [{symbol: 'SOL'}, {symbol: 'DOGE'}],
    client,
  })
  return {doc, parent, dispose}
}

const review = {
  symbol: 'SOL', side: 'LONG', marginUsdcUnits: '10000000', leverageTenths: 30,
  referencePrice: '150.5', priceLimitUsd: '151.2525', platformFeeUsdcUnits: '20000',
  maximumNetworkAndRentLamports: '20000', protocolFeeUsdcUnits: '15000', expiresAt: Date.now() + 10000,
}

test('reviews and confirms an opening only with explicit consent', async (t) => {
  const calls = []
  const client = {
    prepareEntry: async (wallet, draft) => { calls.push(['prepare', wallet, draft]); return {...review} },
    confirmEntry: async (r, approval) => { calls.push(['confirm', approval]); return {state: 'OPEN', phase: 'OPEN'} },
  }
  const f = fixture(client)
  t.after(f.dispose)
  const button = findBy(f.parent, (n) => n.tag === 'button' && n.textContent === 'Revisar entrada')
  button.onclick()
  await settle(() => flatten(f.parent).some((text) => text.includes('Precio límite')), 'review')
  assert.deepEqual(calls[0], ['prepare', bot, {symbol: 'SOL', side: 'LONG', marginUsdcUnits: '10000000', leverageTenths: 30}])
  const confirm = findBy(f.parent, (n) => n.tag === 'button' && n.textContent === 'Confirmar apertura')
  assert.equal(confirm.disabled, true)
  const consent = findBy(f.parent, (n) => n.tag === 'input' && n.type === 'checkbox')
  consent.checked = true
  consent.onchange()
  assert.equal(confirm.disabled, false)
  confirm.onclick()
  await settle(() => calls.some(([name]) => name === 'confirm'), 'confirm')
  assert.deepEqual(calls.at(-1), ['confirm', true])
})

test('explains an unavailable venue instead of showing a raw code', async (t) => {
  const client = {
    prepareEntry: async () => { const error = new Error('phoenix-unavailable'); error.code = 'phoenix-unavailable'; throw error },
    confirmEntry: async () => { throw new Error('unused') },
  }
  const f = fixture(client)
  t.after(f.dispose)
  findBy(f.parent, (n) => n.tag === 'button' && n.textContent === 'Revisar entrada').onclick()
  await settle(() => flatten(f.parent).some((text) => text.includes('todavía no está habilitado en el servidor')), 'unavailable message')
})

test('shows the release gate instead of pretending the market is open', async (t) => {
  const client = {
    prepareEntry: async () => { const error = new Error('phoenix-entry-gated'); error.code = 'phoenix-entry-gated'; throw error },
    confirmEntry: async () => { throw new Error('unused') },
  }
  const f = fixture(client)
  t.after(f.dispose)
  findBy(f.parent, (n) => n.tag === 'button' && n.textContent === 'Revisar entrada').onclick()
  await settle(() => flatten(f.parent).some((text) => text.includes('bloqueadas hasta el release')), 'gate message')
  assert.ok(!flatten(f.parent).some((text) => text.includes('Precio límite')))
})
