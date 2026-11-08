// Pure exact-decimal protected IOC planner. Not a signature or permission.
import {hlDecimal as decimal,hlFormat as format,hyperliquidAddress} from './hyperliquid-public.js';
const SCALE=10n**18n;
const issued=new WeakSet();
export const isHyperliquidPlan=value=>!!value&&issued.has(value);
export function planHyperliquidConfiguration({catalog,account,symbol,leverage,cloid,now=Date.now()}){
 if(!recent(catalog?.observedAt,now)||!recent(account?.observedAt,now)||catalog.network!==account.network||!hyperliquidAddress(account.user)||!/^0x[0-9a-f]{32}$/.test(cloid))throw Error('hl-review-expired');
 const market=catalog.markets.find(m=>m.symbol===symbol);if(!market||market.delisted||!Number.isInteger(leverage)||leverage<1||leverage>Math.min(20,market.maxLeverage))throw Error('hl-leverage');
 if(account.positions.some(p=>p.symbol===symbol)||account.orders.some(o=>o.symbol===symbol))throw Error('hl-existing-exposure');
 const result=Object.freeze({operation:'CONFIGURE',venue:'hyperliquid',network:catalog.network,user:account.user,symbol,leverage,cloid,observedAt:now,expiresAt:now+15000,slippageBps:50,action:Object.freeze({asset:market.assetId,isCross:false,leverage})});issued.add(result);return result;
}
function recent(value,now){return Number.isSafeInteger(value)&&value<=now+2000&&now-value<=15000;}
function quantizePrice(value,szDecimals,buy){
 const integer=(value/SCALE).toString().length,significantDecimals=value>=SCALE?Math.max(0,5-integer):(()=>{let places=0,v=value;while(v<SCALE){places++;v*=10n;}return places+4;})();
 const places=Math.min(6-szDecimals,significantDecimals),step=10n**BigInt(18-places);
 // Round toward a tighter cap: buys down, sells up. Never widen 0.5%.
 return buy?value/step*step:(value+step-1n)/step*step;
}
export function planHyperliquidOrder({catalog,account,symbol,side,margin,leverage,close=false,cloid,now=Date.now()}){
 if(!Number.isSafeInteger(now)||!recent(catalog?.observedAt,now)||!recent(account?.observedAt,now)||catalog.network!==account.network||!hyperliquidAddress(account.user)||!/^0x[0-9a-f]{32}$/.test(cloid))throw Error('hl-review-expired');
 const market=catalog.markets.find(m=>m.symbol===symbol);if(!market||market.network!==account.network||!Number.isSafeInteger(market.assetId)||!market.markPx||(!close&&market.delisted))throw Error('hl-market-unavailable');
 const mark=decimal(market.markPx),position=account.positions.find(p=>p.symbol===symbol);let size,buy,requestedMargin=null;
 if(close){if(!position||account.orders.some(o=>o.symbol===symbol))throw Error('hl-close-orders-or-position');size=decimal(position.size,{signed:true});buy=size<0n;if(size<0n)size=-size;}
 else{
  if(position||account.orders.some(o=>o.symbol===symbol))throw Error('hl-existing-exposure');
  if(!['LONG','SHORT'].includes(side)||!Number.isInteger(leverage)||leverage<1||leverage>Math.min(20,market.maxLeverage))throw Error('hl-leverage');
  const budget=decimal(margin);if(budget<10n*SCALE||budget>decimal(account.withdrawable))throw Error('hl-margin');
  // Margin budget is a maximum, not a notional. Reserve 1% of it for costs
  // before preview; the venue still validates fees and collateral independently.
  requestedMargin=margin;buy=side==='LONG';size=budget*99n/100n*BigInt(leverage)*SCALE/mark;
 }
 const sizeStep=10n**BigInt(18-market.szDecimals);if(size%sizeStep!==0n&&close)throw Error('hl-invalid-close-size');size=size/sizeStep*sizeStep;if(size<=0n||(!close&&size*mark/SCALE<10n*SCALE))throw Error('hl-order-too-small');
 const price=quantizePrice(mark*(buy?10050n:9950n)/10000n,market.szDecimals,buy);if(price<=0n)throw Error('hl-price');
 const order=Object.freeze({a:market.assetId,b:buy,p:format(price),s:format(size),r:close,t:Object.freeze({limit:Object.freeze({tif:'Ioc'})}),c:cloid});
 const result=Object.freeze({venue:'hyperliquid',network:catalog.network,user:account.user,symbol,side:close?position.side:side,close,margin:requestedMargin,leverage:close?position.leverage:leverage,markPx:market.markPx,slippageBps:50,observedAt:now,expiresAt:now+15000,positionSize:position?.size??null,order});issued.add(result);return result;
}
