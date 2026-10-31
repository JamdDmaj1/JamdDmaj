import {startFirebasePushWorker} from './lib/firebase-push-worker.js';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Install our display handler synchronously, before Firebase's visible-client
// routing. A remaining JamdDmaj tab must not turn a real notice into a generic
// browser fallback or silently swallow its body.
self.addEventListener('push',event=>{
 let payload;try{payload=event.data?.json();}catch{return;}
 const d=payload?.data;
 if(!d||!['price','signal','test'].includes(d.kind)||typeof d.body!=='string'||!d.body.trim()||d.body.length>240||typeof d.eventId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(d.eventId))return;
 event.stopImmediatePropagation();
 const title={test:'JamdDmaj · Aviso de prueba',price:'JamdDmaj · Alerta de precio',signal:'JamdDmaj · Nueva señal'}[d.kind];
 event.waitUntil(self.registration.showNotification(title,{body:d.body,tag:d.eventId,icon:'/icon-192.png',data:{jamdPush:true},renotify:false}));
});
// Navigation is fixed and same-origin. Clicking a notice never signs or submits a trade.
self.addEventListener('notificationclick',event=>{
 if(event.notification?.data?.jamdPush!==true)return;
 event.stopImmediatePropagation();event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL('/private-simulator.html',self.location.origin).href;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)if(client.url===target&&'focus'in client)return client.focus();
  return self.clients.openWindow(target);
 })());
});
// Firebase's maintenance listeners are installed after our synchronous handlers.
startFirebasePushWorker();
