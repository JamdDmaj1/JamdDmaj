// Durable description of an unsigned close's settlement route. Estimates are
// never finalized receipts, free capital, a conversion quote or signing grants.
import bs58 from 'bs58';
import {PERPS_CUSTODIES} from './perps-server-custody.js';
import {readServerPerpsFullCloseOracleEffects} from './perps-server-close-oracle-effects.js';
import {readServerPerpsFullCloseReserves} from './perps-server-close-reserves.js';
import {readServerPerpsFullCloseVaults} from './perps-server-close-vaults.js';
import {readServerPerpsFullCloseFunding} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readServerPerpsFullClosePolicy} from './perps-server-close-policy.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {readServerPerpsFullClosePlanPosition} from './perps-server-close-intent.js';
import {validatePerpsCloseReturnLimits} from './perps-close-return-limits.js';
function fail(){throw Error('INVALID_PERPS_CLOSE_SETTLEMENT');}
function key(s){try{if(typeof s!=='string'||bs58.decode(s).length!==32||bs58.encode(bs58.decode(s))!==s)fail();return s;}catch{fail();}}
function units(s){if(typeof s!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(s)||BigInt(s)>18446744073709551615n)fail();return s;}
// Canonical serialization is also used when validating encrypted recovery.
// This accepts data, not an unforgeable authority proof; no signer consumes it.
export function canonicalPerpsCloseSettlement(value,{walletAddress,positionAddress}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const names=['version','mode','walletAddress','positionAddress','asset','side','receiveAsset','receiveMint','receiveAccount','collateralAccount','delivery','estimatedCollateralUnits','estimatedUsdcUnits','conversionRequired','closePriceLimitUsdUnits',
  ...(value.version===2?['sizeUsdUnits','collateralUsdUnits','positionOpenTimeSeconds']:[]),
  ...(Object.hasOwn(value,'returnLimits')?['returnLimits']:[])];
 if(Object.keys(value).sort().join(',')!==names.sort().join(','))fail();
 if(![1,2].includes(value.version)||!['DIRECT_USDC','COLLATERAL_THEN_USDC'].includes(value.mode)||!['BTC','ETH','SOL'].includes(value.asset)||!['LONG','SHORT'].includes(value.side))fail();
 if(key(value.walletAddress)!==walletAddress||key(value.positionAddress)!==positionAddress)fail();
 const separate=value.mode==='COLLATERAL_THEN_USDC'&&value.side==='LONG';
 const receiveAsset=separate?value.asset:'USDC';
 if(value.receiveAsset!==receiveAsset||value.receiveMint!==PERPS_CUSTODIES[receiveAsset].mint||value.conversionRequired!==separate)fail();
 key(value.receiveAccount);key(value.collateralAccount);
 if(!['NATIVE_SOL','TOKEN'].includes(value.delivery))fail();
 if(value.delivery==='NATIVE_SOL'&&!(separate&&value.asset==='SOL'&&value.receiveAccount===value.walletAddress))fail();
 if(value.delivery==='TOKEN'&&value.receiveAccount===value.walletAddress)fail();
 if(separate&&value.delivery==='TOKEN'&&value.receiveAccount!==value.collateralAccount)fail();
 if(!separate&&(value.side==='SHORT')!==(value.receiveAccount===value.collateralAccount))fail();
 const collateral=units(value.estimatedCollateralUnits),usdc=units(value.estimatedUsdcUnits),limit=units(value.closePriceLimitUsdUnits);
 if(separate?usdc!=='0':collateral!=='0')fail();if(limit==='0')fail();
 const generation=value.version===2?{sizeUsdUnits:units(value.sizeUsdUnits),collateralUsdUnits:units(value.collateralUsdUnits),positionOpenTimeSeconds:units(value.positionOpenTimeSeconds)}:{};
 if(value.version===2&&(Object.values(generation).some(v=>v==='0')||BigInt(generation.positionOpenTimeSeconds)>9223372036854775807n))fail();
 const limits=Object.hasOwn(value,'returnLimits')?{returnLimits:validatePerpsCloseReturnLimits(value.returnLimits)}:{};
 if(Object.hasOwn(value,'returnLimits')&&value.version!==2)fail();
 return JSON.stringify({version:value.version,mode:value.mode,walletAddress,positionAddress,asset:value.asset,side:value.side,
  receiveAsset,receiveMint:value.receiveMint,receiveAccount:value.receiveAccount,collateralAccount:value.collateralAccount,delivery:value.delivery,
  estimatedCollateralUnits:collateral,estimatedUsdcUnits:usdc,conversionRequired:separate,closePriceLimitUsdUnits:limit,...generation,...limits});
}
export function describeSimulatedPerpsCloseSettlement(oracleEffects){
 const {reserves}=readServerPerpsFullCloseOracleEffects(oracleEffects),{vaults}=readServerPerpsFullCloseReserves(reserves);
 const {funding,policy}=readServerPerpsFullCloseVaults(vaults),{simulation}=readServerPerpsFullCloseFunding(funding);
 const {inspection}=readServerPerpsFullCloseSimulation(simulation),{plan}=readInspectedServerPerpsFullClose(inspection);
 if(readServerPerpsFullClosePolicy(policy).inspection!==inspection)fail();
 const separate=plan.requiresSeparateUsdcConversion,unwrapped=funding.collateralDelivery==='NATIVE_SOL';
 const value={version:2,mode:plan.settlement,walletAddress:plan.walletAddress,positionAddress:plan.positionAddress,
  asset:plan.asset,side:plan.side,receiveAsset:separate?plan.asset:'USDC',receiveMint:PERPS_CUSTODIES[separate?plan.asset:'USDC'].mint,
  receiveAccount:separate?(unwrapped?plan.walletAddress:inspection.bindings.collateralAccount):inspection.bindings.recipient,
  collateralAccount:inspection.bindings.collateralAccount,delivery:funding.collateralDelivery,estimatedCollateralUnits:funding.receivedCollateralUnits,
  estimatedUsdcUnits:funding.receivedUsdcUnits,conversionRequired:separate,closePriceLimitUsdUnits:inspection.bindings.core.priceSlippageUsdUnits,
  sizeUsdUnits:plan.sizeUsdUnits,collateralUsdUnits:plan.collateralUsdUnits,
  positionOpenTimeSeconds:readServerPerpsFullClosePlanPosition(plan).openTimeSeconds};
 const encoded=canonicalPerpsCloseSettlement(value,plan);
 return Object.freeze({stage:'SIMULATED_CLOSE_SETTLEMENT_DESCRIPTION',readyForSigning:false,
  encoded,requiresFinalizedCloseReceipt:true,requiresProtectedConversion:separate});
}
