// Pure arithmetic for the consolidated portfolio total. No imports, no DOM,
// no network: every value comes from a caller that already validated it.
// A missing or invalid value is counted as missing, never as zero.

/** Sum a list of USD values, reporting how many were usable. */
export function sumUsd(values) {
  let total = 0
  let counted = 0
  let missing = 0
  for (const value of Array.isArray(values) ? values : []) {
    if (Number.isFinite(value) && value >= 0) {
      total += value
      counted += 1
    } else {
      missing += 1
    }
  }
  return { total, counted, missing }
}

/**
 * Collateral and exposure committed to open perps positions.
 * Units are six-decimal strings; malformed rows are skipped, not guessed.
 */
export function perpsCollateralUsd(positions) {
  let collateral = 0n
  let exposure = 0n
  let count = 0
  for (const position of Array.isArray(positions) ? positions : []) {
    try {
      const collateralUnits = BigInt(String(position?.collateralUsdUnits))
      const sizeUnits = BigInt(String(position?.sizeUsdUnits))
      if (collateralUnits < 0n || sizeUnits < 0n) continue
      collateral += collateralUnits
      exposure += sizeUnits
      count += 1
    } catch {
      continue
    }
  }
  return { collateralUsd: Number(collateral) / 1e6, exposureUsd: Number(exposure) / 1e6, count }
}

/**
 * Combine wallet values with the futures collateral.
 * `futures` is null when the futures side could not be read, and the total is
 * then null as well: a partial figure is never presented as the whole.
 */
export function combinedTotal(wallets, futures) {
  const base = Number.isFinite(wallets?.total) ? wallets.total : null
  const futuresUsd = futures && Number.isFinite(futures.collateralUsd) ? futures.collateralUsd : null
  if (base === null) return { totalUsd: null, complete: false, walletsUsd: null, futuresUsd }
  if (futuresUsd === null) return { totalUsd: null, complete: false, walletsUsd: base, futuresUsd: null }
  return { totalUsd: base + futuresUsd, complete: wallets.missing === 0, walletsUsd: base, futuresUsd }
}

/** Split a USD amount into locale-formatted integer and fraction text. */
export function splitUsd(value) {
  if (!Number.isFinite(value) || value < 0) return null
  const fixed = value.toFixed(2)
  const [integer, fraction] = fixed.split('.')
  return { integer, fraction, text: fixed }
}
