export const FAIR_LAUNCH_DEFAULTS = Object.freeze({
  projectName: "JamdDmaj",
  symbol: "JDMAJ",
  purpose: "Utility token for the JamdDmaj ecosystem.",
  network: "solana-token-2022",
  totalSupply: 1_000_000_000,
  decimals: 9,
  startingPriceUsd: 0.001,
  creatorContributionUsd: 1_000,
  creatorLockPercent: 85,
  earlyHolderCount: 2_000,
  holderLockPercent: 85,
  cliffMonths: 24,
  releaseMonths: 12,
  liquidityLockMonths: 24,
  maxWalletPercent: 1,
  revokeMintAuthority: true,
  disableFreezeAuthority: true,
  immutableMetadata: true,
  multisigTimelock: true,
  auditRequired: true,
  antiSybilEligibility: true
});

export function normalizeFairLaunchDraft(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    projectName: cleanText(source.projectName, FAIR_LAUNCH_DEFAULTS.projectName, 60),
    symbol: cleanSymbol(source.symbol, FAIR_LAUNCH_DEFAULTS.symbol),
    purpose: cleanText(source.purpose, FAIR_LAUNCH_DEFAULTS.purpose, 280),
    network: source.network === "base-erc20" ? "base-erc20" : "solana-token-2022",
    totalSupply: clampNumber(source.totalSupply, 1_000_000, 1_000_000_000_000, FAIR_LAUNCH_DEFAULTS.totalSupply),
    decimals: clampInteger(source.decimals, 0, 18, FAIR_LAUNCH_DEFAULTS.decimals),
    startingPriceUsd: clampNumber(source.startingPriceUsd, 0.000000001, 1_000_000, FAIR_LAUNCH_DEFAULTS.startingPriceUsd),
    creatorContributionUsd: clampNumber(source.creatorContributionUsd, 0, 100_000_000, FAIR_LAUNCH_DEFAULTS.creatorContributionUsd),
    creatorLockPercent: clampNumber(source.creatorLockPercent, 0, 100, FAIR_LAUNCH_DEFAULTS.creatorLockPercent),
    earlyHolderCount: clampInteger(source.earlyHolderCount, 0, 100_000, FAIR_LAUNCH_DEFAULTS.earlyHolderCount),
    holderLockPercent: clampNumber(source.holderLockPercent, 0, 100, FAIR_LAUNCH_DEFAULTS.holderLockPercent),
    cliffMonths: clampInteger(source.cliffMonths, 0, 120, FAIR_LAUNCH_DEFAULTS.cliffMonths),
    releaseMonths: clampInteger(source.releaseMonths, 0, 120, FAIR_LAUNCH_DEFAULTS.releaseMonths),
    liquidityLockMonths: clampInteger(source.liquidityLockMonths, 0, 120, FAIR_LAUNCH_DEFAULTS.liquidityLockMonths),
    maxWalletPercent: clampNumber(source.maxWalletPercent, 0.01, 100, FAIR_LAUNCH_DEFAULTS.maxWalletPercent),
    revokeMintAuthority: source.revokeMintAuthority !== false,
    disableFreezeAuthority: source.disableFreezeAuthority !== false,
    immutableMetadata: source.immutableMetadata !== false,
    multisigTimelock: source.multisigTimelock !== false,
    auditRequired: source.auditRequired !== false,
    antiSybilEligibility: source.antiSybilEligibility !== false
  };
}

export function calculateFairLaunchVesting(config, month = 0) {
  const value = normalizeFairLaunchDraft(config);
  const elapsed = clampNumber(month, 0, 240, 0);
  const immediatelyLiquidPercent = 100 - value.holderLockPercent;
  let releasedLockedPercent = 0;
  if (elapsed > value.cliffMonths) {
    releasedLockedPercent = value.releaseMonths === 0
      ? value.holderLockPercent
      : value.holderLockPercent * Math.min(1, (elapsed - value.cliffMonths) / value.releaseMonths);
  }
  const liquidPercent = Math.min(100, immediatelyLiquidPercent + releasedLockedPercent);
  return {
    month: elapsed,
    liquidPercent: round(liquidPercent, 2),
    lockedPercent: round(100 - liquidPercent, 2),
    phase: elapsed <= value.cliffMonths
      ? "cliff"
      : liquidPercent >= 100
        ? "fully-unlocked"
        : "linear-release"
  };
}

