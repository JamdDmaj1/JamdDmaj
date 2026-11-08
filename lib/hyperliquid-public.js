// Hyperliquid is a separate venue/account. Never publish these balances into
// the Solana portfolio or use a Markets symbol as an executable asset ID.
const ORIGINS=Object.freeze({mainnet:'https://api.hyperliquid.xyz',testnet:'https://api.hyperliquid-testnet.xyz'});
export const hyperliquidAddress=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value)?value.toLowerCase():null;
export function hlDecimal(value,{signed=false}={}){
 if(typeof value!=='string'||!(signed?/^-?(0|[1-9]\d{0,19})(\.\d{1,18})?$/:/^(0|[1-9]\d{0,19})(\.\d{1,18})?$/).test(value))throw Error('hl-invalid-decimal');
 const negative=value.startsWith('-'),[whole,part='']=(negative?value.slice(1):value).split('.');
 return (BigInt(whole)*10n**18n+BigInt(part.padEnd(18,'0')))*(negative?-1n:1n);
}
export function hlFormat(units){const negative=units<0n,v=negative?-units:units,part=(v%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');return (negative?'-':'')+(v/10n**18n)+(part?'.'+part:'');}
export function decodeHyperliquidMarkets(raw,{network='mainnet',observedAt=Date.now()}={}){
 if(!ORIGINS[network]||!Number.isSafeInteger(observedAt)||!Array.isArray(raw)||raw.length!==2||!Array.isArray(raw[0]?.universe)||!Array.isArray(raw[1])||raw[0].universe.length!==raw[1].length||raw[0].universe.length>10000)throw Error('hl-invalid-catalog');
 const seen=new Set(),markets=raw[0].universe.map((m,index)=>{
  if(!m||typeof m.name!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(m.name)||seen.has(m.name)||!Number.isInteger(m.szDecimals)||m.szDecimals<0||m.szDecimals>6||!Number.isInteger(m.maxLeverage)||m.maxLeverage<1||m.maxLeverage>1000)throw Error('hl-invalid-market');seen.add(m.name);
  const context=raw[1][index];let markPx=null;
  try{if(hlDecimal(context?.markPx)>0n)markPx=context.markPx;}catch{}
  return Object.freeze({venue:'hyperliquid',network,assetId:index,symbol:m.name,szDecimals:m.szDecimals,maxLeverage:m.maxLeverage,delisted:m.isDelisted===true,onlyIsolated:m.onlyIsolated===true||['strictIsolated','noCross'].includes(m.marginMode),markPx,observedAt});
 });return Object.freeze({venue:'hyperliquid',network,observedAt,markets:Object.freeze(markets)});
}
export function decodeHyperliquidAccount(raw,orders,user,{network='mainnet',observedAt=Date.now()}={}){
 const owner=hyperliquidAddress(user);if(!owner||!ORIGINS[network]||!Number.isSafeInteger(observedAt)||!Array.isArray(raw?.assetPositions)||!Array.isArray(orders)||raw.assetPositions.length>10000||orders.length>10000)throw Error('hl-invalid-account');
 hlDecimal(raw.marginSummary?.accountValue,{signed:true});hlDecimal(raw.marginSummary?.totalMarginUsed);hlDecimal(raw.withdrawable);
 const seen=new Set(),positions=raw.assetPositions.map(row=>{
  const p=row?.position;if(!p||typeof p.coin!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(p.coin)||seen.has(p.coin))throw Error('hl-invalid-position');seen.add(p.coin);
  const size=hlDecimal(p.szi,{signed:true});hlDecimal(p.entryPx);hlDecimal(p.marginUsed);hlDecimal(p.unrealizedPnl,{signed:true});hlDecimal(p.returnOnEquity,{signed:true});
  if(!['isolated','cross'].includes(p.leverage?.type)||!Number.isInteger(p.leverage.value)||p.leverage.value<1)throw Error('hl-invalid-leverage');
  return Object.freeze({symbol:p.coin,size:p.szi,side:size<0n?'SHORT':'LONG',entryPx:p.entryPx,marginUsed:p.marginUsed,pnl:p.unrealizedPnl,returnOnEquity:p.returnOnEquity,leverage:p.leverage.value,marginType:p.leverage.type});
 }).filter(p=>hlDecimal(p.size,{signed:true})!==0n);
 const normalizedOrders=orders.map(o=>{if(typeof o?.coin!=='string'||!Number.isSafeInteger(o.oid)||o.oid<0)throw Error('hl-invalid-orders');return Object.freeze({symbol:o.coin,oid:o.oid});});
 return Object.freeze({venue:'hyperliquid',network,user:owner,observedAt,accountValue:raw.marginSummary.accountValue,marginUsed:raw.marginSummary.totalMarginUsed,withdrawable:raw.withdrawable,positions:Object.freeze(positions),orders:Object.freeze(normalizedOrders)});
}
export function createHyperliquidPublicClient({network='mainnet',fetchImpl=globalThis.fetch,now=Date.now}={}){
 const origin=ORIGINS[network];if(!origin)throw Error('hl-network');
 async function info(body){const response=await fetchImpl(origin+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000),credentials:'omit',cache:'no-store',redirect:'error'});if(!response.ok)throw Error(response.status===429?'hl-rate-limit':'hl-unavailable');const text=await response.text();if(text.length>3000000)throw Error('hl-response-too-large');return JSON.parse(text);}
 return Object.freeze({network,async markets(){return decodeHyperliquidMarkets(await info({type:'metaAndAssetCtxs'}),{network,observedAt:now()});},async account(address){const user=hyperliquidAddress(address);if(!user)throw Error('hl-account');const [state,orders]=await Promise.all([info({type:'clearinghouseState',user}),info({type:'openOrders',user})]);return decodeHyperliquidAccount(state,orders,user,{network,observedAt:now()});},async orderStatus(address,cloid){const user=hyperliquidAddress(address);if(!user||!/^0x[0-9a-f]{32}$/.test(cloid))throw Error('hl-order');return info({type:'orderStatus',user,oid:cloid});},async activeAsset(address,coin){const user=hyperliquidAddress(address);if(!user||!/^[A-Za-z0-9_-]{1,32}$/.test(coin))throw Error('hl-market');const raw=await info({type:'activeAssetData',user,coin});if(hyperliquidAddress(raw?.user)!==user||raw.coin!==coin||!['isolated','cross'].includes(raw.leverage?.type)||!Number.isInteger(raw.leverage.value)||raw.leverage.value<1)throw Error('hl-active-asset');return Object.freeze({network,user,symbol:coin,marginType:raw.leverage.type,leverage:raw.leverage.value,observedAt:now()});},async fills(address,startTime){const user=hyperliquidAddress(address);if(!user||!Number.isSafeInteger(startTime)||startTime<0||startTime>now())throw Error('hl-fills');const result=await info({type:'userFillsByTime',user,startTime,aggregateByTime:false});if(!Array.isArray(result)||result.length>=2000)throw Error('hl-incomplete-fills');return result;}});
}
