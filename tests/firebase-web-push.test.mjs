import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {safePushNotice} from '../lib/firebase-push-web.js';
import {firebasePushConfig,firebasePushVapid} from '../lib/firebase-push-config.js';
test('public Firebase web identity and VAPID point match provisioned project',()=>{
 assert.equal(firebasePushConfig.projectId,'jamddmaj-2afc8');assert.equal(firebasePushConfig.appId,'1:224373038543:web:7bab7d90aa392e3274c6ba');
 const point=Buffer.from(firebasePushVapid,'base64url');assert.equal(point.length,65);assert.equal(point[0],4);
 assert.equal(firebasePushConfig.measurementId,undefined);
});
test('push accepts bounded notices, never arbitrary actions or destinations',()=>{
 assert.deepEqual(safePushNotice({kind:'price',body:'BTC reached target',eventId:'alert_123',url:'https://evil.test'}),{kind:'price',body:'BTC reached target',eventId:'alert_123'});
 for(const data of [null,{kind:'trade',body:'execute',eventId:'alert_123'},{kind:'signal',body:'x'.repeat(241),eventId:'alert_123'},{kind:'test',body:'hi',eventId:'../evil'}])assert.equal(safePushNotice(data),null);
});
test('worker has fixed same-origin navigation, no cache or financial action',async()=>{
 const sw=await readFile(new URL('../firebase-messaging-sw.js',import.meta.url),'utf8');
 assert.match(sw,/new URL\('\/private-simulator.html',self.location.origin\)/);
 assert.doesNotMatch(sw,/caches\.|sendTransaction|signTransaction|payload\.url/);
 const build=await readFile(new URL('../scripts/build-web.mjs',import.meta.url),'utf8');assert.match(build,/entryPoints:\[resolve\(root,'firebase-messaging-sw.js'\)\][^\n]*bundle:true,format:'iife'/);
});
