import test from "node:test";
import assert from "node:assert/strict";
import { selectDiverseSignals } from "../lib/pro-signals.js";

const config = { maxSignalsPerRun: 3, cooldownMinutes: 15, lossCooldownHours: 6 };
const candidate = () => ({
  id: "BTW-SHORT-new",
  pair: "BTWUSDT",
  baseSymbol: "BTW",
  side: "SHORT",
  category: "Crypto",
  telegramEligible: true,
  createdAt: new Date().toISOString()
});

test("a stopped pair is blocked during the loss cooldown", () => {
  const history = [{
    pair: "BTWUSDT",
    status: "INVALIDATED",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    closedAt: new Date(Date.now() - 3600000).toISOString()
  }];
  assert.deepEqual(selectDiverseSignals([candidate()], [], history, config), []);
});

test("a stopped pair can return after the loss cooldown", () => {
  const history = [{
    pair: "BTWUSDT",
    status: "INVALIDATED",
    createdAt: new Date(Date.now() - 9 * 3600000).toISOString(),
    closedAt: new Date(Date.now() - 8 * 3600000).toISOString()
  }];
  assert.equal(selectDiverseSignals([candidate()], [], history, config).length, 1);
});

test("a fast reversal can bypass the loss cooldown", () => {
  const history = [{
    pair: "BTWUSDT",
    status: "INVALIDATED",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    closedAt: new Date(Date.now() - 3600000).toISOString()
  }];
  const result = selectDiverseSignals([candidate()], [], history, config, new Set(["BTW"]));
  assert.equal(result.length, 1);
});
