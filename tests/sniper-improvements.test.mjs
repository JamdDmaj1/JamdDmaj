import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sniper = readFileSync(new URL("../sniper.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../sniper.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/sniper.js", import.meta.url), "utf8");
const why = readFileSync(new URL("../api/sniper-why.js", import.meta.url), "utf8");
const audit = readFileSync(new URL("../api/sniper-audit.js", import.meta.url), "utf8");
test("Sniper 2.0 exposes contract search, sorting and auto refresh", () => {
  assert.match(sniper, /sniperPaste/);
  assert.match(sniper, /sniperSort/);
  assert.match(sniper, /sniperAuto/);
  assert.match(sniper, /Token name or contract address/);
  assert.match(script, /scheduleAutoRefresh/);
  assert.match(script, /state\.sort/);
});
test("Sniper tabs route My tokens and History explicitly", () => {
  assert.match(script, /tab === 'mine'/);
  assert.match(script, /tab === 'hist'/);
  assert.match(script, /renderHoldings/);
  assert.match(script, /renderHistory/);
  assert.match(script, /const seq = \+\+state\.seq/);
  assert.match(script, /Clear favorites/);
});
test("Sniper API returns English analysis labels and coverage", () => {
  assert.match(api, /Mint authority revoked/);
  assert.match(api, /coverage:\s*\{requested:/);
  assert.match(api, /const TAB_TTL = 60000/);
  assert.match(api, /const fresh = url\.searchParams\.get\('fresh'\) === '1'/);
  assert.doesNotMatch(api, /Emision revocada/);
  assert.doesNotMatch(api, /Sin dato de bloqueo/);
});
test("Sniper secondary APIs return English text", () => {
  assert.match(why, /Price .* in 5 minutes/);
  assert.doesNotMatch(why, /Precio /);
  assert.match(audit, /Website does not respond/);
  assert.doesNotMatch(audit, /Antiguedad/);
});
