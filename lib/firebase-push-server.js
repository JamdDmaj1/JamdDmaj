import {createPushSender} from './firebase-push-sender.js';
let sender;
export function serverPushSender(){
 if(process.env.JAMDDMAJ_PUSH_ENABLED!=='true')throw Error('PUSH_NOT_READY');
 if(!sender){let credential;try{credential=JSON.parse(process.env.JAMDDMAJ_FIREBASE_SERVICE_ACCOUNT||'');}catch{throw Error('PUSH_CONFIGURATION');}sender=createPushSender({credential});}
 return sender;
}
