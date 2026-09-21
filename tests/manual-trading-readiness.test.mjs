import test from "node:test";
import assert from "node:assert/strict";
import { manualTradingReadiness } from "../lib/manual-trading-readiness.js";
const now = Date.parse("2026-09-21T12:00:00Z");
const valid = () => ({config:{livePaused:false}, executor:{receivedAt:new Date(now).toISOString(),ok:true,bitgetSynced:true,mode:"live",entrySource:"manual-only",manualOrderVersion:1,livePaused:false}});
test("missing diagnostics fail closed", () => {
  const result = manualTradingReadiness({}, now);
  assert.ok(result.blockers.includes("manual_only_unconfirmed"));
  assert.ok(result.blockers.includes("entries_paused_or_unknown"));
  assert.equal(result.liveOrderEnabled, false);
});
test("healthy diagnostics never enable or submit an order", () => {
  const state = valid(), before = JSON.stringify(state);
  const result = manualTradingReadiness(state, now);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.liveOrderEnabled, false);
  assert.equal(result.orderSubmitted, false);
  assert.equal(JSON.stringify(state), before);
});
test("old and future heartbeats are rejected", () => {
  for (const offset of [-120001, 1]) {
    const state = valid(); state.executor.receivedAt = new Date(now + offset).toISOString();
    assert.ok(manualTradingReadiness(state, now).blockers.includes("heartbeat_missing_or_stale"));
  }
});
test("pending intent, pause and exit protection block readiness", () => {
  const state = valid(); state.executorTest={id:"old-order"}; state.executor.livePaused=true; state.executor.exitSafetyBlockReason="protection unavailable";
  const result=manualTradingReadiness(state, now);
  for (const reason of ["pending_manual_intent","entries_paused_or_unknown","exit_safety_block"]) assert.ok(result.blockers.includes(reason));
});
