// Conservative historical underlying-market reference, not an executable price
// or a guarantee that a wrapped token tracks its underlying. SOL fees excluded.
import {requireVerifiedPerpsEntryConversionHistory} from './perps-entry-conversion-history.js';
import {createClosedPerpsUsdBoundsReader,createHistoricalClosedPerpsUsdBoundsReader} from './perps-closed-usd-bounds.js';
const proofs=new WeakMap(),SCALE=100000000n;
function fail(){throw Error('PERPS_ENTRY_CONVERSION_USD_VALUATION_REQUIRED');}
function amount(v){if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(v)||BigInt(v)>18446744073709551615n)fail();return BigInt(v);}
function binding(conversions,day){
 if(!Array.isArray(conversions)||conversions.length>2000)fail();const seen=new Set();
 return JSON.stringify(conversions.map(v=>{
  requireVerifiedPerpsEntryConversionHistory(v);
  if(v.day!==day||seen.has(v.signature)||!['BTC','ETH','SOL'].includes(v.asset)||!Number.isInteger(v.collateralDecimals)||v.collateralDecimals<0||v.collateralDecimals>18)fail();seen.add(v.signature);
  for(const n of [v.spentUsdcUnits,v.receivedCollateralUnits,v.swapFeeCollateralUnits,v.nativeSwapUsdUnits])amount(n);
  return [v.walletAddress,v.signature,v.reservationId,v.slot,v.blockTime,v.asset,v.collateralDecimals,v.spentUsdcUnits,v.receivedCollateralUnits,v.swapFeeCollateralUnits,v.nativeSwapUsdUnits];
 }).sort((a,b)=>a[1].localeCompare(b[1])));
}
export function requirePerpsEntryConversionUsdValuation(value,{conversions,day}={}){
 return requireValuation(value,{conversions,day},false);
}
export function requireHistoricalPerpsEntryConversionUsdValuation(value,{conversions,day}={}){
 return requireValuation(value,{conversions,day},true);
}
function requireValuation(value,{conversions,day},historical){
 const p=proofs.get(value);if(!p||p.historical!==historical||p.bound!==binding(conversions,day)||value.day!==day)fail();
 const age=p.monotonicNow()-p.started;if(!Number.isFinite(age)||age<0||age>10000||p.now()<p.at||new Date(p.now()).toISOString().slice(0,10)!==p.observedDay)fail();return value;
}
export function createPerpsEntryConversionUsdValuationReader({fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 return createValuationReader({fetchImpl,now,monotonicNow},false);
}
// Separate capability: historical costs cannot pass today's daily-account gate.
export function createHistoricalPerpsEntryConversionUsdValuationReader({fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 return createValuationReader({fetchImpl,now,monotonicNow},true);
}
function createValuationReader({fetchImpl,now,monotonicNow},historical){
 const readBounds=(historical?createHistoricalClosedPerpsUsdBoundsReader:createClosedPerpsUsdBoundsReader)({fetchImpl,now,monotonicNow});
 return async({conversions,day})=>{
  const bound=binding(conversions,day),started=monotonicNow(),at=now();
  if(!Number.isFinite(started)||!Number.isSafeInteger(at))fail();
  const observedDay=new Date(at).toISOString().slice(0,10);
  if(historical?day>=observedDay:day!==observedDay)fail();
  const bounds=await readBounds({day,requests:conversions.flatMap(v=>[{asset:'USDC',blockTime:v.blockTime},{asset:v.asset,blockTime:v.blockTime}])});
  let total=0n;const items=[];
  for(const v of conversions){
   const minute=Math.floor(v.blockTime/60)*60,input=bounds.get('USDC:'+minute),output=bounds.get(v.asset+':'+minute);
   if(!input||!output)fail();const divisor=10n**BigInt(v.collateralDecimals)*SCALE;
   const spent=(amount(v.spentUsdcUnits)*BigInt(input.highE8)+SCALE-1n)/SCALE;
   const native=amount(v.nativeSwapUsdUnits),basis=spent>native?spent:native;
   const received=amount(v.receivedCollateralUnits)*BigInt(output.lowE8)*1000000n/divisor;
   const fee=(amount(v.swapFeeCollateralUnits)*BigInt(output.highE8)*1000000n+divisor-1n)/divisor;
   const gap=basis>received?basis-received:0n,loss=gap>fee?gap:fee;total+=loss;
   items.push(Object.freeze({signature:v.signature,reservationId:v.reservationId,asset:v.asset,spentUsdUpperUnits:spent.toString(),
    nativeSwapUsdUnits:v.nativeSwapUsdUnits,basisUsdUnits:basis.toString(),receivedUsdLowerUnits:received.toString(),feeUsdUpperUnits:fee.toString(),lossUsdUnits:loss.toString(),
    usdcUsdUpperE8:input.highE8,collateralUsdLowerE8:output.lowE8,collateralUsdUpperE8:output.highE8,
    inputBucketStart:input.start,inputTimeframeSeconds:input.timeframeSeconds,outputBucketStart:output.start,outputTimeframeSeconds:output.timeframeSeconds}));
  }
  const result=Object.freeze({stage:historical?'VALUED_HISTORICAL_JOURNALED_ENTRY_CONVERSION_RISK':'VALUED_JOURNALED_ENTRY_CONVERSION_RISK',readyForSigning:false,day,...(historical?{observedDay}:{}),entryConversionLossUsdUnits:total.toString(),
   basis:'CLOSED_USDC_AND_UNDERLYING_USD_BOUNDS_WITH_NATIVE_BASIS_AND_OUTPUT_FEE_FLOOR',usesUnderlyingMarketProxy:true,networkFeesIncluded:false,items:Object.freeze(items)});
  proofs.set(result,{bound,started,at,now,monotonicNow,historical,observedDay});return requireValuation(result,{conversions,day},historical);
 };
}
