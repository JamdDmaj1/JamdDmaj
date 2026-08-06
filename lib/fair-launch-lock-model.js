export const JAMDDMAJ_ONCHAIN_RULES = Object.freeze({
  minimumLockBps: 8_500,
  protectedParticipants: 2_000,
  cliffSeconds: 730 * 86_400,
  releaseSeconds: 365 * 86_400,
  liquidityLockSeconds: 730 * 86_400,
  governanceDelaySeconds: 2 * 86_400
});

export function requiredLockedAmount(totalAllocation, minimumLockBps = JAMDDMAJ_ONCHAIN_RULES.minimumLockBps) {
  const total = toPositiveBigInt(totalAllocation, "total allocation");
  const bps = BigInt(Math.trunc(Number(minimumLockBps)));
  if (bps < 0n || bps > 10_000n) throw new RangeError("minimum lock basis points are invalid");
  return (total * bps + 9_999n) / 10_000n;
}

export function validateLockedAllocation(totalAllocation, lockedAmount) {
  const total = toPositiveBigInt(totalAllocation, "total allocation");
  const locked = toPositiveBigInt(lockedAmount, "locked amount");
  if (locked > total) throw new RangeError("locked amount exceeds allocation");
  if (locked < requiredLockedAmount(total)) throw new RangeError("at least 85% of the allocation must be locked");
  return Object.freeze({ totalAllocation: total, lockedAmount: locked });
}

export function vestedLockedAmount({ lockedAmount, cliffEndAt, releaseEndAt, timestamp }) {
  const locked = toPositiveBigInt(lockedAmount, "locked amount");
  const cliff = toInteger(cliffEndAt, "cliff end");
  const end = toInteger(releaseEndAt, "release end");
  const now = toInteger(timestamp, "timestamp");
  if (end <= cliff) throw new RangeError("release end must be after cliff");
  if (now < cliff) return 0n;
  if (now >= end) return locked;
  return locked * BigInt(now - cliff) / BigInt(end - cliff);
}

export function claimableLockedAmount(value) {
  const vested = vestedLockedAmount(value);
  const released = toNonNegativeBigInt(value.releasedAmount ?? 0, "released amount");
  if (released > vested) return 0n;
  return vested - released;
}

export function validateLiquidityUnlock({ createdAt, unlockAt }) {
  const created = toInteger(createdAt, "created at");
  const unlock = toInteger(unlockAt, "unlock at");
  if (unlock - created < JAMDDMAJ_ONCHAIN_RULES.liquidityLockSeconds) {
    throw new RangeError("liquidity must remain locked for at least 24 months");
  }
  return unlock;
}

function toPositiveBigInt(value, label) {
  const parsed = toNonNegativeBigInt(value, label);
  if (parsed === 0n) throw new RangeError(`${label} must be positive`);
  return parsed;
}

function toNonNegativeBigInt(value, label) {
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    throw new TypeError(`${label} must be an integer`);
  }
  if (parsed < 0n || parsed > 18_446_744_073_709_551_615n) throw new RangeError(`${label} is outside u64`);
  return parsed;
}

function toInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new TypeError(`${label} must be a safe integer`);
  return parsed;
}
