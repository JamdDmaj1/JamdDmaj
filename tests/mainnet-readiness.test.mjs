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

test("current JAMD v2 evidence is Devnet-only and cannot open mainnet", async () => {
  const evidence=JSON.parse(await readFile(new URL("../security/jamd-v2-devnet-evidence.json",import.meta.url),"utf8"));
  const readiness=JSON.parse(await readFile(new URL("../security/mainnet-readiness.json",import.meta.url),"utf8"));
  assert.equal(evidence.cluster,"devnet");
  assert.equal(evidence.mainnetAuthorized,false);
  assert.equal(evidence.token.mintAddress,"Gdvhja25md5P4B9LpX5NSD1QmS32rTwTbLwqnkEdfTdB");
  assert.equal(evidence.protection.programAddress,"FzH2QN9NFFrpwsn8xqLT83BZ7ruqmMBiwY4CU6MkLVQ4");
  assert.equal(evidence.protection.releaseTranches,36);
  assert.equal(evidence.publicVerification.eligibilityRootFrozen,false);
  assert.equal(evidence.publicVerification.distributionClosed,true);
  assert.equal(evidence.mockLiquidityLockRehearsal.status,"confirmed");
  assert.equal(evidence.mockLiquidityLockRehearsal.realLiquidity,false);
  assert.equal(evidence.mockLiquidityLockRehearsal.lockDays,731);
  assert.equal(evidence.mockLiquidityLockRehearsal.vaultBalance,"1");
  assert.equal(evidence.mockLiquidityLockRehearsal.released,false);
  assert.equal(evidence.liquidityAdversarialSimulations.status,"passed");
  assert.equal(evidence.liquidityAdversarialSimulations.sentTransactions,0);
  assert.equal(evidence.liquidityAdversarialSimulations.cases.length,4);
  assert.ok(evidence.liquidityAdversarialSimulations.cases.every(item => item.rejected === true));
  assert.equal(evidence.vestingAdversarialSimulations.status,"passed");
  assert.equal(evidence.vestingAdversarialSimulations.sentTransactions,0);
  assert.equal(evidence.vestingAdversarialSimulations.cases.length,5);
  assert.ok(evidence.vestingAdversarialSimulations.cases.every(item => item.rejected === true));
  assert.equal(evidence.vestingAdversarialSimulations.doubleClaim.status,"model-tested");
  assert.equal(readiness.requirements.devnetAdversarialRehearsal.status,"missing");
  assert.equal(evaluateReadiness(readiness).ready,false);
});

test("liquidity attack rehearsal can simulate but never transmit", async () => {
  const source=await readFile(new URL("../scripts/rehearse-devnet-liquidity-attacks.mjs",import.meta.url),"utf8");
  assert.match(source,/simulateTransaction/);
  assert.match(source,/sigVerify: false/);
  assert.doesNotMatch(source,/sendTransaction|signAndSendTransaction/);
});

test("vesting attack rehearsal can simulate but never transmit", async () => {
  const source=await readFile(new URL("../scripts/rehearse-devnet-vesting-attacks.mjs",import.meta.url),"utf8");
  assert.match(source,/simulateTransaction/);
  assert.match(source,/sigVerify: false/);
  assert.doesNotMatch(source,/sendTransaction|signAndSendTransaction/);
});

test("external review packages never impersonate approvals", async () => {
  const antiSybil=await readFile(new URL("../security/ANTI-SYBIL-PROTOCOL.md",import.meta.url),"utf8");
  const audit=await readFile(new URL("../security/INDEPENDENT-REVIEW-REQUEST.md",import.meta.url),"utf8");
  const legal=await readFile(new URL("../security/LEGAL-REVIEW-BRIEF.md",import.meta.url),"utf8");
  const governance=JSON.parse(await readFile(new URL("../security/mainnet-governance-plan.json",import.meta.url),"utf8"));
  assert.match(antiSybil,/wallet address alone is never evidence/i);
  assert.match(antiSybil,/No synthetic or invented participant/i);
  assert.match(audit,/not an audit report or approval/i);
  assert.match(legal,/not legal advice or an opinion/i);
  assert.equal(governance.status,"configuration-required");
  assert.equal(governance.operationsMultisig.address,null);
  assert.equal(governance.mainnetAuthorized,false);
});
