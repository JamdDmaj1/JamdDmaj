import {corsHeaders,jsonResponse} from '../lib/server.js';
export const config={runtime:'edge'};
export function normalizeDepth(data,now=Date.now()){
  const ts=Number(data?.ts);if(!Number.isFinite(ts)||now-ts>15000||ts-now>5000)throw Error('stale');
  const side=(rows,ascending)=>{
    if(!Array.isArray(rows)||!rows.length)throw Error('empty');
    return rows.slice(0,15).map(row=>{
      const price=Number(row?.[0]),quantity=Number(row?.[1]);
      if(!Number.isFinite(price)||price<=0||!Number.isFinite(quantity)||quantity<=0)throw Error('invalid');
      return {price,quantity};
    }).sort((a,b)=>ascending?a.price-b.price:b.price-a.price);
  };
  const asks=side(data.asks,true),bids=side(data.bids,false);
  if(bids[0].price>=asks[0].price)throw Error('crossed');
  return {asks,bids,updatedAt:ts};
}
export default async function handler(request){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='GET')return jsonResponse(request,{error:'Method not allowed'},405);
  const url=new URL(request.url),symbol=url.searchParams.get('symbol')||'';
  if(!/^[A-Z0-9]{2,20}USDT$/.test(symbol)||url.searchParams.getAll('symbol').length!==1)return jsonResponse(request,{error:'Invalid symbol'},400);
  try{
    const response=await fetch('https://api.bitget.com/api/v2/mix/market/merge-depth?'+new URLSearchParams({symbol,productType:'USDT-FUTURES',limit:'15',precision:'scale0'}),{signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error();const data=await response.json();if(data.code!=='00000')throw Error();
    return jsonResponse(request,{ok:true,symbol,market:'USDT-FUTURES',source:'Bitget',...normalizeDepth(data.data)},200,{'Cache-Control':'no-store'});
  }catch{return jsonResponse(request,{error:'Order book unavailable'},503,{'Cache-Control':'no-store'});}
}
