import {corsHeaders,jsonResponse} from '../lib/server.js';
export const config={runtime:'edge'};
export default async function handler(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
 if(request.method!=='GET')return jsonResponse(request,{error:{message:'Method not allowed'}},405);
 const ids=[...new Set((new URL(request.url).searchParams.get('ids')||'').split(','))];
 if(ids.length>100||ids.some(id=>!id||id.length>120||!/^[a-z0-9_-]+$/.test(id)))return jsonResponse(request,{error:{message:'Invalid coin IDs'}},400);
 try{
  const response=await fetch('https://api.coingecko.com/api/v3/simple/price?'+new URLSearchParams({ids:ids.join(','),vs_currencies:'usd',include_last_updated_at:'true'}),{signal:AbortSignal.timeout(8000)});
  if(!response.ok)return jsonResponse(request,{error:{message:'Price provider unavailable'}},503);
  const data=await response.json(),prices={};
  for(const id of ids){const item=data[id];if(typeof item?.usd==='number'&&Number.isFinite(item.usd)&&item.usd>0)prices[id]={usd:item.usd,last_updated_at:item.last_updated_at};}
  return jsonResponse(request,prices);
 }catch{return jsonResponse(request,{error:{message:'Price request failed'}},503);}
}
