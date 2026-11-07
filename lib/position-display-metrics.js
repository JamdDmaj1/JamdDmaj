// Indicative display math only. Never accepted as signing or settlement evidence.
const uint=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value)&&BigInt(value)<=18446744073709551615n;
export function positionDisplayMetrics(position,quote,{now=Date.now()}={}){
 if(!position||!['LONG','SHORT'].includes(position.side)||!['priceUsdUnits','sizeUsdUnits','collateralUsdUnits'].every(k=>uint(position[k]))
  ||!quote||!uint(quote.priceUsdUnits)||!Number.isSafeInteger(quote.observedAt)||!Number.isSafeInteger(now)||quote.observedAt>now+2000||now-quote.observedAt>15000)return null;
 const entry=BigInt(position.priceUsdUnits),mark=BigInt(quote.priceUsdUnits),size=BigInt(position.sizeUsdUnits),margin=BigInt(position.collateralUsdUnits);
 if(!entry||!mark||!size||!margin)return null;
 const movement=mark-entry,pnl=size*movement*(position.side==='LONG'?1n:-1n)/entry;
 return Object.freeze({pnlUsdUnits:pnl.toString(),roeBasisPoints:(pnl*10000n/margin).toString(),priceMoveBasisPoints:(movement*10000n/entry).toString(),leverageHundredths:(size*100n/margin).toString(),markPriceUsdUnits:mark.toString(),observedAt:quote.observedAt,estimate:true,excludesFeesAndFunding:true});
}
export function displayUsdDecimal(units){const n=BigInt(units),abs=n<0n?-n:n,s=abs.toString().padStart(7,'0');return (n<0n?'-':'')+s.slice(0,-6)+'.'+s.slice(-6);}
