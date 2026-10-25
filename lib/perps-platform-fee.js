// Versioned commercial terms, not a network fee, signing grant or payment.
// Integer USDC arithmetic only. Never multiply the fee by leverage.
export const PERPS_PLATFORM_FEE = Object.freeze({
  version:'jamddmaj-perps-margin-20bps-v1', basisPoints:20, token:'USDC', decimals:6,
  mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  recipient:'4WMnKm3KvLEHiw8tVFTynka8jBYvwekM2BpZz9iyyBjr',
  timing:'AFTER_FINALIZED_OPEN', rounding:'FLOOR', closeFeeUnits:'0',
  networkFeesIncluded:false, networkSponsorshipAvailable:false
});
export function quotePerpsPlatformFee(marginUnits){
  if(typeof marginUnits!=='string'||!/^[1-9][0-9]{0,14}$/.test(marginUnits))throw Error('INVALID_PLATFORM_FEE_MARGIN');
  const margin=BigInt(marginUnits);
  if(margin<10000000n)throw Error('MINIMUM_COLLATERAL');
  const fee=margin*20n/10000n;
  return Object.freeze({...PERPS_PLATFORM_FEE,marginUnits,feeUnits:fee.toString(),
    totalMarginAndPlatformFeeUnits:(margin+fee).toString(),requiresPriorConsent:true,
    requiresSeparatePayment:true,readyForSigning:false});
}
