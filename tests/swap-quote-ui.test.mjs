import test from 'node:test';
import assert from 'node:assert/strict';
import {exactSwapUnits, setupSwapQuote} from '../lib/swap-quote-ui.js';
test('swap amounts retain precision without floating point', () => {
  assert.equal(exactSwapUnits('0.000000001',9),'1');
  assert.equal(exactSwapUnits('123.456789',6),'123456789');
  for (const value of ['0','-1','1e3','0.0000001','1,25','NaN']) assert.throws(()=>exactSwapUnits(value,6));
});
function fixture() {
  const nodes = [];
  const doc = { createElement(tag) {
    const node = { tag, children: [], value: '', textContent: '', append(...items) { this.children.push(...items); }, setAttribute() {}, addEventListener(name, fn) { this[name] = fn; } };
    nodes.push(node); return node;
  } };
  setupSwapQuote(doc.createElement('main'), 'es', doc);
  return { amount: nodes.find(n => n.id === 'swap-amount'), button: nodes.find(n => n.tag === 'button'), status: nodes.filter(n => n.tag === 'p').at(-1) };
}
test('editing amount discards an older network response', async t => {
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const ui = fixture(); ui.amount.value = '1'; const pending = ui.button.onclick();
  assert.equal(ui.button.disabled, true);
  ui.amount.value = '2'; ui.amount.input();
  finish(Response.json({ quote: {} })); await pending;
  assert.equal(ui.status.textContent, ''); assert.equal(ui.button.disabled, false);
});
test('unconfigured provider displays unavailable, not zero or a buy button', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  const ui = fixture(); ui.amount.value = '1'; await ui.button.onclick();
  assert.match(ui.status.textContent, /no disponible/);
  assert.equal(ui.button.disabled, false);
});
test('expired or mismatched quotes are never displayed', async t => {
  const data = { executable: false, inputMint: 'So11111111111111111111111111111111111111112', outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', inAmount: '1000000000', outAmount: '1000000', expiresAt: Date.now() - 1 };
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ quote: data }));
  const ui = fixture(); ui.amount.value = '1'; await ui.button.onclick();
  assert.match(ui.status.textContent, /no disponible/);
  mock.mock.mockImplementation(async () => Response.json({ quote: { ...data, expiresAt: Date.now() + 10000, inAmount: '2' } }));
  await ui.button.onclick(); assert.match(ui.status.textContent, /no disponible/);
});
