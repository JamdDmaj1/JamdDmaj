import {initializeApp} from 'firebase/app';
import {getMessaging} from 'firebase/messaging/sw';
import {firebasePushConfig} from './firebase-push-config.js';
// Display is handled by the entry's synchronous validated push listener.
// Keep Firebase maintenance/registration listeners without a second display.
export function startFirebasePushWorker(){return getMessaging(initializeApp(firebasePushConfig));}
