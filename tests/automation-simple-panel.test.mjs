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
  for (let i = 0; i < 400; i += 1) { if (check()) return; await new Promise(r => setTimeout(r, 5)); }
  throw new Error('timed out ' + label);
}
function fixture(client) {
  const doc = {createElement: element};
  const parent = element('section');
  setupAutomationPanel(parent, 'es', doc, null, {controlsClient: client});
  return {parent};
}

test('app session without bot controls offers the web Google account switch', async () => {
  globalThis.Capacitor = {isNativePlatform: () => true};
  try {
    const client = {async readStatus() { throw Object.assign(Error('controls-unavailable'), {code: 'controls-unavailable'}); }};
    const f = fixture(client);
    await settle(() => flatten(f.parent).some(text => text.includes('Esta sesión de la app')), 'account switch');
    const switchButton = findButton(f.parent, 'Usar la misma cuenta de Google que en la web');
    assert.ok(switchButton);
    assert.equal(switchButton.hidden, false);
  } finally { delete globalThis.Capacitor; }
});
test('waits for the native Google session before reading bot controls', async () => {
  let resolveReady; const ready = new Promise(resolve => { resolveReady = resolve; });
  let reads = 0;
  globalThis.JamdTrial = {ready};
  try {
    const client = { async readStatus() { reads += 1; return {controls: null, recovery: null, executionAvailable: false, funding: null}; } };
    fixture(client);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(reads, 0);
    resolveReady();
    await settle(() => reads === 1, 'session-ready read');
  } finally { delete globalThis.JamdTrial; }
});
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

test('simple automation retries once after a stale controls revision', async () => {
  const calls = [];
  let reads = 0;
  const old = {
    walletAddress: '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',
    revision: 'old-revision',
    enabled: false, paused: true,
    settings: {capital: 11, loss: 11, positions: 1, margin: 10, leverage: 3, dailyTrades: 5, stopLossPercent: null, takeProfitPercent: null, lossAction: 'disable', reductionPercent: 50}
  };
  const fresh = {...old, revision: 'fresh-revision'};
  const client = {
    async readStatus() { reads += 1; return {controls: reads === 1 ? old : fresh, recovery: {backupVerified: true}, executionAvailable: true, funding: {stage: 'OBSERVED_EXCLUSIVE_WALLET_FUNDS', availableUsdcUnits: '12272544'}}; },
    async save(input) { calls.push(['save', input]); return {...fresh, ...input, settings: input.settings, revision: 'saved-revision'}; },
    async prepareActivation(input) {
      calls.push(['prepare', input]);
      if (input.expectedRevision === 'old-revision') throw Object.assign(new Error('stale'), {code: 'settings-changed'});
      return {walletAddress: old.walletAddress, revision: input.expectedRevision, settings: old.settings, token: 'a'.repeat(64), expiresAt: Date.now() + 30000};
    },
    async activate(input) { calls.push(['activate', input]); return {...fresh, enabled: true, paused: false}; },
    async pause() { calls.push(['pause']); return fresh; }
  };
  const f = fixture(client);
  await settle(() => flatten(f.parent).some(text => text.includes('Balance: 12.272544')), 'balance');
  const button = findButton(f.parent, 'Activar bot');
  button.onclick();
  await settle(() => flatten(f.parent).some(text => text.includes('Pulsa de nuevo')), 'confirmation');
  button.onclick();
  await settle(() => calls.some(([name]) => name === 'activate'), 'activation retry');
  assert.equal(calls.filter(([name]) => name === 'prepare').length, 2);
  assert.ok(reads >= 2);
  assert.ok(flatten(f.parent).some(text => text.includes('Bot activo')));
});


test('simple automation retries a transient controls-unavailable activation', async () => {
  const calls = []; let reads = 0; let activations = 0;
  const base = {
    walletAddress: '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T', revision: 'revision-1', enabled: false, paused: true,
    settings: {capital: 11, loss: 11, positions: 1, margin: 10, leverage: 3, dailyTrades: 5, stopLossPercent: null, takeProfitPercent: null, lossAction: 'disable', reductionPercent: 50}
  };
  const client = {
    async readStatus() { reads += 1; return {controls: base, recovery: {backupVerified: true}, executionAvailable: true, funding: {stage: 'OBSERVED_EXCLUSIVE_WALLET_FUNDS', availableUsdcUnits: '12272544'}}; },
    async save(input) { calls.push(['save', input]); return {...base, ...input, revision: 'revision-2'}; },
    async prepareActivation(input) { calls.push(['prepare', input]); return {walletAddress: base.walletAddress, revision: input.expectedRevision, settings: base.settings, token: 'b'.repeat(64), expiresAt: Date.now() + 30000}; },
    async activate(input) { activations += 1; calls.push(['activate', input]); if (activations === 1) throw Object.assign(new Error('controls-unavailable'), {code: 'controls-unavailable'}); return {...base, enabled: true, paused: false, revision: 'revision-3'}; },
    async pause() { calls.push(['pause']); return base; }
  };
  const f = fixture(client);
  await settle(() => flatten(f.parent).some(text => text.includes('Balance: 12.272544')), 'balance');
  const button = findButton(f.parent, 'Activar bot');
  button.onclick();
  await settle(() => flatten(f.parent).some(text => text.includes('Pulsa de nuevo')), 'confirmation');
  button.onclick();
  await new Promise(resolve => setTimeout(resolve, 2600));
  assert.equal(activations, 2);
  assert.equal(calls.filter(([name]) => name === 'prepare').length, 2);
  assert.ok(reads >= 2);
  assert.ok(flatten(f.parent).some(text => text.includes('Bot activo')));
});
