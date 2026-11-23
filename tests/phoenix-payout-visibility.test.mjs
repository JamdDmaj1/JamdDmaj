import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const panel = readFileSync(new URL("../lib/wallet-trading-panel.js", import.meta.url), "utf8");
test("closed Phoenix positions offer a working payout and never inflate collateral", () => {
  const loop = panel.indexOf("for(const item of phoenixItems)");
  assert.ok(loop > 0);
  const payout = panel.indexOf("if(item.payoutReady||", loop);
  assert.ok(payout > loop, "payout branch must exist for SETTLING/PAYOUT_PENDING/CANONICAL_READY");
  assert.match(panel, /const requestPayout=/);
  assert.match(panel, /phoenixClient\.payout\(watchAddress,item\.workflowId,true\)/);
  assert.match(panel, /items\.filter\(item=>item\.hasOpenPosition!==false\)\.reduce/);
  assert.doesNotMatch(panel, /Reconciliar cierre/);
});
