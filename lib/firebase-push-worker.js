import {initializeApp} from 'firebase/app';
import {getMessaging,onBackgroundMessage} from 'firebase/messaging/sw';
import {firebasePushConfig} from './firebase-push-config.js';
// Data-only messages are the server protocol. No message-provided URL is followed.
const messaging=getMessaging(initializeApp(firebasePushConfig));
onBackgroundMessage(messaging,async payload=>{
 const d=payload?.data;
 if(payload.notification||!d||!['price','signal','test'].includes(d.kind)||typeof d.body!=='string'||!d.body.trim()||d.body.length>240||typeof d.eventId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(d.eventId))return;
 await self.registration.showNotification('JamdDmaj',{body:d.body,tag:d.eventId,icon:'/icon-192.png',data:{jamdPush:true},renotify:false});
});
