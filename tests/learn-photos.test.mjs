import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
test("Language visual includes real illustrative photos", () => {
  assert.match(html, /language-photo-strip/);
  assert.match(html, /learn-cafe\.jpg/);
  assert.match(html, /learn-station\.jpg/);
  assert.match(html, /learn-market\.jpg/);
  for (const file of ["learn-cafe.jpg", "learn-station.jpg", "learn-market.jpg"]) {
    assert.ok(existsSync(new URL("../" + file, import.meta.url)), file + " missing");
  }
});
