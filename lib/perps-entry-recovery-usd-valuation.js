// Historical conservative reference loss only, not an executable wrapped-token
// quote. Network fees are valued separately and cannot be counted here again.
import {requireVerifiedPerpsEntryRecoveryHistory} from './perps-entry-recovery-history.js';
import {createClosedPerpsUsdBoundsReader} from './perps-closed-usd-bounds.js';
const proofs=new WeakMap(),SCALE=100000000n;
function fail(){throw Error('PERPS_ENTRY_RECOVERY_USD_VALUATION_REQUIRED');}
function amount(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value)||BigInt(value)>18446744073709551615n)fail();return BigInt(value);}
function binding(recoveries,day){
 if(!Array.isArray(recoveries)||recoveries.length>2000)fail();const seen=new Set();
 return JSON.stringify(recoveries.map(v=>{
  requireVerifiedPerpsEntryRecoveryHistory(v);
  if(v.day!==day||seen.has(v.signature)||!['BTC','ETH','SOL'].includes(v.asset)||!Number.isInteger(v.collateralDecimals)||v.collateralDecimals<0||v.collateralDecimals>18)fail();seen.add(v.signature);
  for(const field of ['convertedCollateralUnits','receivedUsdcUnits','swapFeeUsdcUnits'])amount(v[field]);
  return [v.walletAddress,v.signature,v.reservationId,v.slot,v.blockTime,v.asset,v.collateralDecimals,v.convertedCollateralUnits,v.receivedUsdcUnits,v.swapFeeUsdcUnits];
 }).sort((a,b)=>a[1].localeCompare(b[1])));
}
export function requirePerpsEntryRecoveryUsdValuation(value,{recoveries,day}={}){
 const p=proofs.get(value);if(!p||p.bound!==binding(recoveries,day)||value.day!==day)fail();
 const age=p.monotonicNow()-p.started;if(!Number.isFinite(age)||age<0||age>10000||p.now()<p.at||new Date(p.now()).toISOString().slice(0,10)!==day)fail();return value;
}
export function createPerpsEntryRecoveryUsdValuationReader({fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const readBounds=createClosedPerpsUsdBoundsReader({fetchImpl,now,monotonicNow});
 return async({recoveries,day})=>{
  const bound=binding(recoveries,day),started=monotonicNow(),at=now();
  if(!Number.isFinite(started)||!Number.isSafeInteger(at)||day!==new Date(at).toISOString().slice(0,10))fail();
  const bounds=await readBounds({day,requests:recoveries.flatMap(v=>[{asset:v.asset,blockTime:v.blockTime},{asset:'USDC',blockTime:v.blockTime}])});
  let total=0n;const items=[];
  for(const v of recoveries){
   const minute=Math.floor(v.blockTime/60)*60,input=bounds.get(v.asset+':'+minute),output=bounds.get('USDC:'+minute);
   if(!input||!output)fail();const divisor=10n**BigInt(v.collateralDecimals)*SCALE;
   const spent=(amount(v.convertedCollateralUnits)*BigInt(input.highE8)*1000000n+divisor-1n)/divisor;
   const received=amount(v.receivedUsdcUnits)*BigInt(output.lowE8)/SCALE;
   const fee=(amount(v.swapFeeUsdcUnits)*BigInt(output.highE8)+SCALE-1n)/SCALE;
   const gap=spent>received?spent-received:0n,loss=gap>fee?gap:fee;total+=loss;
   items.push(Object.freeze({signature:v.signature,reservationId:v.reservationId,spentUsdUpperUnits:spent.toString(),receivedUsdLowerUnits:received.toString(),feeUsdUpperUnits:fee.toString(),lossUsdUnits:loss.toString()}));
  }
  const result=Object.freeze({stage:'VALUED_JOURNALED_ENTRY_RECOVERY_RISK',day,readyForSigning:false,recoveryLossUsdUnits:total.toString(),
   basis:'CLOSED_UNDERLYING_AND_USDC_USD_BOUNDS_WITH_OUTPUT_FEE_FLOOR',usesUnderlyingMarketProxy:true,networkFeesIncluded:false,items:Object.freeze(items)});
  proofs.set(result,{bound,started,at,now,monotonicNow});return requirePerpsEntryRecoveryUsdValuation(result,{recoveries,day});
 };
}
