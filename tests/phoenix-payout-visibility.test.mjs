import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const panel = readFileSync(new URL("../lib/wallet-trading-panel.js", import.meta.url), "utf8");
test("closed Phoenix positions with pending payout stay visible", () => {
  const loop = panel.indexOf("for(const item of phoenixItems)");
  assert.ok(loop > 0);
  const payout = panel.indexOf("if(item.payoutReady)", loop);
  const stale = panel.indexOf("if(item.hasOpenPosition===false)", loop);
  assert.ok(payout > loop, "payout branch must exist");
  assert.ok(stale > payout, "stale-position skip must run after the payout branch");
});
