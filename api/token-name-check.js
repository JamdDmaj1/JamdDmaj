import {jsonResponse,corsHeaders} from '../lib/server.js';
import {checkedTokenName,lookupTokenName} from '../lib/token-name-check.js';
export const config={runtime:'edge'};
const cache=new Map();
export default async function handler(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
 if(request.method!=='GET')return jsonResponse(request,{error:{code:'METHOD'}},405);
 const url=new URL(request.url);let identity;
 try{identity=checkedTokenName({name:url.searchParams.get('name'),symbol:url.searchParams.get('symbol')});}catch{return jsonResponse(request,{error:{code:'TOKEN_NAME_INPUT'}},400);}
 const key=JSON.stringify(identity),saved=cache.get(key);
 if(saved&&Date.now()-saved.at<30000)return jsonResponse(request,saved.value);
 try{
  const result=await lookupTokenName(identity,{apiKey:process.env.JUPITER_API_KEY});
  if(result.status!=='unavailable'){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value:result});}
  return jsonResponse(request,result,result.status==='unavailable'?503:200);
 }catch{return jsonResponse(request,{error:{code:'TOKEN_NAME_LOOKUP_UNAVAILABLE'}},503);}
}
