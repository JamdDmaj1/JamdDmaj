// Position-reserve release and aggregate short-exposure checks, not complete
// pool/fee accounting, oracle prices, minimum-return risk or signing authority.
import {readServerPerpsFullCloseVaults} from './perps-server-close-vaults.js';
import {readServerPerpsFullCloseFunding} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {readServerPerpsFullClosePlanPosition} from './perps-server-close-intent.js';
import {decodeServerPerpsCustody} from './perps-server-custody.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_CLOSE_RESERVE_RELEASE_MISMATCH');}
function accounting(c,account){
 decodeServerPerpsCustody(c.asset,c.address,account);
 const b=Buffer.from(account.data[0],'base64'),lastUpdate=b.readBigInt64LE(278);if(lastUpdate<0n)fail();
 return {locked:b.readBigUInt64LE(230),shortSize:b.readBigUInt64LE(246),shortAverage:b.readBigUInt64LE(254),
  interest:b.readBigUInt64LE(262)+(b.readBigUInt64LE(270)<<64n),updated:lastUpdate};
}
export function readServerPerpsFullCloseReserves(value){
 const proof=proofs.get(value);if(!proof)fail();readServerPerpsFullCloseVaults(proof.vaults);return proof;
}
export function checkServerPerpsFullCloseReserves(vaults){
 const {funding}=readServerPerpsFullCloseVaults(vaults),{simulation}=readServerPerpsFullCloseFunding(funding);
 const {inspection,before,after}=readServerPerpsFullCloseSimulation(simulation),{plan,market,collateral,usdc}=readInspectedServerPerpsFullClose(inspection);
 const position=readServerPerpsFullClosePlanPosition(plan),locked=BigInt(position.lockedTokenUnits),size=BigInt(position.sizeUsdUnits);
 if(locked<=0n||size<=0n)fail();
 for(const c of new Map([market,collateral,usdc].map(c=>[c.address,c])).values()){
  const a=accounting(c,before[c.address]),b=accounting(c,after[c.address]);
  if(a.locked-b.locked!==(c.address===collateral.address?locked:0n))fail();
  if(a.shortSize-b.shortSize!==(c.address===market.address&&plan.side==='SHORT'?size:0n))fail();
  if((plan.side==='LONG'||c.address!==market.address)&&a.shortAverage!==b.shortAverage)fail();
  if(b.interest<a.interest||b.updated<a.updated)fail();
  if(c.address===collateral.address&&a.interest<BigInt(position.cumulativeInterestSnapshotUnits))fail();
 }
 const result=Object.freeze({stage:'FULL_CLOSE_RESERVE_RELEASE_ONLY',readyForSigning:false,tradingEnabled:false,
  positionAddress:plan.positionAddress,releasedCollateralTokenUnits:locked.toString(),
  removedShortSizeUsdUnits:plan.side==='SHORT'?size.toString():'0',requiresRemainingPoolEconomicsAndOracleEffects:true,
  requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true});
 proofs.set(result,Object.freeze({vaults}));return result;
}
