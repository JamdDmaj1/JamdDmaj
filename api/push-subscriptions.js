import {authenticateTrial} from '../lib/web-trial-session.js';
import {corsHeaders,jsonResponse,redisRequest,hashIdentifier} from '../lib/server.js';
import {pushSubscriptions} from '../lib/push-subscriptions.js';
import {serverPushSender} from '../lib/firebase-push-server.js';
async function handler(request){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
 if(!['GET','POST'].includes(request.method))return jsonResponse(request,{code:'METHOD_NOT_ALLOWED'},405);
 try{
  const account=await authenticateTrial(request);
  const configured=process.env.JAMDDMAJ_PUSH_ENABLED==='true'&&Boolean(process.env.JAMDDMAJ_FIREBASE_SERVICE_ACCOUNT);
  if(request.method==='GET'){
   const device=new URL(request.url).searchParams.get('deviceId');let record=null;
   if(device){if(!/^[A-Za-z0-9_-]{16,100}$/.test(device))return jsonResponse(request,{code:'PUSH_REGISTRATION'},400);const id=await hashIdentifier(account+':'+device);const r=await redisRequest('pipeline',[['GET','jamd:push:device:'+id]]);if(r[0]?.error)throw Error();record=JSON.parse(r[0]?.result||'null');}
   return jsonResponse(request,{configured,enabled:configured&&Boolean(record&&record.expiresAt>Date.now()),expiresAt:record?.expiresAt||null});
  }
  const text=await request.text();if(text.length>14000)return jsonResponse(request,{code:'PUSH_INPUT_TOO_LARGE'},413);
  let input;try{input=JSON.parse(text);}catch{return jsonResponse(request,{code:'PUSH_INPUT'},400);}
  const service=pushSubscriptions({storage:redisRequest});
  if(input.action==='disable')return jsonResponse(request,await service.disable(account,input.deviceId));
  if(input.action==='test'){
   if(!configured||!/^[A-Za-z0-9_-]{16,100}$/.test(input.deviceId||''))return jsonResponse(request,{code:'PUSH_NOT_READY'},503);
   const id=await hashIdentifier(account+':'+input.deviceId);
   const r=await redisRequest('pipeline',[['GET','jamd:push:device:'+id],['SET','jamd:push:test:'+id,'1','NX','EX',60]]);
   if(r.some(x=>x.error))throw Error();if(r[1]?.result!=='OK')return jsonResponse(request,{code:'PUSH_RATE_LIMIT'},429);
   const record=JSON.parse(r[0]?.result||'null');if(!record||record.expiresAt<=Date.now())return jsonResponse(request,{code:'PUSH_NOT_REGISTERED'},409);
   const result=await serverPushSender().send({transport:record.transport,target:record.target,kind:'test',body:'JamdDmaj · Notificaciones conectadas / Notifications connected',eventId:await hashIdentifier(id+':test:'+Date.now())});
   return jsonResponse(request,{accepted:result.accepted},result.accepted?200:503);
  }
  if(input.action!=='save')return jsonResponse(request,{code:'PUSH_ACTION'},400);
  if(!configured)return jsonResponse(request,{code:'PUSH_NOT_READY'},503);
  const expected=process.env.JAMDDMAJ_TELEGRAM_DEVICE_ID||'',device=request.headers.get('x-jamddmaj-device')||'';
  return jsonResponse(request,await service.save(account,input,expected.length>=16&&device===expected));
 }catch(error){const known=/^PUSH_/.test(error.message||'');return jsonResponse(request,{code:error.status===401?'PUSH_LOGIN':known?error.message:'PUSH_UNAVAILABLE'},error.status||503);}
}
export default {fetch:handler};
