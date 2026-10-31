// Exact, offline planning only. Never constructs or authorizes a transaction.
function units(value, decimals) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw Error('POOL_AMOUNT');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw Error('POOL_PRECISION');
  const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (result <= 0n || result > 18446744073709551615n) throw Error('POOL_AMOUNT');
  return result;
}
export function planJamdPool(intent) {
  if (intent?.token?.symbol !== 'JAMD' || intent.token.decimals !== 6 || intent.liquidityPair !== 'JAMD/USDC' || intent.liquidityBudget?.token !== 'USDC') throw Error('POOL_CONFIGURATION');
  const supply = units(intent.token.totalSupply, 6);
  const jamd = units(intent.initialPoolJamdTokens, 6);
  const usdc = units(intent.liquidityBudget.amount, 6);
  const reserve = units(intent.allocation.find(row => row.category === 'liquidity')?.tokens, 6);
  if (jamd > reserve || reserve > supply) throw Error('POOL_RESERVE');
  const price = units(intent.initialPriceUsdc, 6);
  if (jamd * price !== usdc * 1000000n) throw Error('POOL_PRICE_MISMATCH');
  return Object.freeze({
    pair: 'JAMD/USDC', jamdBaseUnits: jamd.toString(), usdcBaseUnits: usdc.toString(),
    remainingLiquidityJamdBaseUnits: (reserve - jamd).toString(),
    initialPriceUsdc: intent.initialPriceUsdc,
    fullyDilutedValueUsdc: { numerator: (supply * usdc).toString(), denominator: jamd.toString() },
    poolSupplyShare: { numerator: jamd.toString(), denominator: supply.toString() },
    networkCostsIncluded: false, executable: false, transactionAuthorized: false,
    blockers: ['JAMD_MINT_NOT_VERIFIED', 'DISTRIBUTION_VAULTS_NOT_IMPLEMENTED', 'POOL_AND_LP_LOCK_NOT_VERIFIED', 'FUNDING_AND_COST_REVIEW_REQUIRED']
  });
}
