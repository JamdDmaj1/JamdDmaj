import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildEligibilityTree, verifyEligibilityRecord } from "../lib/fair-launch-eligibility.js";
import {
  JAMDDMAJ_LOCK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  verifyFairLaunchOnDevnet
} from "../lib/fair-launch-devnet-verifier.js";
import {
  JAMDDMAJ_ONCHAIN_RULES,
  claimableLockedAmount,
  requiredLockedAmount,
  validateLiquidityUnlock,
  validateLockedAllocation,
  vestedLockedAmount
} from "../lib/fair-launch-lock-model.js";

const POLICY = "HvbiDNyHotAUYVqK3T2apCW5HEPbvWriK3hrPsPSaLKR";
const BENEFICIARY_A = "11111111111111111111111111111111";
const BENEFICIARY_B = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

test("on-chain model rounds the mandatory 85% lock upward", () => {
  assert.equal(requiredLockedAmount(100), 85n);
  assert.equal(requiredLockedAmount(101), 86n);
  assert.throws(() => validateLockedAllocation(101, 85), /85%/);
  assert.deepEqual(validateLockedAllocation(101, 86), { totalAllocation: 101n, lockedAmount: 86n });
});

test("on-chain model keeps locked tokens unavailable for the full cliff", () => {
  const cliffEndAt = 1_000 + JAMDDMAJ_ONCHAIN_RULES.cliffSeconds;
  const releaseEndAt = cliffEndAt + JAMDDMAJ_ONCHAIN_RULES.releaseSeconds;
  assert.equal(vestedLockedAmount({ lockedAmount: 850, cliffEndAt, releaseEndAt, timestamp: cliffEndAt - 1 }), 0n);
  assert.equal(vestedLockedAmount({ lockedAmount: 850, cliffEndAt, releaseEndAt, timestamp: cliffEndAt }), 0n);
  assert.equal(vestedLockedAmount({ lockedAmount: 850, cliffEndAt, releaseEndAt, timestamp: cliffEndAt + JAMDDMAJ_ONCHAIN_RULES.releaseSeconds / 2 }), 425n);
  assert.equal(claimableLockedAmount({ lockedAmount: 850, releasedAmount: 400, cliffEndAt, releaseEndAt, timestamp: releaseEndAt }), 450n);
});

test("liquidity cannot unlock before the JamdDmaj two-year floor", () => {
  assert.throws(() => validateLiquidityUnlock({ createdAt: 10, unlockAt: 10 + JAMDDMAJ_ONCHAIN_RULES.liquidityLockSeconds - 1 }), /24 months/);
  assert.equal(validateLiquidityUnlock({ createdAt: 10, unlockAt: 10 + JAMDDMAJ_ONCHAIN_RULES.liquidityLockSeconds }), 10 + JAMDDMAJ_ONCHAIN_RULES.liquidityLockSeconds);
});

test("privacy-preserving eligibility proofs bind identity, wallet and allocation", async () => {
  const records = [
    { identityCommitment: "11".repeat(32), beneficiary: BENEFICIARY_A, totalAllocation: "1000" },
    { identityCommitment: "22".repeat(32), beneficiary: BENEFICIARY_B, totalAllocation: "2000" }
  ];
  const tree = await buildEligibilityTree(POLICY, records);
  assert.equal(tree.count, 2);
  assert.equal(await verifyEligibilityRecord(POLICY, records[0], tree.root, tree.records[0].proof), true);
  assert.equal(await verifyEligibilityRecord(POLICY, { ...records[0], totalAllocation: "1001" }, tree.root, tree.records[0].proof), false);
  assert.equal(await verifyEligibilityRecord(POLICY, { ...records[0], beneficiary: BENEFICIARY_B }, tree.root, tree.records[0].proof), false);
});

test("eligibility adapter rejects duplicate people and over-cap lists", async () => {
  const duplicate = { identityCommitment: "33".repeat(32), beneficiary: BENEFICIARY_A, totalAllocation: "1000" };
  await assert.rejects(() => buildEligibilityTree(POLICY, [duplicate, duplicate]), /cannot claim more than once/);
  const tooMany = Array.from({ length: 2_001 }, (_, index) => ({
    identityCommitment: index.toString(16).padStart(64, "0").replace(/^0+$/, "1".padStart(64, "0")),
    beneficiary: BENEFICIARY_A,
    totalAllocation: "1"
  }));
  await assert.rejects(() => buildEligibilityTree(POLICY, tooMany), /first 2,000/);
});

test("Anchor program source keeps Devnet policy invariants explicit", () => {
  const source = readFileSync(new URL("../onchain/programs/jamddmaj-lock/src/lib.rs", import.meta.url), "utf8");
  assert.match(source, /const MIN_LOCK_BPS: u16 = 8_500/);
  assert.match(source, /const PROTECTED_PARTICIPANTS: u32 = 2_000/);
  assert.match(source, /const MIN_CLIFF_SECONDS: i64 = 730 \* DAY_SECONDS/);
  assert.match(source, /const MIN_LIQUIDITY_LOCK_SECONDS: i64 = 730 \* DAY_SECONDS/);
  assert.match(source, /InvalidEligibilityProof/);
  assert.match(source, /token_interface::transfer_checked/);
  assert.doesNotMatch(source, /mainnet-beta|api\.mainnet/);
});

test("public Devnet verifier decodes and enforces the on-chain policy", async () => {
  const mintBytes = new Uint8Array(82);
  new DataView(mintBytes.buffer).setBigUint64(36, 1_000_000n, true);
  mintBytes[44] = 6;
  mintBytes[45] = 1;

  const policyBytes = new Uint8Array(157);
  policyBytes.set(createHash("sha256").update("account:LaunchPolicy").digest().subarray(0, 8), 0);
  const view = new DataView(policyBytes.buffer);
  view.setUint32(112, 2_000, true);
  view.setUint32(116, 12, true);
  view.setUint16(120, 8_500, true);
  view.setBigInt64(122, BigInt(730 * 86_400), true);
  view.setBigInt64(130, BigInt(365 * 86_400), true);
  view.setBigInt64(138, BigInt(730 * 86_400), true);
  view.setBigInt64(146, BigInt(2 * 86_400), true);
  view.setUint16(155, 1, true);

  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        result: {
          value: [
            { owner: TOKEN_2022_PROGRAM_ID, data: [Buffer.from(mintBytes).toString("base64"), "base64"] },
            { owner: JAMDDMAJ_LOCK_PROGRAM_ID, data: [Buffer.from(policyBytes).toString("base64"), "base64"] }
          ]
        }
      };
    }
  });

  const result = await verifyFairLaunchOnDevnet({
    mintAddress: "11111111111111111111111111111111",
    policyAddress: JAMDDMAJ_LOCK_PROGRAM_ID,
    fetchImpl
  });
  assert.equal(result.verified, true);
  assert.equal(result.policy.minimumLockBps, 8_500);
  assert.equal(result.policy.protectedLimit, 2_000);
  assert.equal(result.mint.hasMintAuthority, false);
  assert.equal(result.mint.hasFreezeAuthority, false);
});
