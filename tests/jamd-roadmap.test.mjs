import test from "node:test";
import assert from "node:assert/strict";
import { roadmapCopy, allocationPercentages } from "../jamd-roadmap.js";
import { readFile } from "node:fs/promises";
test("public Jamd approved allocation has complete copy in all ten languages", () => {
  assert.deepEqual(Object.keys(roadmapCopy).sort(), ["ar","de","en","es","fr","it","ja","ko","pt","zh"]);
  for (const copy of Object.values(roadmapCopy)) {
    assert.equal(copy.length, 10);
    assert.ok(copy.every(value => typeof value === "string" && value.trim()));
  }
  assert.equal(allocationPercentages.reduce((a,b) => a+b, 0), 100);
  assert.equal((40+25+15)*0.9+15, 87);
});
test("roadmap separates approved tokenomics from unfinished mainnet work", async () => {
  const html = await readFile(new URL("../discover.html", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build-web.mjs", import.meta.url), "utf8");
  assert.match(html, /id="jamd-roadmap"/);
  assert.match(build, /"jamd-roadmap.js"/);
  assert.match(roadmapCopy.es[1], /Aprobado para preparación/);
  assert.match(roadmapCopy.es[8], /auditoría independiente/);
  assert.match(roadmapCopy.en[8], /independent audit/);
});
