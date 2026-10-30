import {initializeApp,getApps} from 'firebase/app';
import {getMessaging,isSupported,register,onRegistered,unregister,onMessage} from 'firebase/messaging';
import {firebasePushConfig,firebasePushVapid} from './firebase-push-config.js';
export const PUSH_SERVICE_WORKER='/firebase-messaging-sw.js';
// Transport only. Registration is not backend enrollment, preference sync or proven delivery.
export async function registerWebPush({win=window,onNotice=()=>{},timeout=20000}={}){
 if(!['https://www.jamddmaj.com','https://jamddmaj.com'].includes(win.location.origin)||!win.isSecureContext||!await isSupported())throw Error('PUSH_UNSUPPORTED');
 if(await win.Notification.requestPermission()!=='granted')throw Error('PUSH_PERMISSION_DENIED');
 const registration=await win.navigator.serviceWorker.register(PUSH_SERVICE_WORKER,{scope:'/',updateViaCache:'none'});
 await win.navigator.serviceWorker.ready;
 const app=getApps().find(a=>a.name==='jamddmaj-push')||initializeApp(firebasePushConfig,'jamddmaj-push'),messaging=getMessaging(app);
 let stop=()=>{},timer;
 const identity=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('PUSH_REGISTRATION_TIMEOUT')),timeout);stop=onRegistered(messaging,fid=>{
   if(typeof fid!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(fid)){reject(Error('PUSH_INVALID_REGISTRATION'));return;}
   resolve({transport:'web-fid',installationId:fid,projectId:firebasePushConfig.projectId});
 });});
 try{const [,result]=await Promise.all([register(messaging,{vapidKey:firebasePushVapid,serviceWorkerRegistration:registration}),identity]);
  const removeListener=onMessage(messaging,payload=>{const d=safePushNotice(payload?.data);if(d)onNotice(d);});
  return{...result,dispose:removeListener,unregister:async()=>{removeListener();await unregister(messaging);}};
 }catch(error){await unregister(messaging).catch(()=>{});throw error;}
 finally{clearTimeout(timer);stop();}
}
export function safePushNotice(data){
 if(!data||!['price','signal','test'].includes(data.kind)||typeof data.body!=='string'||!data.body.trim()||data.body.length>240||typeof data.eventId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(data.eventId))return null;
 return{kind:data.kind,body:data.body,eventId:data.eventId};
}
