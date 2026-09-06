import {
  JAMDDMAJ_LAUNCH_FEE_LAMPORTS,
  JAMDDMAJ_PLATFORM_TREASURY,
  deriveProtectionAddresses
} from "./solana-devnet-token.js";

import { decodeToken2022Mint, decodeLaunchPolicy, decodeCreatorVesting, decodeToken2022Account, normalizePublicKey } from "./solana-account-codecs.js";
export { decodeToken2022Mint, decodeLaunchPolicy, decodeCreatorVesting, decodeToken2022Account, normalizePublicKey } from "./solana-account-codecs.js";

export const JAMDDMAJ_LOCK_PROGRAM_ID = "BZMa3Aubxg1K3yx6oSN2nCnUcSJw6t7y55yCe7nZvx9V";
export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export const DEVNET_POLICY_FLOORS = Object.freeze({
  minimumLockBps: 8_500,
  protectedParticipants: 2_000,
  cliffSeconds: 731 * 86_400,
  releaseSeconds: 1_096 * 86_400,
  liquidityLockSeconds: 731 * 86_400,
  governanceDelaySeconds: 2 * 86_400
});

const LEGACY_DEVNET_POLICY = Object.freeze({
  cliffSeconds: 730 * 86_400,
  releaseSeconds: 365 * 86_400,
  liquidityLockSeconds: 730 * 86_400
});

