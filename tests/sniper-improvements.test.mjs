import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sniper = readFileSync(new URL("../sniper.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../sniper.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/sniper.js", import.meta.url), "utf8");
test("Sniper 2.0 exposes contract search, sorting and auto refresh", () => {
  assert.match(sniper, /sniperPaste/);
  assert.match(sniper, /sniperSort/);
  assert.match(sniper, /sniperAuto/);
  assert.match(sniper, /Token name or contract address/);
  assert.match(script, /scheduleAutoRefresh/);
  assert.match(script, /state\.sort/);
});
test("Sniper API returns English analysis labels and coverage", () => {
  assert.match(api, /Mint authority revoked/);
  assert.match(api, /coverage:\s*\{requested:/);
  assert.doesNotMatch(api, /Emision revocada/);
  assert.doesNotMatch(api, /Sin dato de bloqueo/);
});
