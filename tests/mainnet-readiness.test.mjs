import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReadiness, REQUIRED_EVIDENCE } from "../lib/mainnet-readiness.js";
import { readFile } from "node:fs/promises";

function fixture() {
  return { schemaVersion: 1, network: "solana-mainnet-beta", mainnetEnabled: true,
    requirements: Object.fromEntries(Object.entries(REQUIRED_EVIDENCE).map(([name, fields]) => [name,
      { status: "approved", ...Object.fromEntries(fields.map(key => [key,
        key === "threshold" ? 2 : key === "timelockSeconds" ? 86400 : key === "jurisdictions" ? ["test"] : "test-reference"])) }])) };
}
test("empty or omitted requirements cannot pass", () => {
  for (const input of [null, {}, { mainnetEnabled: true, requirements: {} }]) {
    assert.equal(evaluateReadiness(input).ready, false);
    assert.equal(evaluateReadiness(input).incomplete.length, 7);
  }
});
test("every mandatory requirement is checked even when removed", () => {
  for (const name of Object.keys(REQUIRED_EVIDENCE)) {
    const data = fixture(); delete data.requirements[name];
    assert.equal(evaluateReadiness(data).ready, false);
  }
});
test("completeness requires explicit switch, schema and network", () => {
  assert.equal(evaluateReadiness(fixture()).ready, true);
  for (const change of [{ mainnetEnabled: false }, { mainnetEnabled: "true" }, { schemaVersion: 2 }, { network: "solana-devnet" }]) {
    assert.equal(evaluateReadiness({ ...fixture(), ...change }).ready, false);
  }
});
test("blank and wrongly typed evidence cannot pass", () => {
  for (const [name, fields] of Object.entries(REQUIRED_EVIDENCE)) {
    for (const field of fields) {
      for (const value of [null, " ", false, {}, []]) {
        const data = fixture(); data.requirements[name][field] = value;
        assert.equal(evaluateReadiness(data).ready, false);
      }
    }
  }
  for (const [field, value] of [["threshold", 1], ["threshold", 2.5], ["timelockSeconds", 0]]) {
    const data = fixture(); data.requirements.upgradeAuthorityMultisig[field] = value;
    assert.equal(evaluateReadiness(data).ready, false);
  }
});

test("published incident response has a private contact but does not open mainnet", async () => {
  const readiness=JSON.parse(await readFile(new URL("../security/mainnet-readiness.json",import.meta.url),"utf8"));
  const policy=await readFile(new URL("../INCIDENT-RESPONSE.md",import.meta.url),"utf8");
  assert.equal(readiness.requirements.incidentResponse.status,"approved");
  assert.match(readiness.requirements.incidentResponse.securityContact,/security\/advisories\/new/);
  assert.match(policy,/No JAMD Mainnet deployment/);
  assert.equal(evaluateReadiness(readiness).ready,false);
});
