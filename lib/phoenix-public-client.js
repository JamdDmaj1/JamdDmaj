// Bounded, fixed-origin read-only Phoenix metadata. No auth/session forwarding,
// onboarding activation, signatures, deposits or send endpoints are exposed.
import {decodePhoenixCatalog} from './phoenix-market-plan.js';
import {decodePhoenixMarketQuote} from './phoenix-market-quote.js';
export function createPhoenixPublicClient({fetchImpl=globalThis.fetch,now=Date.now}={}){
 async function read(path,limit){
  const response=await fetchImpl('https://perp-api.phoenix.trade'+path,{method:'GET',headers:{Accept:'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok||response.redirected)throw Error('PHOENIX_PUBLIC_UNAVAILABLE');
  const data=await response.text();if(data.length>limit)throw Error('PHOENIX_PUBLIC_SIZE');return JSON.parse(data);
 }
 return Object.freeze({
  async catalog(){return decodePhoenixCatalog(await read('/v1/view/exchange/markets',2000000),{observedAt:now()});},
  async quote(symbol){
   if(typeof symbol!=='string'||! /^[A-Za-z0-9_-]{1,32}$/.test(symbol))throw Error('PHOENIX_QUOTE_IDENTITY');
   return decodePhoenixMarketQuote(await read('/v1/market/'+encodeURIComponent(symbol)+'/stats/latest',16000),{symbol,now:now()});
  }
 });
}
