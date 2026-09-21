import test from "node:test";
import assert from "node:assert/strict";
import { entrySourceDecision } from "../scripts/bitget-executor.mjs";

test("manual-only rejects automatic entries and partial manual markers", () => {
  for (const signal of [{}, { manualTest: true }, { executorSource: "manual-test" }, { manualTest: "true", executorSource: "manual-test" }]) {
    assert.equal(entrySourceDecision(signal, "manual-only").ok, false);
  }
});
test("manual-only accepts the executor's manual source markers", () => {
  assert.equal(entrySourceDecision({ manualTest: true, executorSource: "manual-test" }, "manual-only").ok, true);
});
test("invalid configuration fails closed", () => {
  for (const source of ["manual", "", null, "MANUAL-ONLY"]) assert.equal(entrySourceDecision({}, source).ok, false);
});
test("legacy source selection remains unchanged", () => {
  assert.equal(entrySourceDecision({}).ok, true);
});
