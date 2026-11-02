// Builder transport for the second step of a protected Long. This does not
// inspect, sign, reserve risk, charge fees or send a financial transaction.
import {readBoundPerpsEntryCollateral} from './perps-entry-conversion-binding.js';
import {planJupiterManualOrder,exactUsdUnits} from './jupiter-perps-order.js';
import {requestJupiterPerpsPreparation} from './jupiter-perps-automation.js';
function fail(){throw Error('INVALID_PROTECTED_COLLATERAL_LONG');}
export function planProtectedPerpsCollateralLong(binding,intent){
 const b=readBoundPerpsEntryCollateral(binding);
 if(intent?.side!=='LONG'||intent.asset!==b.asset||intent.walletAddress!==b.walletAddress
  ||intent.maxSlippageBps!==50||exactUsdUnits(intent.marginUsd)!==b.spentUsdcUnits)fail();
 const standard=planJupiterManualOrder({...intent,maxSlippageBps:25});
 const plan=Object.freeze({...standard,body:Object.freeze({...standard.body,inputToken:b.asset,inputTokenAmount:b.receivedCollateralUnits})});
 readBoundPerpsEntryCollateral(binding);return plan;
}
export async function prepareProtectedPerpsCollateralLong(binding,intent,request){
 if(typeof request!=='function')fail();
 const plan=planProtectedPerpsCollateralLong(binding,intent);
 const packet=await requestJupiterPerpsPreparation(plan,request);
 readBoundPerpsEntryCollateral(binding);
 return Object.freeze({...packet,requiresIndependentCollateralIntentInspection:true,requiresDurableEntryReservation:true,requiresSeparateOpeningAuthorization:true});
}
