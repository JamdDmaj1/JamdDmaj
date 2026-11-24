import test from 'node:test';
import assert from 'node:assert/strict';
import {openAutomaticPhoenixPosition, closeAutomaticPhoenixPosition} from '../lib/phoenix-auto-execution.js';

const owner = 'a'.repeat(64);
const wallet = '3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T';

test('automatic Phoenix entry uses the automation gate and explicit server review', async () => {
  const calls = [];
  const service = {
    async status() { return {stage: 'PHOENIX_MANUAL_STATUS', entryAvailable: true}; },
    async prepareEntry(value) {
      calls.push(['prepare', value]);
      return {stage: 'PHOENIX_MANUAL_ENTRY_REVIEW', id: 'a'.repeat(64), workflowId: 'b'.repeat(64), walletAddress: wallet, symbol: 'VVV', side: 'LONG'};
    },
    async confirmEntry(value) { calls.push(['confirm', value]); return {stage: 'PHOENIX_MANUAL_OPERATION', state: 'OPEN'}; }
  };
  const result = await openAutomaticPhoenixPosition({service, ownerAccountHash: owner, walletAddress: wallet, symbol: 'VVV', side: 'LONG'});
  assert.equal(result.state, 'OPEN');
  assert.equal(calls[0][1].automation, true);
  assert.equal(calls[1][1].explicitApproval, true);
  assert.equal(calls[1][1].id, 'a'.repeat(64));
});

test('automatic Phoenix close is a full close through the automation gate', async () => {
  const workflowId = 'c'.repeat(64);
  const calls = [];
  const service = {
    async prepareClose(value) {
      calls.push(value);
      return {stage: 'PHOENIX_MANUAL_CLOSE_REVIEW', id: 'd'.repeat(64), walletAddress: wallet, workflowId};
    },
    async confirmClose() { return {stage: 'PHOENIX_MANUAL_OPERATION', state: 'COMPLETE'}; }
  };
  const result = await closeAutomaticPhoenixPosition({service, ownerAccountHash: owner, walletAddress: wallet, workflowId});
  assert.equal(result.state, 'COMPLETE');
  assert.equal(calls[0].automation, true);
  assert.equal(calls[0].closePercent, 100);
});
