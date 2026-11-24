import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPhoenixAutoJournal} from '../lib/phoenix-auto-journal.js';
import {createPhoenixAutoExecutor} from '../lib/phoenix-auto-executor.js';

const owner = 'a'.repeat(64);
const wallet = '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';
const workflow = 'b'.repeat(64);

function fixture() {
  const store = openPhoenixAutoJournal(join(mkdtempSync(join(tmpdir(), 'phx-auto-')), 'auto.sqlite'));
  const calls = [];
  const service = {
    async status() { return {stage: 'PHOENIX_MANUAL_STATUS', entryAvailable: true}; },
    async positions() { return {stage: 'PHOENIX_MANUAL_POSITIONS', items: []}; },
    async prepareEntry(value) {
      calls.push(['prepareEntry', value]);
      return {stage: 'PHOENIX_MANUAL_ENTRY_REVIEW', id: 'c'.repeat(64), workflowId: workflow, walletAddress: wallet, symbol: value.symbol, side: value.side};
    },
    async confirmEntry(value) {
      calls.push(['confirmEntry', value]);
      return {stage: 'PHOENIX_MANUAL_OPERATION', workflowId: workflow, state: 'OPEN'};
    },
    async prepareClose(value) {
      calls.push(['prepareClose', value]);
      return {stage: 'PHOENIX_MANUAL_CLOSE_REVIEW', id: 'd'.repeat(64), workflowId: value.workflowId, walletAddress: wallet};
    },
    async confirmClose() { return {stage: 'PHOENIX_MANUAL_OPERATION', state: 'COMPLETE'}; }
  };
  const controls = {readForOwner() { return {walletAddress: wallet, enabled: true, paused: false, settings: {positions: 1, margin: 10, leverage: 3}}; }};
  const feed = () => ({remotePaused: false, candidates: [{id: 'signal:1', pair: 'VVVUSDT', side: 'LONG', entry: 100, sl: 95, tp1: 110}]});
  return {store, service, controls, feed, calls};
}

test('automatic Phoenix cycle stores the signal, opens once and then respects the limit', async () => {
  const f = fixture();
  const executor = createPhoenixAutoExecutor({controls: f.controls, service: f.service, store: f.store, readFeed: f.feed, ownerAccountHash: owner, walletAddress: wallet});
  const first = await executor.runOnce();
  assert.equal(first.stage, 'PHOENIX_AUTO_OPEN_SENT');
  assert.equal(f.calls[0][1].automation, true);
  assert.equal(f.calls[1][1].explicitApproval, true);
  assert.equal(f.store.open().length, 1);
  const second = await executor.runOnce();
  assert.equal(second.stage, 'PHOENIX_AUTO_POSITION_LIMIT');
  f.store.dispose();
});

test('automatic Phoenix cycle closes only its own workflow at SL/TP', async () => {
  const f = fixture();
  f.store.reserve({signal: 'signal:1', symbol: 'VVV', side: 'LONG', margin: '10000000', entry: '100000000', sl: '95000000', tp1: '110000000'});
  f.store.attach('signal:1', workflow);
  f.service.positions = async () => ({stage: 'PHOENIX_MANUAL_POSITIONS', items: [{workflowId: workflow, state: 'OPEN', side: 'LONG', markPriceUsd: '90'}]});
  const executor = createPhoenixAutoExecutor({controls: f.controls, service: f.service, store: f.store, readFeed: f.feed, ownerAccountHash: owner, walletAddress: wallet});
  const result = await executor.runOnce();
  assert.equal(result.stage, 'PHOENIX_AUTO_CLOSE_SENT');
  assert.equal(f.calls.at(-1)[1].automation, true);
  assert.equal(f.store.open().length, 1);
  assert.equal(f.store.open()[0].state, 'CLOSING');
  f.store.dispose();
});

