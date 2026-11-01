// Agreed economics only. This module cannot collect, sign, swap or lock funds.
// A pool/router integration must enforce these values atomically on chain.
export const JAMD_BUY_LIQUIDITY_POLICY=Object.freeze({
 version:1,buyFeeBps:100,sellFeeBps:0,transferFeeBps:0,
 feeAsset:'USDC',feeDecimals:6,newLiquidityLockBps:10000,
 lock:'permanent',burnJamd:false,enabled:false,
 enforcement:'unimplemented',scope:'jamddmaj-integration-only',
});
const U64_MAX=18446744073709551615n;
function units(value){
 if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,19})$/.test(value))throw Error('JAMD_AMOUNT');
 const n=BigInt(value);if(n<=0n||n>U64_MAX)throw Error('JAMD_AMOUNT');return n;
}
/** No market quote: reserve movements, normal DEX fees and SOL costs are separate.
 * Integer truncation never charges more than 1%; dust below 100 base units has
 * zero additional fee. Merely declaring a trade a buy is NOT chain evidence.
 */
export function planJamdLiquidityFee({side,inputBaseUnits}){
 if(!['buy','sell','transfer'].includes(side))throw Error('JAMD_SIDE');
 const input=units(inputBaseUnits),fee=side==='buy'?input/100n:0n;
 return Object.freeze({side,inputBaseUnits:input.toString(),feeBaseUnits:fee.toString(),
  tradeInputBaseUnits:(input-fee).toString(),feeAsset:side==='buy'?'USDC':null,
  newLiquidityLockBps:10000,rounding:'down',executable:false,
  blockers:Object.freeze(['JAMDDMAJ_BUY_FEE_NOT_IMPLEMENTED','POOL_NOT_BOUND',
   'ATOMIC_LIQUIDITY_AND_PERMANENT_LOCK_NOT_IMPLEMENTED'])});
}
