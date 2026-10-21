// Shared manual-order validation for the web. This is preparation only: no
// custody, wallet prompt, signed transaction, broadcast or bot activation.
import bs58 from 'bs58';
import {perpsNavigationDraft} from './perps-navigation.js';
import {prepareJupiterManualOrder} from './jupiter-perps-automation.js';
import {inspectServerPerpsPreparation} from './perps-server-preparation.js';
import {readAndCheckServerPerpsCustodies} from './perps-server-custody.js';
import {checkServerPerpsTokenPolicy} from './perps-server-token-policy.js';
import {inspectServerPerpsPreSwapPlan} from './perps-server-preswap.js';
import {simulateServerPerpsPositionEffects} from './perps-server-simulation.js';
import {checkServerPerpsFundingSimulation} from './perps-server-funding-simulation.js';
import {readServerPerpsAccount,requireFreshServerPerpsAccount} from './perps-server-account.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
function fail(code='PERPS_MANUAL_REVIEW_UNAVAILABLE'){throw Error(code);}
export async function prepareInspectedPerpsManualOrder(draft,walletAddress,{rpcRequest,builderRequest,now=Date.now,monotonicNow=()=>performance.now()}={}){
 draft=perpsNavigationDraft(draft);
 if(typeof walletAddress!=='string'||bs58.decode(walletAddress).length!==32||bs58.encode(bs58.decode(walletAddress))!==walletAddress
  ||typeof rpcRequest!=='function'||typeof builderRequest!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow(),at=now();if(!Number.isFinite(started)||!Number.isSafeInteger(at)||at<30000)fail();
 const fresh=()=>{const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000||now()<at||now()-at>15000)fail();};
 const account=await readServerPerpsAccount({walletAddress},{request:rpcRequest,now,monotonicNow});fresh();
 const margin=exactUsdUnits(draft.margin);
 if(BigInt(account.availableUsdcUnits)<BigInt(margin))fail('PERPS_MANUAL_INSUFFICIENT_USDC');
 if(BigInt(account.payerLamports)<1000000n)fail('PERPS_MANUAL_INSUFFICIENT_SOL');
 const intent=Object.freeze({asset:draft.asset,side:draft.side,walletAddress,marginUsd:draft.margin,leverage:draft.leverage,
  referencePrice:draft.referencePrice,stopLoss:draft.stopLoss??null,takeProfit:draft.takeProfit??null,maxSlippageBps:50});
 const prepared=await prepareJupiterManualOrder({...intent,leverage:Number(intent.leverage)},builderRequest);fresh();
 const inspection=await inspectServerPerpsPreparation(prepared.preparation,intent,{request:rpcRequest,nowSeconds:Math.floor(now()/1000),minimumSlot:account.observedSlot});
 const custody=await readAndCheckServerPerpsCustodies(inspection,intent,{request:rpcRequest});fresh();
 if(custody.position!==prepared.preparation.positionPubkey)fail();
 const tokenPolicy=await checkServerPerpsTokenPolicy(inspection,intent);
 const fundingPlan=await inspectServerPerpsPreSwapPlan(inspection,intent,custody.usdc,custody.market);
 const inspected=Object.freeze({...prepared,intent,inspection,custody,tokenPolicy,fundingPlan,stage:inspection.stage,readyForSigning:false,tradingEnabled:false});
 const simulation=await simulateServerPerpsPositionEffects(inspected,{request:rpcRequest,monotonicNow});
 const funding=await checkServerPerpsFundingSimulation(inspected,simulation,{request:rpcRequest,monotonicNow});fresh();
 const current=await readServerPerpsAccount({walletAddress,minimumSlot:simulation.observedSlot},{request:rpcRequest,now,monotonicNow});fresh();
 requireFreshServerPerpsAccount(current,{walletAddress,minimumSlot:simulation.observedSlot});
 if(BigInt(current.availableUsdcUnits)<BigInt(margin))fail('PERPS_MANUAL_INSUFFICIENT_USDC');
 if(BigInt(current.payerLamports)<BigInt(funding.networkFeeLamports)+BigInt(funding.rentLockedLamports)+1000000n)fail('PERPS_MANUAL_INSUFFICIENT_SOL');
 // Do not leak a builder packet as a signing-ready response. Browser signing
 // still needs its own reviewed, exact-wire authorization and durable journal.
 return Object.freeze({stage:'MANUAL_PERPS_REVIEW_VALIDATED',readyForSigning:false,tradingEnabled:false,
  walletAddress,draft,observedAt:now(),observedSlot:current.observedSlot,expiresAt:at+15000,
  availableUsdcUnits:current.availableUsdcUnits,payerLamports:current.payerLamports,
  marginUsdcUnits:margin,sizeUsdUnits:inspection.core.sizeUsdUnits,
  networkFeeLamports:funding.networkFeeLamports,rentLockedLamports:funding.rentLockedLamports,
  requiresWalletSignature:true,requiresDurableSubmissionJournal:true});
}
