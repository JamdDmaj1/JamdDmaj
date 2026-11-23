import test from 'node:test';
import assert from 'node:assert/strict';
import {setupAutomationPanel} from '../lib/automation-panel-simple.js';

function element(tag) {
  return {
    tag, className: '', textContent: '', value: '', disabled: false, hidden: false, type: '',
    children: [], attributes: {}, id: '', htmlFor: '', min: '', max: '', step: '', required: false, inputMode: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {},
    focus() {}
  };
}
function flatten(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.textContent) out.push(String(node.textContent));
  for (const child of node.children || []) flatten(child, out);
  return out;
}
function findButton(node, label) {
  if (node?.tag === 'button' && node.textContent === label) return node;
  for (const child of node?.children || []) { const hit = findButton(child, label); if (hit) return hit; }
  return null;
}
async function settle(check, label) {
  for (let i = 0; i < 100; i += 1) { if (check()) return; await new Promise(r => setTimeout(r, 5)); }
  throw new Error('timed out ' + label);
}
function fixture(client) {
  const doc = {createElement: element};
  const parent = element('section');
  setupAutomationPanel(parent, 'es', doc, null, {controlsClient: client});
  return {parent};
}

test('simple automation shows only balance, margin, leverage and trades at once', async () => {
  const calls = [];
  const base = {
    walletAddress: '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',
    revision: 'fcc43058-1fca-4586-9a22-f792bccfc888',
    enabled: false, paused: true,
    settings: {capital: 10, loss: 10, positions: 1, margin: 10, leverage: 3, dailyTrades: 5, stopLossPercent: null, takeProfitPercent: null, lossAction: 'disable', reductionPercent: 50}
  };
  const client = {
    async readStatus() { return {controls: base, recovery: {backupVerified: true}, executionAvailable: true, funding: {stage: 'OBSERVED_EXCLUSIVE_WALLET_FUNDS', availableUsdcUnits: '12272544'}}; },
    async save(input) { calls.push(['save', input]); return {...base, ...input, settings: input.settings, revision: 'next-revision'}; },
    async prepareActivation(input) { calls.push(['prepare', input]); return {walletAddress: base.walletAddress, revision: 'next-revision', settings: base.settings, token: 'a'.repeat(64), expiresAt: Date.now() + 30000, platformFee: {version: 'fee-v1'}}; },
    async activate(input) { calls.push(['activate', input]); return {...base, enabled: true, paused: false}; },
    async pause() { calls.push(['pause']); return base; }
  };
  const f = fixture(client);
  await settle(() => flatten(f.parent).some(text => text.includes('Balance: 12.272544')), 'balance');
  const texts = flatten(f.parent);
  assert.ok(texts.includes('Margen por trade (USDC)'));
  assert.ok(texts.includes('Apalancamiento'));
  assert.ok(texts.includes('Trades a la vez'));
  assert.ok(!texts.includes('PÃ©rdida diaria'));
  assert.ok(!texts.includes('Stop loss'));
  assert.ok(!texts.includes('Trades diarios'));
  const button = findButton(f.parent, 'Activar bot');
  assert.ok(button);
  button.onclick();
  await settle(() => flatten(f.parent).some(text => text.includes('Pulsa de nuevo')), 'confirmation');
  button.onclick();
  await settle(() => calls.some(([name]) => name === 'activate'), 'activation');
  const save = calls.find(([name]) => name === 'save')?.[1];
  assert.equal(save.settings.margin, 10);
  assert.equal(save.settings.leverage, 3);
  assert.equal(save.settings.positions, 1);
  assert.equal(save.settings.capital, 11);
  assert.equal(save.settings.loss, 11);
  assert.equal(save.settings.stopLossPercent, null);
  assert.equal(save.settings.takeProfitPercent, null);
});

