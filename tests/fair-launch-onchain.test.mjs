import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { address, getAddressEncoder } from "@solana/kit";

import { buildEligibilityTree, verifyEligibilityRecord } from "../lib/fair-launch-eligibility.js";
import {
  JAMDDMAJ_LOCK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  verifyFairLaunchOnDevnet
} from "../lib/fair-launch-devnet-verifier.js";
import {
  JAMDDMAJ_LAUNCH_FEE_LAMPORTS,
  JAMDDMAJ_PLATFORM_TREASURY,
  deriveProtectionAddresses,
  getInitializeCreatorVestingInstruction,
  getInitializePolicyInstruction
} from "../lib/solana-devnet-token.js";
import {
  JAMDDMAJ_ONCHAIN_RULES,
  claimableLockedAmount,
  requiredLockedAmount,
  validateLiquidityUnlock,
  validateLockedAllocation,
  vestedLockedAmount
} from "../lib/fair-launch-lock-model.js";

const POLICY = "BZMa3Aubxg1K3yx6oSN2nCnUcSJw6t7y55yCe7nZvx9V";
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
  assert.equal(vestedLockedAmount({ lockedAmount: 850, cliffEndAt, releaseEndAt, timestamp: cliffEndAt + JAMDDMAJ_ONCHAIN_RULES.releaseSeconds / 36 - 1 }), 0n);
  assert.equal(vestedLockedAmount({ lockedAmount: 850, cliffEndAt, releaseEndAt, timestamp: cliffEndAt + JAMDDMAJ_ONCHAIN_RULES.releaseSeconds / 36 }), 23n);
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
  assert.match(source, /const MIN_CLIFF_SECONDS: i64 = 731 \* DAY_SECONDS/);
  assert.match(source, /const MIN_RELEASE_SECONDS: i64 = 1_096 \* DAY_SECONDS/);
  assert.match(source, /const RELEASE_TRANCHES: u128 = 36/);
  assert.match(source, /const MIN_LIQUIDITY_LOCK_SECONDS: i64 = 731 \* DAY_SECONDS/);
  assert.match(source, /policy\.version = 2/);
  assert.match(source, /InvalidEligibilityProof/);
  assert.match(source, /token_interface::transfer_checked/);
  assert.match(source, /pub fn seal_eligibility_root/);
  assert.match(source, /eligibility_root_frozen/);
  assert.match(source, /PLATFORM_LAUNCH_FEE_LAMPORTS: u64 = 100_000_000/);
  assert.match(source, /4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr/);
  assert.match(source, /system_program::transfer/);
  assert.match(source, /seeds = \[b"vault", vesting\.key\(\)\.as_ref\(\)\]/);
  assert.match(source, /bump = vesting\.vault_bump/);
  assert.match(source, /seeds = \[b"liquidity-vault", liquidity_lock\.key\(\)\.as_ref\(\)\]/);
  assert.match(source, /bump = liquidity_lock\.vault_bump/);
  assert.doesNotMatch(source, /mainnet-beta|api\.mainnet/);
});

test("mainnet gate remains closed without independent evidence", () => {
  const readiness = JSON.parse(readFileSync(new URL("../security/mainnet-readiness.json", import.meta.url), "utf8"));
  assert.equal(readiness.mainnetEnabled, false);
  assert.ok(Object.values(readiness.requirements).some(requirement => requirement.status !== "approved"));
  assert.notEqual(readiness.requirements.independentAudit.status,"approved");
  assert.notEqual(readiness.requirements.legalReview.status,"approved");
});

test("protected Devnet creation uses canonical PDAs and Anchor instructions", async () => {
  const mint = BENEFICIARY_B;
  const owner = BENEFICIARY_A;
  const addresses = await deriveProtectionAddresses(mint, owner);
  const policyInstruction = await getInitializePolicyInstruction({
    ownerAddress: address(owner),
    mintAddress: address(mint),
    policyAddress: addresses.policyAddress
  });
  const vestingInstruction = await getInitializeCreatorVestingInstruction({
    ownerAddress: address(owner),
    mintAddress: address(mint),
    sourceAddress: address(owner),
    policyAddress: addresses.policyAddress,
    vestingAddress: addresses.creatorVestingAddress,
    vaultAddress: addresses.creatorVaultAddress,
    totalAllocation: 1_000n,
    lockedAmount: 850n
  });
  assert.equal(policyInstruction.programAddress, JAMDDMAJ_LOCK_PROGRAM_ID);
  assert.equal(policyInstruction.data.length, 48);
  assert.equal(vestingInstruction.data.length, 24);
  assert.equal(vestingInstruction.accounts.length, 11);
  assert.deepEqual(
    Buffer.from(policyInstruction.data.subarray(0, 8)),
    createHash("sha256").update("global:initialize_policy").digest().subarray(0, 8)
  );
  assert.deepEqual(
    Buffer.from(vestingInstruction.data.subarray(0, 8)),
    createHash("sha256").update("global:initialize_creator_vesting").digest().subarray(0, 8)
  );
});

