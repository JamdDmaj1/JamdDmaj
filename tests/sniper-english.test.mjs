import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sniper = readFileSync(new URL("../sniper.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../sniper.js", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../sniper-i18n.js", import.meta.url), "utf8");
test("Sniper loads English localization", () => {
  assert.match(sniper, /sniper-i18n\.js/);
  assert.match(i18n, /New tokens under the radar/);
  assert.match(i18n, /Connect your wallet to view it/);
});
test("Sniper does not borrow a different app wallet for My tokens", () => {
  assert.doesNotMatch(script, /jamd-wallet-trading-state/);
  assert.match(script, /jamd-sniper-wallet/);
});
test("Sniper Radar and wallet prompts stay in English", () => {
  assert.doesNotMatch(script, /Buscar "scam" en X|Grafico|Nube:|Vigilar|Liquidez retirada|Precio:|en seguimiento|Activar notificaciones|Direccion de wallet|No se pudo comprar/);
  assert.match(script, /Search "scam" on X/);
  assert.match(script, /Cloud: /);
  assert.match(script, /Watching/);
});
