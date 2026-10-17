// Shared manual/Telegram order intent. Pure planning: never signs or sends.
import bs58 from 'bs58';
export const JUPITER_PERPS_MARKETS=Object.freeze(['BTC','ETH','SOL']);
export function exactUsdUnits(value){
  const text=String(value);
  if(!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(text))throw Error('INVALID_USD_AMOUNT');
  const [whole,fraction='']=text.split('.');
  const units=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
  if(units<=0n)throw Error('INVALID_USD_AMOUNT');return units.toString();
}
function publicKey(value){
  try{if(typeof value!=='string'||bs58.decode(value).length!==32)throw Error();return value;}
  catch{throw Error('INVALID_PUBLIC_KEY');}
}
export function planJupiterManualOrder({asset,side,walletAddress,marginUsd,leverage,maxSlippageBps,stopLoss=null,takeProfit=null,referencePrice=null}={}){
  if(!JUPITER_PERPS_MARKETS.includes(asset))throw Error('UNSUPPORTED_MARKET');
  if(!['LONG','SHORT'].includes(side))throw Error('INVALID_SIDE');
  if(!Number.isFinite(leverage)||leverage<1.1||leverage>50||Math.round(leverage*10)!==leverage*10)throw Error('INVALID_LEVERAGE');
  if(!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100)throw Error('INVALID_SLIPPAGE');
  const inputTokenAmount=exactUsdUnits(marginUsd);
  if(BigInt(inputTokenAmount)<10000000n)throw Error('MINIMUM_COLLATERAL');
  const tpsl=[];
  if(stopLoss!==null||takeProfit!==null){
    const entry=BigInt(exactUsdUnits(referencePrice));
    for(const [requestType,price] of [['sl',stopLoss],['tp',takeProfit]]){
      if(price===null)continue;
      const triggerPrice=exactUsdUnits(price),above=BigInt(triggerPrice)>entry;
      if(BigInt(triggerPrice)===entry||above!==((side==='LONG')===(requestType==='tp')))throw Error('INVALID_EXIT_LEVELS');
      tpsl.push(Object.freeze({receiveToken:'USDC',triggerPrice,requestType}));
    }
  }
  const body={asset,inputToken:'USDC',inputTokenAmount,leverage:String(leverage),maxSlippageBps:String(maxSlippageBps),side:side.toLowerCase(),walletAddress:publicKey(walletAddress)};
  if(tpsl.length)body.tpsl=Object.freeze(tpsl);
  return Object.freeze({provider:'jupiter-perps',network:'solana-mainnet',requiresTransactionValidation:true,body:Object.freeze(body)});
}
