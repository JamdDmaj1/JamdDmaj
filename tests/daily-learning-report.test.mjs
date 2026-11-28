import test from 'node:test';
import assert from 'node:assert/strict';
import {formatExecutorDailyLearningMessage, formatDailyLearningHighlights} from '../api/pro-executor.js';
import {formatDailyReportMessage} from '../lib/pro-signals.js';

const outcomes = {
  wins: 3,
  tpHits: 2,
  losses: 21,
  stopLossHits: 5,
  invalidationLosses: 16,
  reversalLosses: 0,
  profitGivebacks: 0,
  topLossReasons: [{reason: 'invalidation', count: 16}, {reason: 'sl', count: 5}],
  lossExamples: [{pair: 'PIEVERSEUSDT', side: 'LONG', reason: 'invalidation'}],
  winExamples: [{pair: 'SSVUSDT', side: 'LONG', reason: 'tp'}],
  comparison: {
    winners: {samples: 3, averageScore: 12.2, averageVolumeRatio: 1.29, averageAdx: 50.4, counterMarketPercent: 33},
    losses: {samples: 5, averageScore: 12.1, averageVolumeRatio: 0.95, averageAdx: 26.7, counterMarketPercent: 0}
  }
};
const learning = {
  day: '2026-11-27',
  runs: 2377,
  liveOrders: 1,
  topRejects: [{reason: 'extreme fear blocks non-core longs', count: 316}],
  examples: [],
  outcomes,
  lesson: 'Multiple invalidations; require stronger confirmation.',
  selfImprovement: []
};

test('daily learning highlights what works, what to improve and the next tests', () => {
  const highlights = formatDailyLearningHighlights({mode: 'live'}, learning);
  assert.match(highlights.works, /3 win/);
  assert.match(highlights.works, /1\.29x/);
  assert.match(highlights.improve, /invalidations/);
  assert.match(highlights.improve, /ADX 50\.4/);
  assert.match(highlights.actions, /4h alignment \+ candle close/);
  assert.match(highlights.actions, /30 A\/B samples/);
});

test('executor daily learning message exposes actionable sections', () => {
  const message = formatExecutorDailyLearningMessage({
    mode: 'live',
    marketDirection: {label: 'BAJISTA', score: -34.6, bullishPercent: 21, bearishPercent: 67}
  }, learning);
  assert.match(message, /What works:/);
  assert.match(message, /What to improve:/);
  assert.match(message, /Next tests:/);
  assert.match(message, /AUTO will NOT|Live entries/);
});

test('scanner daily report labels weak hourly buckets and AUTO execution state', () => {
  const message = formatDailyReportMessage({
    reportDate: '2026-11-28',
    stats: {open: 0, decided: 82, winRate: 30.5},
    marketDirection: {label: 'BAJISTA', score: -34.6, bullishPercent: 21, bearishPercent: 67},
    learning: {
      ready: true, decided: 82, telegramMinScore: 12,
      strong: [{key: 'volumeBand:expanding:LONG', winRate: 87.5, samples: 8}],
      weak: [{key: 'hour:8', winRate: 0, samples: 4}],
      cooldown: []
    },
    executor: {bitgetMinScore: 12},
    executorStatus: {mode: 'dry-run', livePaused: false, openCount: 0, decisions: {executableSignals: 0, totalSignals: 4}}
  });
  assert.match(message, /What works:/);
  assert.match(message, /What to improve:/);
  assert.match(message, /Hour 8 UTC/);
  assert.match(message, /AUTO: DRY-RUN/);
  assert.match(message, /Bitget-ready 0\/4/);
  assert.match(message, /Next tests:/);
});
