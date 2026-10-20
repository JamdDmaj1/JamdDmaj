// Full-position close planning and instruction-data checks only. This module
// cannot fetch a builder, authorize, sign, submit, or prove simulated effects.
import {requireFreshServerPerpsAccount} from './perps-server-account.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const plans=new WeakMap();
// Confirmed mainnet Anchor IDL, slot 459186694, SHA-256
// 1d90a653a1cc88bddb7c5876acee52d3f26c6b1e3306e0833234020dc6f7d653.
const DECREASE='2e17f02c1e8a5e8c',DECREASE2='a2bfc83e8b3eb011';
function fail(){throw Error('PERPS_CLOSE_INTENT_MISMATCH');}
export function planServerPerpsFullClose(account,{walletAddress,positionAddress,referencePrice,maxSlippageBps,minimumSlot=0}={}){
 if(!Number.isSafeInteger(minimumSlot)||minimumSlot<0||!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100)fail();
 requireFreshServerPerpsAccount(account,{walletAddress,minimumSlot});
 const matches=account.positions.filter(p=>p.address===positionAddress);
 if(matches.length!==1)fail();
 const position=matches[0];
 if(position.walletAddress!==walletAddress||BigInt(position.sizeUsdUnits)<=0n)fail();
 const reference=BigInt(exactUsdUnits(referencePrice));
 // Closing LONG sells; closing SHORT buys. Round inward, never widen tolerance.
 const limit=position.side==='LONG'
  ?(reference*BigInt(10000-maxSlippageBps)+9999n)/10000n
  :reference*BigInt(10000+maxSlippageBps)/10000n;
 const plan=Object.freeze({stage:'FULL_CLOSE_PLAN_ONLY',readyForSigning:false,
  walletAddress,positionAddress,asset:position.asset,side:position.side,
  observedSlot:account.observedSlot,sizeUsdUnits:position.sizeUsdUnits,
  collateralUsdUnits:position.collateralUsdUnits,referencePriceUsdUnits:reference.toString(),
  priceLimitUsdUnits:limit.toString(),maxSlippageBps,
  body:Object.freeze({positionPubkey:positionAddress,receiveToken:'USDC',entirePosition:true,maxSlippageBps:String(maxSlippageBps)})});
 plans.set(plan,{account,position});return plan;
}
export function requireFreshServerPerpsFullClosePlan(plan){
 const proof=plans.get(plan);if(!proof)fail();
 requireFreshServerPerpsAccount(proof.account,{walletAddress:plan.walletAddress,minimumSlot:plan.observedSlot});
 return plan;
}
export function readServerPerpsFullClosePlanPosition(plan){
 requireFreshServerPerpsFullClosePlan(plan);return plans.get(plan).position;
}
export function checkServerPerpsFullCloseCore(encoded,plan,nowSeconds){
 requireFreshServerPerpsFullClosePlan(plan);
 if(typeof encoded!=='string'||encoded.length>68||!Number.isSafeInteger(nowSeconds)||nowSeconds<30)fail();
 const data=Buffer.from(encoded,'base64'),tag=data.subarray(0,8).toString('hex');
 if(data.toString('base64')!==encoded||!(tag===DECREASE&&data.length===42||tag===DECREASE2&&data.length===50))fail();
 // Borsh Option<bool> must be Some(true), not None or a partial close.
 if(data[32]!==1||data[33]!==1)fail();
 const collateral=data.readBigUInt64LE(8),size=data.readBigUInt64LE(16),price=data.readBigUInt64LE(24),time=data.readBigInt64LE(34);
 // These redundant deltas cannot claim more than the independently observed
 // position even when the program processes the entirePosition flag.
 if(collateral>BigInt(plan.collateralUsdUnits)||size>BigInt(plan.sizeUsdUnits)||price===0n
  ||time<BigInt(nowSeconds)-30n||time>BigInt(nowSeconds)+2n)fail();
 const limit=BigInt(plan.priceLimitUsdUnits);
 if(plan.side==='LONG'?price<limit:price>limit)fail();
 return Object.freeze({stage:'FULL_CLOSE_CORE_ONLY',readyForSigning:false,
  positionAddress:plan.positionAddress,side:plan.side,entirePosition:true,
  variant:tag===DECREASE?'instantDecreasePosition':'instantDecreasePosition2',
  priceSlippageUsdUnits:price.toString(),requestTimeSeconds:time.toString(),
  counter:tag===DECREASE2?data.readBigUInt64LE(42).toString():null,
  requiresFullInstructionPolicy:true,requiresSameWireSimulation:true});
}
