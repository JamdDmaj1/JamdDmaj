import {corsHeaders,jsonResponse} from '../lib/server.js';
export const config={runtime:'edge'};
export function parseSentiment(body,now=Date.now()){
 const row=body?.data?.[0],value=Number(row?.value),timestamp=Number(row?.timestamp)*1000;
 if(body?.metadata?.error||!row||!Number.isInteger(value)||value<0||value>100||!Number.isFinite(timestamp)||timestamp>now+300000||now-timestamp>172800000)throw Error('Unavailable sentiment');
 return {value,updatedAt:new Date(timestamp).toISOString(),source:'Alternative.me',scope:'bitcoin',sourceUrl:'https://alternative.me/crypto/fear-and-greed-index/'};
}
export default async function handler(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
 if(request.method!=='GET')return jsonResponse(request,{error:{code:'method'}},405);
 try{
  const response=await fetch('https://api.alternative.me/fng/?limit=1',{signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error();
  return jsonResponse(request,parseSentiment(await response.json()));
 }catch{return jsonResponse(request,{error:{code:'sentiment-unavailable'}},502);}
}
