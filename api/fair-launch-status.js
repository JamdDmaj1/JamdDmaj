import readiness from '../security/mainnet-readiness.json' with {type:'json'};
import {fairLaunchReadinessSummary} from '../lib/fair-launch-readiness.js';
import {corsHeaders,jsonResponse} from '../lib/server.js';
export default {async fetch(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
 if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
 return jsonResponse(request,fairLaunchReadinessSummary(readiness),200,{'X-Content-Type-Options':'nosniff'});
}};
