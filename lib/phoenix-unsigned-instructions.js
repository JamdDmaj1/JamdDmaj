// Builds ONLY unsigned pieces with the official pinned SDK. This is not a
// complete wire policy or signing capability. It is deliberately not connected
// to the custody vault or HTTP confirm path until simulation/effect gates pass.
import {OrderFlags,getPlaceMarketOrderDecoder} from '@ellipsis-labs/rise';
import {requirePhoenixUnsignedPlan,PHOENIX_IDENTITIES} from './phoenix-market-plan.js';
export async function buildPhoenixUnsignedInstructions(plan,{client,now=Date.now}={}){
 requirePhoenixUnsignedPlan(plan);if(now()>=plan.expiresAt||!client?.ixs)throw Error('PHOENIX_PLAN_EXPIRED');
 const authority=plan.walletAddress,common={authority,traderPdaIndex:0,traderSubaccountIndex:plan.isolatedSubaccountIndex};
 const opening=await client.ixs.buildPlaceMarketOrder({...common,symbol:plan.symbol,orderPacket:plan.packet});
 if(opening.programAddress!==PHOENIX_IDENTITIES.program||!opening.accounts.some(a=>a.address===authority&&(a.role&2)!==0))throw Error('PHOENIX_ORDER_BINDING');
 const decoded=getPlaceMarketOrderDecoder().decode(opening.data);
 const packet=decoded.orderPacket??decoded;
 for(const key of ['side','priceInTicks','numBaseLots','numQuoteLots','minBaseLotsToFill','minQuoteLotsToFill','selfTradeBehavior','matchLimit','clientOrderId','lastValidSlot','orderFlags','cancelExisting'])if(packet[key]!==plan.packet[key])throw Error('PHOENIX_ORDER_BYTES');
 if(packet.orderFlags!==(plan.close?OrderFlags.ReduceOnly:OrderFlags.None))throw Error('PHOENIX_ORDER_FLAGS');
 let deposit=null;
 if(!plan.close){deposit=await client.ixs.buildDepositIxs({...common,amount:BigInt(plan.marginUsdcUnits)});if(!Array.isArray(deposit.instructions)||deposit.instructions.length!==3||deposit.named?.depositFunds?.programAddress!==PHOENIX_IDENTITIES.program||deposit.named?.emberDeposit?.programAddress!==PHOENIX_IDENTITIES.ember)throw Error('PHOENIX_DEPOSIT_BINDING');}
 if(now()>=plan.expiresAt)throw Error('PHOENIX_PLAN_EXPIRED');
 return Object.freeze({stage:'PHOENIX_UNSIGNED_PIECES',readyForSigning:false,close:plan.close,walletAddress:authority,order:opening,deposit,instructions:Object.freeze([...(deposit?.instructions||[]),opening]),requiresIndependentAccountAndTokenPolicy:true,requiresSameWireSimulation:true,requiresDurableOwnerConsent:true,requiresNativeSignatureAndFillReconciliation:true});
}
