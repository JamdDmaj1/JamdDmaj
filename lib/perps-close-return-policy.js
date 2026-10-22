// Independent owner-specified simulated payout floor, NOT an on-chain minimum
// or permission to sign. Protocol economics/final execution bounds still apply.
import {describeSimulatedPerpsCloseSettlement} from './perps-close-settlement.js';
import {readServerPerpsFullCloseOracleEffects} from './perps-server-close-oracle-effects.js';
import {readServerPerpsFullCloseReserves} from './perps-server-close-reserves.js';
import {readServerPerpsFullCloseVaults} from './perps-server-close-vaults.js';
import {readServerPerpsFullCloseFunding} from './perps-server-close-funding.js';
import {validatePerpsCloseReturnLimits} from './perps-close-return-limits.js';
export {validatePerpsCloseReturnLimits} from './perps-close-return-limits.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_RETURN_POLICY_MISMATCH');}
export function checkSimulatedPerpsCloseReturn(oracleEffects,limits){
 const approved=validatePerpsCloseReturnLimits(limits);
 const {reserves}=readServerPerpsFullCloseOracleEffects(oracleEffects),{vaults}=readServerPerpsFullCloseReserves(reserves);
 const {funding}=readServerPerpsFullCloseVaults(vaults);readServerPerpsFullCloseFunding(funding);
 const description=JSON.parse(describeSimulatedPerpsCloseSettlement(oracleEffects).encoded);
 const received=description.conversionRequired?description.estimatedCollateralUnits:description.estimatedUsdcUnits;
 if(BigInt(received)<BigInt(approved.minimumReturnUnits)||BigInt(funding.networkFeeLamports)>BigInt(approved.maximumNetworkFeeLamports))fail();
 const value=Object.freeze({stage:'SIMULATED_CLOSE_RETURN_FLOOR_CHECKED',readyForSigning:false,tradingEnabled:false,
  walletAddress:description.walletAddress,positionAddress:description.positionAddress,receiveMint:description.receiveMint,receiveAsset:description.receiveAsset,
  delivery:description.delivery,simulatedReturnUnits:received,minimumReturnUnits:approved.minimumReturnUnits,
  maximumNetworkFeeLamports:approved.maximumNetworkFeeLamports,networkFeeLamports:funding.networkFeeLamports,
  requiresOnChainExecutionBounds:true,requiresRemainingPoolEconomics:true,requiresSeparateUsdcConversion:description.conversionRequired});
 proofs.set(value,{oracleEffects,limits:approved});return value;
}
export function readSimulatedPerpsCloseReturn(value,{oracleEffects}={}){
 const proof=proofs.get(value);if(!proof||proof.oracleEffects!==oracleEffects)fail();
 readServerPerpsFullCloseOracleEffects(proof.oracleEffects);return proof;
}
