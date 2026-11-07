// Unsigned recovery preparation only. The original risk hold is unchanged.
import {readRecoverablePerpsEntryCollateral} from './perps-entry-collateral-recovery-binding.js';
import {PERPS_CUSTODIES,decodeServerPerpsCustody} from './perps-server-custody.js';
import {buildUnsignedPerpsCloseConversionWire,minimumPerpsConversionUsdcUnits} from './perps-close-conversion-wire.js';
import {simulatePerpsCloseConversion,readSimulatedPerpsCloseConversion,decodePerpsConversionOracleBounds} from './perps-close-conversion-simulation.js';
const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',proofs=new WeakMap();
function fail(){throw Error('PERPS_ENTRY_COLLATERAL_RECOVERY_PREPARATION_REQUIRED');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
export function readPreparedPerpsEntryCollateralRecovery(value){
 const p=proofs.get(value);if(!p)fail();readRecoverablePerpsEntryCollateral(p.binding);readSimulatedPerpsCloseConversion(p.simulation);return p;
}
export async function preparePerpsEntryCollateralRecovery(binding,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 readRecoverablePerpsEntryCollateral(binding);
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||binding.maxSlippageBps!==50||binding.recoveryAlreadyCompleted===true)fail();
 const guarded=async(method,params)=>{readRecoverablePerpsEntryCollateral(binding);const result=await request(method,params);readRecoverablePerpsEntryCollateral(binding);return result;};
 if(await guarded('getGenesisHash',[])!==GENESIS)fail();
 const keys=[PERPS_CUSTODIES[binding.asset].address,PERPS_CUSTODIES.USDC.address];
 const native=await guarded('getMultipleAccounts',[keys,{encoding:'base64',commitment:'confirmed',minContextSlot:binding.minimumSlot}]);
 if(integer(native?.context?.slot)<binding.minimumSlot||!Array.isArray(native.value)||native.value.length!==2)fail();
 const collateral=decodeServerPerpsCustody(binding.asset,keys[0],native.value[0]),usdc=decodeServerPerpsCustody('USDC',keys[1],native.value[1]);
 if(collateral.mint!==binding.collateralMint)fail();
 const oracles=await guarded('getMultipleAccounts',[[collateral.dovesAgOracle,usdc.dovesAgOracle],{encoding:'base64',commitment:'confirmed',minContextSlot:native.context.slot}]);
 if(integer(oracles?.context?.slot)<native.context.slot||!Array.isArray(oracles.value)||oracles.value.length!==2)fail();
 const at=Math.floor(integer(now())/1000),input=await decodePerpsConversionOracleBounds(collateral,oracles.value[0],{nowSeconds:at}),output=await decodePerpsConversionOracleBounds(usdc,oracles.value[1],{nowSeconds:at});
 const minimum=minimumPerpsConversionUsdcUnits({amountUnits:binding.amountUnits,inputDecimals:collateral.decimals,
  inputPriceLowerUsdUnits:input.priceLowerUsdUnits,usdcPriceUpperUsdUnits:output.priceUpperUsdUnits,maxSlippageBps:50});
 const latest=await guarded('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:oracles.context.slot}]);
 if(integer(latest?.context?.slot)<oracles.context.slot)fail();
 const wire=await buildUnsignedPerpsCloseConversionWire({walletAddress:binding.walletAddress,asset:binding.asset,amountUnits:binding.amountUnits,
  minimumUsdcUnits:minimum,nativeSolInput:false,closeWrappedAccount:false,blockhash:latest.value?.blockhash,lastValidBlockHeight:String(integer(latest.value?.lastValidBlockHeight))},collateral,usdc);
 if(wire.source!==binding.source)fail();
 const simulation=await simulatePerpsCloseConversion(wire,{request:guarded,minimumSlot:latest.context.slot,maxSlippageBps:50,now,monotonicNow});
 const effects=readSimulatedPerpsCloseConversion(simulation);
 if(BigInt(effects.after[binding.walletAddress].lamports)<1000000n)fail();
 const result=Object.freeze({stage:'ENTRY_COLLATERAL_RECOVERY_PREPARED',reservationId:binding.reservationId,walletAddress:binding.walletAddress,
  asset:binding.asset,amountUnits:binding.amountUnits,minimumUsdcUnits:minimum,observedSlot:simulation.observedSlot,
  networkFeeLamports:simulation.networkFeeLamports,rentLockedLamports:simulation.rentLockedLamports,maxSlippageBps:50,
  readyForSigning:false,tradingEnabled:false,requiresExplicitRecoveryConfirmation:true,requiresDurableRecoveryReservation:true});
 readRecoverablePerpsEntryCollateral(binding);proofs.set(result,Object.freeze({binding,wire,simulation}));return result;
}
