export const FAIR_LAUNCH_DEFAULTS = Object.freeze({
  projectName: "JamdDmaj",
  symbol: "JDMAJ",
  purpose: "Utility token for the JamdDmaj ecosystem.",
  logoUrl: "",
  bannerUrl: "",
  websiteUrl: "https://www.jamddmaj.com/",
  xUrl: "",
  telegramUrl: "",
  discordUrl: "",
  network: "solana-token-2022",
  totalSupply: 1_000_000_000,
  decimals: 9,
  startingPriceUsd: 0.001,
  creatorContributionUsd: 1_000,
  creatorLockPercent: 85,
  earlyHolderCount: 2_000,
  holderLockPercent: 85,
  cliffMonths: 24,
  releaseMonths: 36,
  liquidityLockMonths: 24,
  maxWalletPercent: 1,
  revokeMintAuthority: true,
  disableFreezeAuthority: true,
  immutableMetadata: true,
  multisigTimelock: true,
  auditRequired: true,
  antiSybilEligibility: true
});

// These are platform rules, not creator preferences. Keep them in one shared
// policy so UI drafts, imported manifests and future API validation cannot
// silently weaken the JamdDmaj anti-rug baseline.
export const FAIR_LAUNCH_RULES = Object.freeze({
  minimumCreatorLockPercent: 85,
  minimumEarlyHolderCount: 2_000,
  minimumHolderLockPercent: 85,
  minimumCliffMonths: 24,
  minimumReleaseMonths: 36,
  minimumLiquidityLockMonths: 24,
  maximumBootstrapWalletPercent: 1
});

export function normalizeFairLaunchDraft(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    projectName: cleanText(source.projectName, FAIR_LAUNCH_DEFAULTS.projectName, 60),
    symbol: cleanSymbol(source.symbol, FAIR_LAUNCH_DEFAULTS.symbol),
    purpose: cleanText(source.purpose, FAIR_LAUNCH_DEFAULTS.purpose, 280),
    logoUrl: cleanHttpsUrl(source.logoUrl, 500),
    bannerUrl: cleanHttpsUrl(source.bannerUrl, 500),
    websiteUrl: cleanHttpsUrl(source.websiteUrl, 500),
    xUrl: cleanHttpsUrl(source.xUrl, 500),
    telegramUrl: cleanHttpsUrl(source.telegramUrl, 500),
    discordUrl: cleanHttpsUrl(source.discordUrl, 500),
    network: source.network === "base-erc20" ? "base-erc20" : "solana-token-2022",
    totalSupply: clampNumber(source.totalSupply, 1_000_000, 1_000_000_000_000, FAIR_LAUNCH_DEFAULTS.totalSupply),
    decimals: clampInteger(source.decimals, 0, 18, FAIR_LAUNCH_DEFAULTS.decimals),
    startingPriceUsd: clampNumber(source.startingPriceUsd, 0.000000001, 1_000_000, FAIR_LAUNCH_DEFAULTS.startingPriceUsd),
    creatorContributionUsd: clampNumber(source.creatorContributionUsd, 0, 100_000_000, FAIR_LAUNCH_DEFAULTS.creatorContributionUsd),
    creatorLockPercent: clampNumber(source.creatorLockPercent, FAIR_LAUNCH_RULES.minimumCreatorLockPercent, 100, FAIR_LAUNCH_DEFAULTS.creatorLockPercent),
    earlyHolderCount: clampInteger(source.earlyHolderCount, FAIR_LAUNCH_RULES.minimumEarlyHolderCount, 100_000, FAIR_LAUNCH_DEFAULTS.earlyHolderCount),
    holderLockPercent: clampNumber(source.holderLockPercent, FAIR_LAUNCH_RULES.minimumHolderLockPercent, 100, FAIR_LAUNCH_DEFAULTS.holderLockPercent),
    cliffMonths: clampInteger(source.cliffMonths, FAIR_LAUNCH_RULES.minimumCliffMonths, 120, FAIR_LAUNCH_DEFAULTS.cliffMonths),
    releaseMonths: clampInteger(source.releaseMonths, FAIR_LAUNCH_RULES.minimumReleaseMonths, 120, FAIR_LAUNCH_DEFAULTS.releaseMonths),
    liquidityLockMonths: clampInteger(source.liquidityLockMonths, FAIR_LAUNCH_RULES.minimumLiquidityLockMonths, 120, FAIR_LAUNCH_DEFAULTS.liquidityLockMonths),
    maxWalletPercent: clampNumber(source.maxWalletPercent, 0.01, FAIR_LAUNCH_RULES.maximumBootstrapWalletPercent, FAIR_LAUNCH_DEFAULTS.maxWalletPercent),
    revokeMintAuthority: true,
    disableFreezeAuthority: true,
    immutableMetadata: true,
    multisigTimelock: true,
    auditRequired: true,
    antiSybilEligibility: true
  };
}

export function calculateFairLaunchVesting(config, month = 0) {
  const value = normalizeFairLaunchDraft(config);
  const elapsed = clampNumber(month, 0, 240, 0);
  const immediatelyLiquidPercent = 100 - value.holderLockPercent;
  let releasedLockedPercent = 0;
  if (elapsed > value.cliffMonths) {
    const completedTranches = Math.min(value.releaseMonths, Math.floor(elapsed - value.cliffMonths));
    releasedLockedPercent = value.holderLockPercent * completedTranches / value.releaseMonths;
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
        : "monthly-release"
  };
}

export function assessFairLaunch(config) {
  const value = normalizeFairLaunchDraft(config);
  const checks = [
    check("creator-lock", value.creatorLockPercent >= 85, 15, "Creator purchases lock at least 85%."),
    check("early-holder-lock", value.earlyHolderCount >= 2_000 && value.holderLockPercent >= 85, 15, "The first 2,000 eligible holders lock at least 85%."),
    check("cliff", value.cliffMonths >= 24, 10, "Protected allocations have a cliff of at least 24 months."),
    check("gradual-release", value.releaseMonths >= 36, 5, "Unlocking uses 36 monthly tranches after the cliff."),
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
    schema: "jamddmaj-fair-launch/v2",
    simulationOnly: true,
    policy: {
      id: "jamddmaj-protected-launch/v1",
      mandatory: true,
      rules: FAIR_LAUNCH_RULES
    },
    generatedAt,
    token: {
      name: value.projectName,
      symbol: value.symbol,
      purpose: value.purpose,
      branding: {
        logoUrl: value.logoUrl,
        bannerUrl: value.bannerUrl
      },
      links: {
        website: value.websiteUrl,
        x: value.xUrl,
        telegram: value.telegramUrl,
        discord: value.discordUrl
      },
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
        monthlyReleaseMonths: value.releaseMonths
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
    onchainProtection: {
      cluster: "devnet",
      programId: "BZMa3Aubxg1K3yx6oSN2nCnUcSJw6t7y55yCe7nZvx9V",
      deploymentStatus: "not-deployed",
      policyVersion: 1,
      minimumLockBps: 8_500,
      protectedParticipants: 2_000,
      eligibilityProof: "sha256-merkle-v1",
      rawIdentityDataStoredOnchain: false,
      walletSignatureRequiredForDeployment: true,
      mainnetEnabled: false
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

function cleanHttpsUrl(value, maxLength) {
  const input = String(value || "").trim().slice(0, maxLength);
  if (!input) return "";
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
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
