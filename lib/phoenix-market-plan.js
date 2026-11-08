// Exact quote/intent primitives for the same-wallet Phoenix adapter.
// A catalog/plan is NOT transaction verification, a signing grant or readiness.
import bs58 from 'bs58';
import {buildMarketOrderPacketFromMarketParams,Side,OrderFlags,SelfTradeBehavior} from '@ellipsis-labs/rise';
const catalogs=new WeakSet(),plans=new WeakSet(),U64=18446744073709551615n;
const fail=code=>{throw Error('PHOENIX_'+code);};
export const PHOENIX_IDENTITIES=Object.freeze({program:'EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih',ember:'EMBERpYNE6ehWmXymZZS2skiFmCa9V5dp14e1iduM5qy',usdc:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',canonicalUsdc:'PhUsd11YkbjSaWjFncfAAmatntsjx3MgDR9B6g1ks3A'});
export function phoenixKey(value){try{const bytes=bs58.decode(value);if(bytes.length!==32||bytes.every(v=>v===0)||bs58.encode(bytes)!==value)fail('ADDRESS');return value;}catch{fail('ADDRESS');}}
function unsigned(value){if(typeof value!=='string'||! /^(0|[1-9]\d{0,19})$/.test(value)||BigInt(value)>U64)fail('UNITS');return BigInt(value);}
export function phoenixUsd(value){if(typeof value!=='string'||! /^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(value))fail('PRICE');const [w,f='']=value.split('.');return BigInt(w)*1000000n+BigInt(f.padEnd(6,'0'));}
function priceFraction(value){if(typeof value!=='string'||! /^(0|[1-9]\d{0,12})(\.\d{1,18})?$/.test(value))fail('PRICE');const [w,f='']=value.split('.'),scale=10n**BigInt(f.length);return {numerator:BigInt(w)*scale+BigInt(f||'0'),scale};}
function decimal(units,decimals=6){const scale=10n**BigInt(decimals),fraction=(units%scale).toString().padStart(decimals,'0').replace(/0+$/,'');return units/scale+(fraction?'.'+fraction:'');}
export function decodePhoenixCatalog(raw,{observedAt=Date.now()}={}){
 if(!Array.isArray(raw)||raw.length<1||raw.length>2000||!Number.isSafeInteger(observedAt))fail('CATALOG');const symbols=new Set(),ids=new Set(),keys=new Set();
 const markets=raw.filter(m=>m?.metadata?.assetClass==='crypto').map(m=>{
  if(typeof m.symbol!=='string'||! /^[A-Za-z0-9_-]{1,32}$/.test(m.symbol)||symbols.has(m.symbol)||!Number.isSafeInteger(m.assetId)||m.assetId<0||ids.has(m.assetId)||!Number.isSafeInteger(m.tickSize)||m.tickSize<=0||!Number.isInteger(m.baseLotsDecimals)||m.baseLotsDecimals< -12||m.baseLotsDecimals>12||typeof m.marketStatus!=='string'||!Array.isArray(m.leverageTiers)||m.leverageTiers.length<1)fail('MARKET');
  const market=phoenixKey(m.marketPubkey),spline=phoenixKey(m.splinePubkey);if(keys.has(market)||market===spline)fail('MARKET');keys.add(market);symbols.add(m.symbol);ids.add(m.assetId);
  if(typeof m.takerFee!=='number'||!Number.isFinite(m.takerFee)||m.takerFee<0||m.takerFee>0.01)fail('FEES');
  const feeMicro=Math.ceil(m.takerFee*1000000),tiers=m.leverageTiers.map(t=>{if(typeof t.maxLeverage!=='number'||!Number.isFinite(t.maxLeverage)||t.maxLeverage<1||t.maxLeverage>1000)fail('LEVERAGE');const size=typeof t.maxSizeBaseLots==='number'&&Number.isSafeInteger(t.maxSizeBaseLots)?String(t.maxSizeBaseLots):t.maxSizeBaseLots;unsigned(size);return Object.freeze({leverageTenths:Math.floor(t.maxLeverage*10),maxSizeBaseLots:size});});
  return Object.freeze({venue:'phoenix',symbol:m.symbol,assetId:m.assetId,market,spline,tickSize:String(m.tickSize),baseLotsDecimals:m.baseLotsDecimals,active:m.marketStatus==='active',feeMicro,tiers:Object.freeze(tiers)});
 });if(!markets.length)fail('CATALOG');const result=Object.freeze({venue:'phoenix',network:'solana-mainnet',observedAt,markets:Object.freeze(markets),readyForSigning:false});catalogs.add(result);return result;
}
export function planPhoenixOrder({catalog,walletAddress,symbol,side,marginUsdcUnits,leverageTenths,referencePrice,observedSlot,clientOrderId,isolatedSubaccountIndex,closeBaseLots=null,now=Date.now()}={}){
 if(!catalogs.has(catalog)||!Number.isSafeInteger(now)||catalog.observedAt>now+2000||now-catalog.observedAt>15000)fail('CATALOG_EXPIRED');phoenixKey(walletAddress);
 const market=catalog.markets.find(m=>m.symbol===symbol),close=closeBaseLots!==null;
 if(!market||(!close&&!market.active)||!['LONG','SHORT'].includes(side)||!Number.isSafeInteger(observedSlot)||observedSlot<1||observedSlot>Number.MAX_SAFE_INTEGER-30||!Number.isInteger(isolatedSubaccountIndex)||isolatedSubaccountIndex<1||isolatedSubaccountIndex>255||typeof clientOrderId!=='string'||! /^[1-9]\d{0,38}$/.test(clientOrderId)||BigInt(clientOrderId)>=2n**128n)fail('INTENT');
 const reference=priceFraction(referencePrice);if(reference.numerator===0n)fail('PRICE');
 const buy=side==='LONG',priceNumerator=reference.numerator*1000000n*BigInt(buy?10050:9950),priceDenominator=reference.scale*10000n;
 // Tick value = tickSize / base-lot quantity. Compute directly in quote units;
 // bids floor, asks ceil so rounding cannot widen the approved 0.5% bound.
 const d=market.baseLotsDecimals,baseScale=10n**BigInt(Math.max(0,d)),baseDivisor=10n**BigInt(Math.max(0,-d)),tickQuoteNumerator=BigInt(market.tickSize)*baseScale;
 const ticksNumerator=priceNumerator*baseDivisor,ticksDenominator=priceDenominator*tickQuoteNumerator;
 const ticks=buy?ticksNumerator/ticksDenominator:(ticksNumerator+ticksDenominator-1n)/ticksDenominator;
 if(ticks<1n||ticks>U64)fail('PRICE_GRID');
 let lots,margin=0n,maxNotional=0n;
 if(close){lots=unsigned(closeBaseLots);if(lots<1n)fail('CLOSE_SIZE');}
 else{
  margin=unsigned(marginUsdcUnits);if(margin<10000000n||!Number.isInteger(leverageTenths)||leverageTenths<11||leverageTenths>500)fail('MARGIN_LEVERAGE');
  maxNotional=margin*BigInt(leverageTenths)*1000000n/(10000000n+BigInt(leverageTenths)*BigInt(market.feeMicro));
  if(maxNotional>U64)fail('NOTIONAL');
  const worstNumerator=reference.numerator*1000000n*10050n,worstDenominator=reference.scale*10000n;
  const worstPriceQuote=(worstNumerator+worstDenominator-1n)/worstDenominator;lots=maxNotional*baseScale/(worstPriceQuote*baseDivisor);
  if(lots<1n||lots>U64||!market.tiers.some(t=>BigInt(t.maxSizeBaseLots)>=lots&&t.leverageTenths>=leverageTenths))fail('SIZE_TIER');
 }
 const baseUnits=d>=0?decimal(lots,d):(lots*baseDivisor).toString(),priceLimitUsd=d>=0?decimal(ticks*tickQuoteNumerator):decimal(ticks*BigInt(market.tickSize),6-d),packet=buildMarketOrderPacketFromMarketParams({side:buy?Side.Bid:Side.Ask,baseUnits,priceLimitUsd,minBaseUnitsToFill:baseUnits,numQuoteLots:close?null:maxNotional,minQuoteLotsToFill:1n,selfTradeBehavior:SelfTradeBehavior.Abort,clientOrderId:BigInt(clientOrderId),lastValidSlot:BigInt(observedSlot+30),orderFlags:close?OrderFlags.ReduceOnly:OrderFlags.None,cancelExisting:false},{tickSize:market.tickSize,baseLotsDecimals:market.baseLotsDecimals});
 if(packet.numBaseLots!==lots||packet.minBaseLotsToFill!==lots||packet.priceInTicks!==ticks||packet.cancelExisting||packet.selfTradeBehavior!==SelfTradeBehavior.Abort||packet.priceInTicks===null)fail('PACKET');
 const result=Object.freeze({stage:'PHOENIX_UNSIGNED_PLAN',readyForSigning:false,venue:'phoenix',walletAddress,symbol,side,close,isolatedSubaccountIndex,marginUsdcUnits:margin.toString(),leverageTenths:close?null:leverageTenths,maxSlippageBps:50,referencePrice,priceLimitUsd,baseLots:lots.toString(),maxNotionalUsdcUnits:close?null:maxNotional.toString(),observedSlot,expiresAt:now+15000,market,packet:Object.freeze(packet)});plans.add(result);return result;
}
export function requirePhoenixUnsignedPlan(plan){if(!plans.has(plan)||plan.readyForSigning!==false)fail('UNVERIFIED_PLAN');return plan;}
