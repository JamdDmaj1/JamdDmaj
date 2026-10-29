import {corsHeaders,jsonResponse} from '../lib/server.js';
import {selectTokenMarket} from '../lib/wallet-token-details.js';
export const config={runtime:'edge'};
const cache=new Map(),ttl=120000;
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(7000)});if(!response.ok)throw Error('source-unavailable');return response.json();}
export default async function handler(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
 if(request.method!=='GET')return jsonResponse(request,{error:{code:'method'}},405);
 const mint=new URL(request.url).searchParams.get('mint')||'';
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))return jsonResponse(request,{error:{code:'mint'}},400);
 const saved=cache.get(mint);if(saved&&Date.now()-saved.at<ttl)return jsonResponse(request,saved.value);
 const [dex,jupiter]=await Promise.allSettled([
  get(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`),
  get(`https://api.jup.ag/tokens/v2/search?query=${mint}`)]);
 const market=selectTokenMarket(dex.status==='fulfilled'?dex.value:[],mint);
 const metadata=jupiter.status==='fulfilled'&&Array.isArray(jupiter.value)?jupiter.value.find(item=>item.id===mint):null;
 let candles=[];
 if(market)try{
  const data=await get(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${market.pairAddress}/ohlcv/hour?aggregate=1&limit=100&currency=usd&token=base`);
  const rows=data?.data?.attributes?.ohlcv_list;
  candles=(Array.isArray(rows)?rows:[]).slice(0,100).filter(row=>Array.isArray(row)&&row.length>=6&&row.slice(0,6).every(Number.isFinite)&&row[0]>0&&row[1]>0&&row[2]>=Math.max(row[1],row[4])&&row[3]<=Math.min(row[1],row[4])&&row[3]>0&&row[5]>=0)
   .map(([time,open,high,low,close,volume])=>({time,open,high,low,close,volume})).sort((a,b)=>a.time-b.time);
 }catch{}
 const finite=value=>Number.isFinite(Number(value))&&value!=null?Number(value):null;
 const payload={ok:true,mint,network:'solana:mainnet',updatedAt:new Date().toISOString(),
  verification:{source:'Jupiter Tokens V2',status:metadata?.audit&&Object.hasOwn(metadata.audit,'isSus')?'flagged':metadata?.isVerified===true?'verified':metadata?.isVerified===false?'unverified':'unknown'},
  market:market?{pairAddress:market.pairAddress,priceUsd:finite(market.priceUsd),change24h:finite(market.priceChange?.h24),liquidityUsd:finite(market.liquidity?.usd),volume24h:finite(market.volume?.h24),source:'DEX Screener'}:null,
  candles,chartSource:candles.length?'GeckoTerminal · pool OHLCV · 1h':null};
 if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(mint,{at:Date.now(),value:payload});
 return jsonResponse(request,payload);
}