export function assessFairLaunch(config) {
  const value = normalizeFairLaunchDraft(config);
  const checks = [
    check("creator-lock", value.creatorLockPercent >= 85, 15, "Creator purchases lock at least 85%."),
    check("early-holder-lock", value.earlyHolderCount >= 2_000 && value.holderLockPercent >= 85, 15, "The first 2,000 eligible holders lock at least 85%."),
    check("cliff", value.cliffMonths >= 24, 10, "Protected allocations have a cliff of at least 24 months."),
    check("gradual-release", value.releaseMonths >= 12, 5, "Unlocking is gradual after the cliff."),
    check("liquidity-lock", value.liquidityLockMonths >= 24, 15, "Liquidity receipts remain locked for at least 24 months."),
    check("mint-authority", value.revokeMintAuthority, 10, "Mint authority will be revoked after fixed supply is minted."),
    check("freeze-authority", value.disableFreezeAuthority, 8, "Freeze authority will be disabled."),
    check("immutable-metadata", value.immutableMetadata, 5, "Reviewed metadata becomes immutable."),
    check("multisig", value.multisigTimelock, 7, "Administrative actions require multisig plus timelock."),
    check("audit", value.auditRequired, 5, "Independent audit is required before mainnet."),
    check("wallet-cap", value.maxWalletPercent <= 1, 3, "Bootstrap allocation is capped at 1% per wallet."),
    check("anti-sybil", value.antiSybilEligibility, 2, "Protected early access requires eligibility beyond a wallet address.")
  ];
  const score = checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const blockers = checks.filter((item) => !item.passed && [
    "creator-lock", "early-holder-lock", "liquidity-lock", "mint-authority", "freeze-authority", "audit"
  ].includes(item.id));
  return {
    score,
    grade: score >= 95 ? "A" : score >= 85 ? "B" : score >= 70 ? "C" : "NOT READY",
    readyForAudit: blockers.length === 0 && score >= 85,
    checks,
    blockers,
    warnings: [
      "Wallet addresses are not unique people. The 2,000-holder protection needs anti-Sybil eligibility and clustering review.",
      "Token locks reduce specific rug-pull vectors but cannot guarantee price, demand, legality, or honest governance.",
      "Mainnet deployment requires legal review, independent contract audit, testnet rehearsal, and explicit owner approval."
    ]
  };
}

export function buildFairLaunchManifest(config, generatedAt = new Date().toISOString()) {
  const value = normalizeFairLaunchDraft(config);
  const assessment = assessFairLaunch(value);
  const creatorTokensAtStart = value.startingPriceUsd > 0
    ? Math.min(value.totalSupply, value.creatorContributionUsd / value.startingPriceUsd)
    : 0;
  return {
    schema: "jamddmaj-fair-launch/v1",
    simulationOnly: true,
    generatedAt,
    token: {
      name: value.projectName,
      symbol: value.symbol,
      purpose: value.purpose,
      networkTarget: value.network,
      totalSupply: value.totalSupply,
      decimals: value.decimals,
      startingPriceUsd: value.startingPriceUsd
    },
    protection: {
      creator: {
        contributionUsd: value.creatorContributionUsd,
        estimatedTokensAtStartingPrice: round(creatorTokensAtStart, 6),
        lockPercent: value.creatorLockPercent
      },
      earlyHolders: {
        protectedEligibleHolders: value.earlyHolderCount,
        lockPercent: value.holderLockPercent,
        maxWalletPercent: value.maxWalletPercent,
        antiSybilEligibility: value.antiSybilEligibility
      },
      vesting: {
        cliffMonths: value.cliffMonths,
        linearReleaseMonths: value.releaseMonths
      },
      liquidityLockMonths: value.liquidityLockMonths
    },
    authorities: {
      revokeMintAuthority: value.revokeMintAuthority,
      disableFreezeAuthority: value.disableFreezeAuthority,
      immutableMetadata: value.immutableMetadata,
      multisigTimelock: value.multisigTimelock
    },
    releaseGate: {
      auditRequired: value.auditRequired,
      explicitMainnetApprovalRequired: true,
      automaticDeployment: false
    },
    assessment
  };
}

function check(id, passed, weight, label) {
  return { id, passed: passed === true, weight, label };
}

function cleanText(value, fallback, maxLength) {
  const cleaned = String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function cleanSymbol(value, fallback) {
  const cleaned = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return cleaned || fallback;
}

function clampInteger(value, minimum, maximum, fallback) {
  return Math.round(clampNumber(value, minimum, maximum, fallback));
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}
