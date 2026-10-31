import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePushPreferences,pushSubscriptions} from '../lib/push-subscriptions.js';
const preferences={signals:false,alerts:[{id:'alert_123456',coin:'bitcoin',direction:'above',target:100000}]};
test('preferences reject unknown coins, repeated IDs and unauthorized signals',()=>{
 assert.deepEqual(validatePushPreferences(preferences),preferences);
 assert.throws(()=>validatePushPreferences({...preferences,signals:true}),/PUSH_SIGNALS_ACCESS/);
 assert.throws(()=>validatePushPreferences({...preferences,alerts:[preferences.alerts[0],preferences.alerts[0]]}),/PUSH_ALERT/);
 assert.throws(()=>validatePushPreferences({...preferences,alerts:[{...preferences.alerts[0],coin:'made-up'}]}),/PUSH_ALERT/);
});
test('registration is account-scoped and response does not expose delivery target',async()=>{
 let commands;const service=pushSubscriptions({now:()=>1000,storage:async(path,c)=>{commands=c;return [{result:'OK'}];}});
 const result=await service.save('a'.repeat(64),{deviceId:'device_1234567890123',transport:'android-token',target:'private_delivery_token_1234',preferences});
 assert.deepEqual(result,{enabled:true,expiresAt:2592001000});
 assert.equal(JSON.stringify(result).includes('private_delivery'),false);
 assert.equal(commands[0][0],'EVAL');assert.match(commands[0][3],/^jamd:push:device:/);
});
test('storage refusal fails closed and account cannot inject Redis key',async()=>{
 const service=pushSubscriptions({storage:async()=>[{result:'OWNER'}]});
 await assert.rejects(service.save('bad',{preferences}),/PUSH_LOGIN/);
 await assert.rejects(service.save('a'.repeat(64),{deviceId:'device_1234567890123',transport:'android-token',target:'private_delivery_token_1234',preferences}),/PUSH_STORAGE/);
});
