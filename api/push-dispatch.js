import {timingSafeEqual} from 'node:crypto';
import {redisRequest} from '../lib/server.js';
import {serverPushSender} from '../lib/firebase-push-server.js';
import {pushDispatcher} from '../lib/push-dispatch.js';
import priceHandler from './token-prices.js';
import {getProServerState} from '../lib/pro-signals.js';
export const config={maxDuration:60};
async function handler(request){
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply({code:'METHOD_NOT_ALLOWED'},405);
 const expected=process.env.JAMDDMAJ_PUSH_WORKER_SECRET||'',actual=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return reply({code:'PUSH_ACCESS'},401);
 try{
  const sender=serverPushSender();
  const dispatch=pushDispatcher({storage:redisRequest,send:event=>sender.send(event),getSignals:async()=>{const state=await getProServerState();return state.open||[];},getPrices:async ids=>{
   const result={};for(let start=0;start<ids.length;start+=100){const response=await priceHandler(new Request('https://www.jamddmaj.com/api/token-prices?ids='+ids.slice(start,start+100).join(',')));if(response.ok)Object.assign(result,await response.json());}return result;
  }});
  return reply(await dispatch());
 }catch{return reply({code:'PUSH_DISPATCH_UNAVAILABLE'},503);}
}
export default {fetch:handler};
