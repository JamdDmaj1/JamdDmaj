import test from 'node:test';
import assert from 'node:assert/strict';
import {learningBias} from '../lib/phoenix-auto-learning.js';

const now = 1_800_000_000_000;
const row = (outcome, minutesAgo) => ({symbol: 'AAVE', side: 'SHORT', outcome, updated: now - minutesAgo * 60_000});

test('learning ignores unclosed and foreign lessons', () => {
  assert.deepEqual(learningBias([], {symbol: 'AAVE', side: 'SHORT', now}), {});
  assert.deepEqual(learningBias([{...row('SL', 1), symbol: 'SOL'}], {symbol: 'AAVE', side: 'SHORT', now}), {});
  assert.deepEqual(learningBias([{...row('CLOSED', 1)}], {symbol: 'AAVE', side: 'SHORT', now}), {});
});

test('two stop-losses without a later take-profit block the pair and side', () => {
  const bias = learningBias([row('SL', 120), row('SL', 30)], {symbol: 'AAVE', side: 'SHORT', now});
  assert.equal(bias.blocked, true);
  assert.equal(bias.reason, 'repeated stop-loss');
});

test('repeated stop-losses stop blocking after twenty-four hours', () => {
  const bias = learningBias([row('SL', 60 * 26), row('SL', 60 * 25)], {symbol: 'AAVE', side: 'SHORT', now});
  assert.notEqual(bias.blocked, true);
});

test('a later take-profit clears the repeated stop-loss block', () => {
  const bias = learningBias([row('SL', 120), row('SL', 30), row('TP', 10)], {symbol: 'AAVE', side: 'SHORT', now});
  assert.notEqual(bias.blocked, true);
});

test('two take-profits without a later stop-loss extend the target by ten percent', () => {
  const bias = learningBias([row('TP', 120), row('TP', 30)], {symbol: 'AAVE', side: 'SHORT', now});
  assert.equal(bias.tpExtension, 0.1);
  const cleared = learningBias([row('TP', 120), row('TP', 30), row('SL', 5)], {symbol: 'AAVE', side: 'SHORT', now});
  assert.equal(cleared.tpExtension, undefined);
});