test("public Devnet verifier decodes and enforces the on-chain policy", async () => {
  const mintAddress = "11111111111111111111111111111111";
  const protection = await deriveProtectionAddresses(mintAddress, mintAddress);
  const addressEncoder = getAddressEncoder();
  const mintBytes = new Uint8Array(82);
  new DataView(mintBytes.buffer).setBigUint64(36, 1_000_000n, true);
  mintBytes[44] = 6;
  mintBytes[45] = 1;

  const policyBytes = new Uint8Array(198);
  policyBytes.set(createHash("sha256").update("account:LaunchPolicy").digest().subarray(0, 8), 0);
  policyBytes.set(addressEncoder.encode(address(mintAddress)), 8);
  policyBytes.set(addressEncoder.encode(address(mintAddress)), 40);
  policyBytes[72] = 1;
  const view = new DataView(policyBytes.buffer);
  view.setUint32(112, 2_000, true);
  view.setUint32(116, 12, true);
  view.setUint16(120, 8_500, true);
  view.setBigInt64(122, BigInt(731 * 86_400), true);
  view.setBigInt64(130, BigInt(1_096 * 86_400), true);
  view.setBigInt64(138, BigInt(731 * 86_400), true);
  view.setBigInt64(146, BigInt(2 * 86_400), true);
  policyBytes.set(addressEncoder.encode(address(JAMDDMAJ_PLATFORM_TREASURY)), 154);
  view.setBigUint64(186, JAMDDMAJ_LAUNCH_FEE_LAMPORTS, true);
  policyBytes[194] = 1;
  view.setUint16(196, 2, true);

  const vestingBytes = new Uint8Array(187);
  vestingBytes.set(createHash("sha256").update("account:VestingVault").digest().subarray(0, 8), 0);
  vestingBytes.set(addressEncoder.encode(protection.policyAddress), 8);
  vestingBytes.set(addressEncoder.encode(address(mintAddress)), 40);
  vestingBytes.set(addressEncoder.encode(address(mintAddress)), 72);
  const vestingView = new DataView(vestingBytes.buffer);
  vestingView.setBigUint64(104, 1_000n, true);
  vestingView.setBigUint64(112, 850n, true);
  vestingBytes[184] = 1;

  const vaultBytes = new Uint8Array(165);
  vaultBytes.set(addressEncoder.encode(address(mintAddress)), 0);
  vaultBytes.set(addressEncoder.encode(protection.creatorVestingAddress), 32);
  new DataView(vaultBytes.buffer).setBigUint64(64, 850n, true);

  let requestCount = 0;
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      requestCount += 1;
      return {
        result: {
          value: requestCount === 1 ? [
            { owner: TOKEN_2022_PROGRAM_ID, data: [Buffer.from(mintBytes).toString("base64"), "base64"] },
            { owner: JAMDDMAJ_LOCK_PROGRAM_ID, data: [Buffer.from(policyBytes).toString("base64"), "base64"] }
          ] : [
            { owner: JAMDDMAJ_LOCK_PROGRAM_ID, data: [Buffer.from(vestingBytes).toString("base64"), "base64"] },
            { owner: TOKEN_2022_PROGRAM_ID, data: [Buffer.from(vaultBytes).toString("base64"), "base64"] }
          ]
        }
      };
    }
  });

  const result = await verifyFairLaunchOnDevnet({
    mintAddress,
    policyAddress: String(protection.policyAddress),
    fetchImpl
  });
  assert.equal(result.verified, true);
  assert.equal(result.policy.minimumLockBps, 8_500);
  assert.equal(result.policy.protectedLimit, 2_000);
  assert.equal(result.policy.platformTreasury, JAMDDMAJ_PLATFORM_TREASURY);
  assert.equal(result.policy.launchFeeLamports, JAMDDMAJ_LAUNCH_FEE_LAMPORTS);
  assert.equal(result.mint.hasMintAuthority, false);
  assert.equal(result.mint.hasFreezeAuthority, false);
});
