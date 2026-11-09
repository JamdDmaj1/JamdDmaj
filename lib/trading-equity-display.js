// Display-only USD approximation. Never publish this as available trading funds.
import {positionDisplayMetrics} from './position-display-metrics.js';
const units=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=18446744073709551615n;
export function tradingEquityDisplay(snapshot,quotes,{now=Date.now()}={}){
 if(!Number.isSafeInteger(now)||!snapshot||!Number.isSafeInteger(snapshot.observedAt)||snapshot.observedAt>now+2000||now-snapshot.observedAt>30000
  ||!units(snapshot.availableUsdcUnits)||!units(snapshot.allocatedUsdUnits)||!Array.isArray(snapshot.positions))return null;
 if(new Set(snapshot.positions.map(p=>p.address)).size!==snapshot.positions.length)return null;
 let collateral=0n,pnl=0n,priced=0;
 for(const position of snapshot.positions){
  if(!units(position.collateralUsdUnits))return null;collateral+=BigInt(position.collateralUsdUnits);
  const quote=quotes?.get?.(position.asset)??quotes?.[position.asset],metrics=positionDisplayMetrics(position,quote,{now});
  if(metrics){pnl+=BigInt(metrics.pnlUsdUnits);priced++;}
 }
 if(collateral!==BigInt(snapshot.allocatedUsdUnits))return null;
 const complete=priced===snapshot.positions.length;
 return Object.freeze({walletUsdcUnits:snapshot.availableUsdcUnits,collateralUsdUnits:collateral.toString(),unrealizedPnlUsdUnits:complete?pnl.toString():null,
  equityUsdUnits:complete?(BigInt(snapshot.availableUsdcUnits)+collateral+pnl).toString():null,pricedPositions:priced,totalPositions:snapshot.positions.length,
  estimate:true,usdcUsdAssumption:'1',excludesFeesAndFunding:true,excludesSolAndOtherAssets:true,notAvailableToTrade:true});
}
export function captureOpenTradeShare(position,quote,snapshotObservedAt,{now=Date.now()}={}){
 if(!Number.isSafeInteger(snapshotObservedAt)||snapshotObservedAt>now+2000||now-snapshotObservedAt>30000||!/^[A-Z0-9]{2,12}$/.test(String(position?.asset??'')))return null;
 const metrics=positionDisplayMetrics(position,quote,{now});if(!metrics)return null;
 return Object.freeze({kind:'OPEN_POSITION',asset:position.asset,side:position.side,capturedAt:now,snapshotObservedAt,
  position:Object.freeze({asset:position.asset,side:position.side,priceUsdUnits:position.priceUsdUnits,sizeUsdUnits:position.sizeUsdUnits,collateralUsdUnits:position.collateralUsdUnits}),
  quote:Object.freeze({priceUsdUnits:quote.priceUsdUnits,observedAt:quote.observedAt})});
}
