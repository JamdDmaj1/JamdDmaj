import {MARKETS_CATALOG} from '../lib/markets-catalog.js';
import {corsHeaders,jsonResponse} from '../lib/server.js';
export const config={runtime:'edge'};
export default function handler(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
 if(request.method!=='GET')return jsonResponse(request,{error:{message:'Method not allowed'}},405);
 return jsonResponse(request,{coins:MARKETS_CATALOG.map(asset=>({...asset,name:asset.id.replace(/-/g,' ')}))});
}
