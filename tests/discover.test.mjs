import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("public showcase is shareable, responsive and transparent about unfinished financial features", async () => {
  const [html, css, tourCss, script, sitemap, build] = await Promise.all([
    readFile(new URL("discover.html", root), "utf8"),
    readFile(new URL("discover.css", root), "utf8"),
    readFile(new URL("discover-tour.css", root), "utf8"),
    readFile(new URL("discover.js", root), "utf8"),
    readFile(new URL("sitemap.xml", root), "utf8"),
    readFile(new URL("scripts/build-web.mjs", root), "utf8")
  ]);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.jamddmaj\.com\/discover\.html">/);
  assert.match(html, /id="tourPlayer"/);
  assert.match(html, /id="tourPlay"/);
  assert.match(html, /data-i18n="futureText"/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(tourCss, /@keyframes drawChart/);
  assert.match(tourCss, /tour-scene-heading/);
  assert.match(script, /No active sale\./);
  assert.match(script, /No hay venta activa\./);
  assert.match(script, /setInterval\(\(\) => changeScene\(1\), 6000\)/);
  assert.match(script, /querySelectorAll\('a\[href="#tour"\]'\)/);
  assert.match(script, /buildTourScene\(index, copy\)/);
  assert.match(sitemap, /https:\/\/www\.jamddmaj\.com\/discover\.html/);
  assert.match(build, /"discover\.html"/);
  assert.match(build, /"discover\.css"/);
  assert.match(build, /"discover-tour\.css"/);
  assert.match(build, /"discover\.js"/);
});

test("public showcase copy has complete parity in every supported language", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("discover.html", root), "utf8"),
    readFile(new URL("discover.js", root), "utf8")
  ]);
  const htmlKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  const enLiteral = script.match(/const en = (\{[\s\S]*?\});\s*const es/)?.[1];
  const esLiteral = script.match(/const es = (\{[\s\S]*?\});\s*const localized/)?.[1];
  const localizedLiteral = script.match(/const localized = (\{[\s\S]*?\});\s*const catalogs/)?.[1];
  assert.ok(enLiteral && esLiteral && localizedLiteral);
  const en = Function(`"use strict"; return (${enLiteral});`)();
  const es = Function(`"use strict"; return (${esLiteral});`)();
  const localized = Function(`"use strict"; return (${localizedLiteral});`)();
  const catalogs = { en, es, ...localized };
  assert.deepEqual(Object.keys(catalogs).sort(), ["ar", "de", "en", "es", "fr", "it", "ja", "ko", "pt", "zh"]);
  for (const [locale, copy] of Object.entries(catalogs)) {
    for (const key of htmlKeys) assert.equal(typeof copy[key], "string", `${locale}.${key} is missing`);
  }
  assert.match(script, /document\.documentElement\.dir = locale === "ar" \? "rtl" : "ltr"/);
});
