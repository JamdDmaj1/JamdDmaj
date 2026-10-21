// Joins a privately verified finalized close payout to its exact unsigned
// protected conversion. No custody keys, journal mutation, signer or transport
// for sending transactions is accepted or invoked by this module.
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import {requireVerifiedPerpsClosePayout,perpsClosePayoutRecordBinding} from './perps-close-payout-receipt.js';
import {PERPS_CUSTODIES,decodeServerPerpsCustody} from './perps-server-custody.js';
import {canonicalServerPerpsSimulationSnapshot} from './perps-server-simulation.js';
import {readPerpsCloseLegacyToken} from './perps-server-close-funding.js';
import {buildUnsignedPerpsCloseConversionWire,minimumPerpsConversionUsdcUnits} from './perps-close-conversion-wire.js';
import {simulatePerpsCloseConversion,readSimulatedPerpsCloseConversion,decodePerpsConversionOracleBounds} from './perps-close-conversion-simulation.js';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_PERPS_CLOSE_CONVERSION_PREPARATION');}
function integer(n){if(!Number.isSafeInteger(n)||n<0)fail();return n;}
function positive(s){if(typeof s!=='string'||!/^[1-9][0-9]{0,19}$/.test(s)||BigInt(s)>18446744073709551615n)fail();return BigInt(s);}
const vacant=a=>a===null||a.owner===SYSTEM&&!a.executable&&a.data[0]==='';
const associated=async(owner,mint)=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
export function readPreparedPerpsCloseConversion(result,liveRecord){
 const p=proofs.get(result);if(!p||perpsClosePayoutRecordBinding(liveRecord)!==result.recordBinding)fail();
 requireVerifiedPerpsClosePayout(p.payout);readSimulatedPerpsCloseConversion(p.simulation);return p;
}
export async function prepareFinalizedPerpsCloseConversion(payout,record,{request,maxSlippageBps,minimumUsdcUnits=null,computeUnitPriceMicroLamports=1000,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requireVerifiedPerpsClosePayout(payout);record=structuredClone(record);
 if(perpsClosePayoutRecordBinding(record)!==payout.recordBinding)fail();
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100
  ||!Number.isSafeInteger(computeUnitPriceMicroLamports)||computeUnitPriceMicroLamports<0||computeUnitPriceMicroLamports>10000)fail();
 const absoluteMinimum=minimumUsdcUnits===null?0n:positive(minimumUsdcUnits);
 if(!payout.requiresConversion){
  return Object.freeze({stage:'NO_CLOSE_CONVERSION_REQUIRED',readyForSigning:false,tradingEnabled:false,recordBinding:payout.recordBinding,
   receivedUsdcUnits:payout.receiveAsset==='USDC'?payout.receivedTokenUnits:'0',requiresSignedCloseJournalBinding:true,requiresCompleteDailyAccounting:true});
 }
 if(!['SOL','ETH','BTC'].includes(payout.receiveAsset)||payout.receiveMint!==PERPS_CUSTODIES[payout.receiveAsset].mint)fail();
 const amount=positive(payout.receivedTokenUnits),owner=payout.walletAddress;
 if(await request('getGenesisHash',[])!==GENESIS)fail();
 const custodyAddresses=[PERPS_CUSTODIES[payout.receiveAsset].address,PERPS_CUSTODIES.USDC.address];
 const native=await request('getMultipleAccounts',[custodyAddresses,{encoding:'base64',commitment:'confirmed',minContextSlot:payout.observedSlot}]);
 if(integer(native?.context?.slot)<payout.observedSlot||!Array.isArray(native.value)||native.value.length!==2)fail();
 const collateral=decodeServerPerpsCustody(payout.receiveAsset,custodyAddresses[0],native.value[0]),usdc=decodeServerPerpsCustody('USDC',custodyAddresses[1],native.value[1]);
 const source=await associated(owner,collateral.mint),destination=await associated(owner,usdc.mint),nativeSolInput=payout.delivery==='NATIVE_SOL';
 if(payout.receiveAccount!==(nativeSolInput?owner:source))fail();
 const keys=[owner,source,destination,collateral.dovesAgOracle,usdc.dovesAgOracle];
 const reply=await request('getMultipleAccounts',[keys,{encoding:'base64',commitment:'confirmed',minContextSlot:native.context.slot}]);
 if(integer(reply?.context?.slot)<native.context.slot)fail();
 const accounts=canonicalServerPerpsSimulationSnapshot(keys,reply.value),at=Math.floor(integer(now())/1000);
 const inputPrice=await decodePerpsConversionOracleBounds(collateral,accounts[collateral.dovesAgOracle],{nowSeconds:at}),usdcPrice=await decodePerpsConversionOracleBounds(usdc,accounts[usdc.dovesAgOracle],{nowSeconds:at});
 const payer=accounts[owner];if(!payer||payer.owner!==SYSTEM||payer.executable||payer.data[0]!=='')fail();
 const sourceAccount=accounts[source],oldTokens=vacant(sourceAccount)?0n:readPerpsCloseLegacyToken(sourceAccount,owner,collateral.mint);
 if(nativeSolInput?BigInt(payer.lamports)<amount:oldTokens<amount)fail();
 if(!vacant(accounts[destination]))readPerpsCloseLegacyToken(accounts[destination],owner,usdc.mint);
 // A full cleanup must never unwrap old WSOL or newly synchronized native
 // excess. Keep that ATA when it contains any pre-existing value.
 const closeWrappedAccount=nativeSolInput&&(sourceAccount===null||vacant(sourceAccount)&&sourceAccount.lamports==='0'
  ||!vacant(sourceAccount)&&oldTokens===0n&&BigInt(sourceAccount.lamports)===Buffer.from(sourceAccount.data[0],'base64').readBigUInt64LE(113));
 const oracleMinimum=positive(minimumPerpsConversionUsdcUnits({amountUnits:amount.toString(),inputDecimals:collateral.decimals,inputPriceLowerUsdUnits:inputPrice.priceLowerUsdUnits,
  usdcPriceUpperUsdUnits:usdcPrice.priceUpperUsdUnits,maxSlippageBps:Math.max(1,maxSlippageBps-1)}));
 const minimum=oracleMinimum>absoluteMinimum?oracleMinimum:absoluteMinimum;
 const latest=await request('getLatestBlockhash',[{commitment:'confirmed',minContextSlot:reply.context.slot}]);
 if(integer(latest?.context?.slot)<reply.context.slot)fail();
 const blockhash=latest?.value?.blockhash,lastValidBlockHeight=String(integer(latest?.value?.lastValidBlockHeight));positive(lastValidBlockHeight);
 requireVerifiedPerpsClosePayout(payout);
 const wire=await buildUnsignedPerpsCloseConversionWire({walletAddress:owner,asset:payout.receiveAsset,amountUnits:amount.toString(),minimumUsdcUnits:minimum.toString(),nativeSolInput,closeWrappedAccount,
  blockhash,lastValidBlockHeight,computeUnitPriceMicroLamports},collateral,usdc);
 const simulation=await simulatePerpsCloseConversion(wire,{request,minimumSlot:latest.context.slot,maxSlippageBps,now,monotonicNow});
 requireVerifiedPerpsClosePayout(payout);
 const result=Object.freeze({stage:'FINALIZED_PAYOUT_CONVERSION_PREPARED',readyForSigning:false,tradingEnabled:false,recordBinding:payout.recordBinding,
  closeSignature:payout.signature,closeSlot:payout.slot,walletAddress:owner,amountUnits:amount.toString(),minimumUsdcUnits:minimum.toString(),wire,simulation,
  requiresSignedCloseJournalBinding:true,requiresFreshSigningRevalidation:true,requiresExplicitAuthorization:true});
 proofs.set(result,Object.freeze({payout,record:Object.freeze(record),wire,simulation}));return result;
}
