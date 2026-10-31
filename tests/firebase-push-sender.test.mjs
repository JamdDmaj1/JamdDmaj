import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createPushSender} from '../lib/firebase-push-sender.js';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const credential={type:'service_account',project_id:'jamddmaj-2afc8',token_uri:'https://oauth2.googleapis.com/token',client_email:'test@jamddmaj-2afc8.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
const event={transport:'android-token',target:'test_registration_token_12345',kind:'test',body:'Test notice',eventId:'test_event_123'};
test('rejects wrong project and invalid payload before contacting Google',async()=>{
 assert.throws(()=>createPushSender({credential:{...credential,project_id:'other'}}));
 const sender=createPushSender({credential,fetchImpl:()=>{throw Error('Unexpected request');}});
 await assert.rejects(sender.send({...event,kind:'trade'}),/PUSH_INPUT/);
});
test('sends data-only messages; caches OAuth and supports web FID',async()=>{
 const calls=[];const sender=createPushSender({credential,fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes('oauth2')?{access_token:'fake-secret',expires_in:3600}:{name:'accepted'}));}});
 assert.deepEqual(await sender.send(event),{accepted:true,validationOnly:false});
 await sender.send({...event,transport:'web-fid',validateOnly:true});
 assert.equal(calls.length,3);
 const native=JSON.parse(calls[1].options.body),web=JSON.parse(calls[2].options.body);
 assert.equal(native.message.notification,undefined);assert.equal(native.message.token,event.target);
 assert.equal(web.message.fid,event.target);assert.equal(web.validate_only,true);
});
test('provider errors never expose targets or secret response details',async()=>{
 const sender=createPushSender({credential,fetchImpl:async url=>url.includes('oauth2')?new Response(JSON.stringify({access_token:'fake-secret',expires_in:3600})):new Response(JSON.stringify({error:{message:'private target',details:[{errorCode:'UNREGISTERED'}]}}),{status:404})});
 assert.deepEqual(await sender.send(event),{accepted:false,invalidTarget:true,retryable:false,code:'PUSH_REJECTED'});
});
