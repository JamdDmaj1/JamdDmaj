import test from "node:test";
import assert from "node:assert/strict";
import { claimWebTrial, WEB_TRIAL_SCRIPT } from "../lib/trial-credits.js";
const account = "a".repeat(64);
test("web trial uses a persistent account ledger and server time, not device identity", async () => {
  const expected = { status: "active", credits: 20, startedAt: 1000, expiresAt: 605800 };
  const result = await claimWebTrial(account, async (path, commands) => {
    assert.equal(path, "pipeline");
    assert.deepEqual(commands, [["EVAL", WEB_TRIAL_SCRIPT, 1, `jamd:trial:v1:account:${account}`]]);
    return [{ result: JSON.stringify(expected) }];
  });
  assert.deepEqual(result, expected);
  assert.match(WEB_TRIAL_SCRIPT, /redis.call\("TIME"\)/);
  assert.doesNotMatch(WEB_TRIAL_SCRIPT, /"EX"|"EXPIRE"/);
  assert.ok(WEB_TRIAL_SCRIPT.indexOf("if existing then") < WEB_TRIAL_SCRIPT.indexOf('redis.call("SET"'));
});
test("invalid account identity never reaches storage", async () => {
  await assert.rejects(claimWebTrial("client-device-id", async () => assert.fail("storage called")));
});
test("web trial rejects storage failures and malformed grants", async () => {
  for (const response of [[{error:"down"}], [], [{result:"{}"}], [{result:'{"status":"active","credits":200}'}]]) {
    await assert.rejects(claimWebTrial(account, async () => response));
  }
});
