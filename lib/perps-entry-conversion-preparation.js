// First-leg preparation only. Ownership/policy reservation, explicit consent,
// durable broadcast and finalized receipt binding remain caller obligations.
import bs58 from 'bs58';
import {perpsNavigationDraft} from './perps-navigation.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
import {PERPS_CUSTODIES,decodeServerPerpsCustody} from './perps-server-custody.js';
import {decodePerpsConversionOracleBounds} from './perps-close-conversion-simulation.js';
import {buildUnsignedPerpsEntryConversionWire,minimumPerpsEntryCollateralUnits} from './perps-entry-conversion-wire.js';
import {simulatePerpsEntryConversion,readSimulatedPerpsEntryConversion} from './perps-entry-conversion-simulation.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_ENTRY_CONVERSION_PREPARATION');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function snapshot(r,length,slot){if(integer(r?.context?.slot)<slot||!Array.isArray(r.value)||r.value.length!==length)fail();return r;}
export function readPreparedPerpsEntryConversion(review){const p=proofs.get(review);if(!p)fail();p.fresh();readSimulatedPerpsEntryConversion(p.simulation);return p;}
export async function prepareProtectedPerpsEntryConversion(draft,walletAddress,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 draft=perpsNavigationDraft(draft);
 if(draft.side!=='LONG'||typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 try{if(typeof walletAddress!=='string'||bs58.decode(walletAddress).length!==32||bs58.encode(bs58.decode(walletAddress))!==walletAddress)fail();}catch{fail();}
 const started=monotonicNow(),at=integer(now());if(!Number.isFinite(started))fail();
 const fresh=()=>{const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||now()<at||now()-at>10000)fail();};
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const assets=['USDC',draft.asset],native=snapshot(await request('getMultipleAccounts',[assets.map(a=>PERPS_CUSTODIES[a].address),{encoding:'base64',commitment:'confirmed',minContextSlot:0}]),2,0);fresh();
 const [usdc,collateral]=assets.map((a,i)=>decodeServerPerpsCustody(a,PERPS_CUSTODIES[a].address,native.value[i]));
 const oracles=snapshot(await request('getMultipleAccounts',[[usdc.dovesAgOracle,collateral.dovesAgOracle],{encoding:'base64',commitment:'confirmed',minContextSlot:native.context.slot}]),2,native.context.slot);fresh();
 const [up,cp]=await Promise.all([usdc,collateral].map((c,i)=>decodePerpsConversionOracleBounds(c,oracles.value[i],{nowSeconds:Math.floor(integer(now())/1000)})));
 const input=exactUsdUnits(draft.margin),floor=BigInt(minimumPerpsEntryCollateralUnits({usdcUnits:input,outputDecimals:collateral.decimals,usdcPriceLowerUsdUnits:up.priceLowerUsdUnits,outputPriceUpperUsdUnits:cp.priceUpperUsdUnits,maxSlippageBps:50}));
 // Reserve two bps for read-bank drift by requiring MORE collateral. The
 // independent exact-wire simulation still enforces the original 50 bps cap.
 const minimum=((floor*10002n+9999n)/10000n).toString();
 const latest=await request('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:oracles.context.slot}]);
 if(integer(latest?.context?.slot)<oracles.context.slot)fail();fresh();
 const wire=await buildUnsignedPerpsEntryConversionWire({walletAddress,asset:draft.asset,usdcUnits:input,minimumCollateralUnits:minimum,
  blockhash:latest.value?.blockhash,lastValidBlockHeight:String(integer(latest.value?.lastValidBlockHeight))},usdc,collateral);
 const simulation=await simulatePerpsEntryConversion(wire,{request,minimumSlot:latest.context.slot,now,monotonicNow});fresh();
 const review=Object.freeze({stage:'PROTECTED_ENTRY_CONVERSION_PREPARED',readyForSigning:false,tradingEnabled:false,walletAddress,draft,
  usdcUnits:input,collateralMint:collateral.mint,collateralDecimals:collateral.decimals,minimumCollateralUnits:minimum,simulatedCollateralUnits:simulation.receivedCollateralUnits,
  networkFeeLamports:simulation.networkFeeLamports,rentLockedLamports:simulation.rentLockedLamports,maxSlippageBps:50,observedSlot:simulation.observedSlot,expiresAt:at+10000,
  requiresExplicitAuthorization:true,requiresDurableEntryReservation:true,requiresFinalizedReceiptBeforeOpening:true,submitted:false});
 proofs.set(review,Object.freeze({wire,simulation,fresh}));return review;
}