export async function verifyFairLaunchOnDevnet({ mintAddress, policyAddress, fetchImpl = globalThis.fetch } = {}) {
  const mint = normalizePublicKey(mintAddress, "mint");
  const policy = normalizePublicKey(policyAddress, "policy");
  if (typeof fetchImpl !== "function") throw new Error("Devnet verification is unavailable in this browser.");

  const response = await fetchImpl(SOLANA_DEVNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [[mint, policy], { commitment: "confirmed", encoding: "base64" }]
    })
  });
  if (!response?.ok) throw new Error(`Devnet RPC returned HTTP ${response?.status || "error"}.`);
  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error.message || "Devnet RPC rejected the request."));
  const [mintAccount, policyAccount] = payload?.result?.value || [];
  if (!mintAccount) throw new Error("The Token-2022 mint does not exist on Devnet.");
  if (!policyAccount) throw new Error("The JamdDmaj protection policy does not exist on Devnet.");

  const mintState = decodeToken2022Mint(mintAccount, mint);
  const policyState = await decodeLaunchPolicy(policyAccount, policy);
  const protectionAddresses = await deriveProtectionAddresses(mint, policyState.authority);
  if (String(protectionAddresses.policyAddress) !== policy) {
    throw new Error("The policy address is not the canonical JamdDmaj PDA for this mint.");
  }
  const protectionPayload = await readAccounts(
    [String(protectionAddresses.creatorVestingAddress), String(protectionAddresses.creatorVaultAddress)],
    fetchImpl,
    2
  );
  const [vestingAccount, vaultAccount] = protectionPayload;
  const creatorVesting = vestingAccount
    ? await decodeCreatorVesting(vestingAccount, String(protectionAddresses.creatorVestingAddress))
    : null;
  const creatorVault = vaultAccount
    ? decodeToken2022Account(vaultAccount, String(protectionAddresses.creatorVaultAddress))
    : null;
  const requiredCreatorLock = creatorVesting
    ? divideRoundUp(creatorVesting.totalAllocation * BigInt(policyState.minimumLockBps), 10_000n)
    : 0n;
  const legacySchedule = policyState.version === 1
    && policyState.cliffSeconds >= LEGACY_DEVNET_POLICY.cliffSeconds
    && policyState.releaseSeconds >= LEGACY_DEVNET_POLICY.releaseSeconds
    && policyState.liquidityLockSeconds >= LEGACY_DEVNET_POLICY.liquidityLockSeconds;
  const currentSchedule = policyState.version >= 2
    && policyState.cliffSeconds >= DEVNET_POLICY_FLOORS.cliffSeconds
    && policyState.releaseSeconds >= DEVNET_POLICY_FLOORS.releaseSeconds
    && policyState.liquidityLockSeconds >= DEVNET_POLICY_FLOORS.liquidityLockSeconds;
  const checks = [
    check("cluster", true, "Solana Devnet"),
    check("token-program", mintState.owner === TOKEN_2022_PROGRAM_ID, "Mint owned by Token-2022"),
    check("mint-initialized", mintState.initialized, "Mint initialized"),
    check("mint-authority", !mintState.hasMintAuthority, "Mint authority revoked"),
    check("freeze-authority", !mintState.hasFreezeAuthority, "Freeze authority disabled"),
    check("policy-program", policyState.owner === JAMDDMAJ_LOCK_PROGRAM_ID, "Policy owned by the JamdDmaj lock program"),
    check("policy-mint", policyState.tokenMint === mint, "Policy bound to this mint"),
    check("minimum-lock", policyState.minimumLockBps >= DEVNET_POLICY_FLOORS.minimumLockBps, "At least 85% locked"),
    check("participants", policyState.protectedLimit >= DEVNET_POLICY_FLOORS.protectedParticipants, "At least 2,000 protected eligibility slots"),
    check("eligibility-root", policyState.eligibilityRootFrozen, "Early-participant eligibility list sealed"),
    check("creator-vesting", Boolean(creatorVesting)
      && creatorVesting.owner === JAMDDMAJ_LOCK_PROGRAM_ID
      && creatorVesting.policy === policy
      && creatorVesting.mint === mint
      && creatorVesting.kind === 1
      && creatorVesting.lockedAmount >= requiredCreatorLock,
    "Creator vesting account enforces the 85% minimum"),
    check("creator-vault", Boolean(creatorVault)
      && creatorVault.owner === TOKEN_2022_PROGRAM_ID
      && creatorVault.mint === mint
      && creatorVesting
      && creatorVault.authority === creatorVesting.address
      && creatorVault.amount >= creatorVesting.lockedAmount - creatorVesting.releasedAmount,
    "Creator tokens are held by the on-chain vault"),
    check(currentSchedule ? "cliff" : "cliff-v1", currentSchedule || legacySchedule, currentSchedule ? "Conservative 24-month cliff" : "Legacy Devnet 730-day cliff"),
    check(currentSchedule ? "release" : "release-v1", currentSchedule || legacySchedule, currentSchedule ? "36 monthly release tranches" : "Legacy Devnet 365-day linear release"),
    check(currentSchedule ? "liquidity" : "liquidity-v1", currentSchedule || legacySchedule, currentSchedule ? "Conservative 24-month liquidity lock" : "Legacy Devnet 730-day liquidity lock"),
    check("timelock", policyState.governanceDelaySeconds >= DEVNET_POLICY_FLOORS.governanceDelaySeconds, "Governance delay enabled"),
    check("platform-fee", policyState.platformTreasury === JAMDDMAJ_PLATFORM_TREASURY
      && policyState.launchFeeLamports === JAMDDMAJ_LAUNCH_FEE_LAMPORTS,
    "Platform fee bound to the public JamdDmaj treasury")
  ];
  return {
    cluster: "devnet",
    rpcUrl: SOLANA_DEVNET_RPC,
    programId: JAMDDMAJ_LOCK_PROGRAM_ID,
    mintAddress: mint,
    policyAddress: policy,
    verified: checks.every((item) => item.passed),
    checkedAt: new Date().toISOString(),
    checks,
    mint: mintState,
    policy: policyState,
    creatorVesting,
    creatorVault,
    disclaimer: "Devnet verification is technical evidence, not an audit, legal approval, or promise of value."
  };
}

function check(id, passed, label) {
  return { id, passed: passed === true, label };
}

async function readAccounts(addresses, fetchImpl, id) {
  const response = await fetchImpl(SOLANA_DEVNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "getMultipleAccounts",
      params: [addresses, { commitment: "confirmed", encoding: "base64" }]
    })
  });
  if (!response?.ok) throw new Error(`Devnet RPC returned HTTP ${response?.status || "error"}.`);
  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error.message || "Devnet RPC rejected the request."));
  return payload?.result?.value || [];
}

function divideRoundUp(value, divisor) {
  return (value + divisor - 1n) / divisor;
}
