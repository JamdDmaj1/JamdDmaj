import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/pro-signals.js", import.meta.url), "utf8");
const start = source.indexOf("function formatMarketDirectionMessage");
const end = source.indexOf("function formatLearningBucketLine", start);
const formatter = source.slice(start, end);

test("Telegram market direction text is English", () => {
  assert.match(formatter, /Market bias:/);
  assert.match(formatter, /setup WITH market/);
  assert.match(formatter, /setup AGAINST market/);
  assert.doesNotMatch(formatter, /Direccion dominante|amplitud|A FAVOR|CONTRA MERCADO/);
});

test("Spanish labels are translated at the Telegram boundary, not stored globally", () => {
  assert.match(source, /FUERTEMENTE/);
  assert.match(source, /ALCISTA/);
  assert.match(source, /STRONGLY BULLISH/);
  assert.match(source, /STRONGLY BEARISH/);
});
