// Jupiter transaction preparation only. No signer, RPC submission or private keys.
// Schema: https://perps-api.jup.ag/v1/docs (/positions/increase).
import bs58 from 'bs58';
export const JUPITER_PERPS_MARKETS=Object.freeze(['BTC','ETH','SOL']);
const API='https://perps-api.jup.ag/v1';
export function exactUsdUnits(value){
  const text=String(value);
  if(!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(text))throw Error('INVALID_USD_AMOUNT');
  const [whole,fraction='']=text.split('.');const units=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
  if(units<=0n)throw Error('INVALID_USD_AMOUNT');return units.toString();
}
function publicKey(value){try{if(typeof value!=='string'||bs58.decode(value).length!==32)throw Error();return value;}catch{throw Error('INVALID_PUBLIC_KEY');}}
export function planJupiterAutomationSignal(signal,{decision,walletAddress,marginUsd,leverage,maxSlippageBps,now=Date.now()}={}){
  // Existing strategy must approve first. This adapter does not rescore signals.
  if(decision?.ok!==true)throw Error('STRATEGY_NOT_APPROVED');
  const createdAt=Date.parse(signal?.createdAt);
  if(!Number.isFinite(createdAt)||now-createdAt>300000||createdAt>now+2000)throw Error('STALE_SIGNAL');
  if(typeof signal?.id!=='string'||!signal.id||signal.id.length>180)throw Error('INVALID_SIGNAL_ID');
  const asset=String(signal.pair||signal.symbol||'').replace(/USDT$/,'');
  if(!JUPITER_PERPS_MARKETS.includes(asset)||Number(signal.contractMultiplier||1)!==1)throw Error('UNSUPPORTED_MARKET');
  if(!['LONG','SHORT'].includes(signal.side))throw Error('INVALID_SIDE');
  const entry=Number(signal.entry),sl=Number(signal.sl),tp=Number(signal.tp1);
  if(![entry,sl,tp].every(n=>Number.isFinite(n)&&n>0)||(signal.side==='LONG'?!(sl<entry&&tp>entry):!(sl>entry&&tp<entry)))throw Error('INVALID_EXIT_LEVELS');
  if(!Number.isFinite(leverage)||leverage<1.1||leverage>50||Math.round(leverage*10)!==leverage*10)throw Error('INVALID_LEVERAGE');
  if(!Number.isInteger(maxSlippageBps)||maxSlippageBps<1||maxSlippageBps>100)throw Error('INVALID_SLIPPAGE');
  const inputTokenAmount=exactUsdUnits(marginUsd);if(BigInt(inputTokenAmount)<10000000n)throw Error('MINIMUM_COLLATERAL');
  return Object.freeze({signalId:signal.id,provider:'jupiter-perps',network:'solana-mainnet',requiresTransactionValidation:true,body:{asset,inputToken:'USDC',inputTokenAmount,leverage:String(leverage),maxSlippageBps:String(maxSlippageBps),side:signal.side.toLowerCase(),walletAddress:publicKey(walletAddress),tpsl:[{receiveToken:'USDC',triggerPrice:exactUsdUnits(signal.sl),requestType:'sl'},{receiveToken:'USDC',triggerPrice:exactUsdUnits(signal.tp1),requestType:'tp'}]}});
}
export async function prepareJupiterAutomationSignal(signal,options,request=globalThis.fetch){
  const plan=planJupiterAutomationSignal(signal,options);
  const response=await request(API+'/positions/increase',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan.body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('JUPITER_PREPARATION_UNAVAILABLE');
  const text=await response.text();if(text.length>100000)throw Error('INVALID_PREPARATION');
  let data;try{data=JSON.parse(text);}catch{throw Error('INVALID_PREPARATION');}
  if(typeof data.serializedTxBase64!=='string'||!data.serializedTxBase64.length||data.serializedTxBase64.length>20000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.serializedTxBase64)||data.quote?.side!==plan.body.side)throw Error('INVALID_PREPARATION');
  publicKey(data.positionPubkey);publicKey(data.txMetadata?.blockhash);
  if(!/^\d+$/.test(String(data.txMetadata?.lastValidBlockHeight)))throw Error('INVALID_PREPARATION');
  // Opaque transaction is deliberately not accepted as a verified trading order.
  // A native validator must decode instructions, amounts, signer, programs and SL/TP.
  return {plan,preparation:data,stage:'UNVERIFIED_UNSIGNED',tradingEnabled:false,readyForSigning:false};
}
