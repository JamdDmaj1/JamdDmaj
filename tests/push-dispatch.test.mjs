import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pushDispatcher} from '../lib/push-dispatch.js';
const id='a'.repeat(32),now=1793455000000;
function fixture(options={}){
 const {signals=[],recordChanges={},testAt=null}=options,price=Object.hasOwn(options,'price')?options.price:11;
 const record={id,account:'b'.repeat(64),transport:'android-token',target:'test_delivery_token_12345',expiresAt:now+100000,signalSince:now-10000,preferences:{signals:true,alerts:[{id:'price_alert_123',coin:'bitcoin',direction:'above',target:10}]},...recordChanges};
 const sent=new Map(),calls=[];
 const storage=async(path,commands)=>commands.map(c=>{
  let result='OK';if(c[0]==='ZRANGEBYSCORE')result=[id];else if(c[0]==='GET')result=c[1].includes(':test-due:')?testAt:JSON.stringify(record);
  else if(c[0]==='SET'&&c[1].startsWith('jamd:push:sent:')){if(c.includes('NX')&&sent.has(c[1]))result=null;else sent.set(c[1],c[2]);}
  return {result};
 });
 const dispatch=pushDispatcher({storage,now:()=>now,getPrices:async()=>({bitcoin:{usd:price}}),getSignals:async()=>signals,send:async e=>{calls.push(e);return {accepted:true};}});
 return {dispatch,calls};
}
test('price is notified once across repeated worker runs',async()=>{
 const f=fixture();assert.equal((await f.dispatch()).accepted,1);assert.equal((await f.dispatch()).accepted,0);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].kind,'price');assert.match(f.calls[0].eventId,/^[a-f0-9]{32}$/);
});
test('missing or invalid prices cannot trigger a notification',async()=>{
 for(const price of [undefined,null,NaN,0,-1,'11']){const f=fixture({price});await f.dispatch();assert.equal(f.calls.length,0);}
});
test('unpublished, old or disabled Telegram signals do not notify',async()=>{
 const signals=[{id:'not-published',status:'OPEN',pair:'BTCUSDT',side:'LONG',entry:100,telegramSentAt:new Date(now).toISOString()}];
 const f=fixture({price:1,signals});await f.dispatch();assert.equal(f.calls.length,0);
});
test('only newly published authorized signal preferences generate notices',async()=>{
 const signals=[{id:'published',status:'OPEN',pair:'BTCUSDT',side:'LONG',entry:100,telegramMessageId:123,telegramSentAt:new Date(now-1000).toISOString()}];
 const f=fixture({price:1,signals});await f.dispatch();assert.equal(f.calls.length,1);assert.equal(f.calls[0].kind,'signal');
 const disabled=fixture({price:1,signals,recordChanges:{preferences:{signals:false,alerts:[]}}});await disabled.dispatch();assert.equal(disabled.calls.length,0);
});
test('scheduled test waits until due and is deduplicated',async()=>{
 const early=fixture({price:1,testAt:String(now+15000)});await early.dispatch();assert.equal(early.calls.length,0);
 const due=fixture({price:1,testAt:String(now-15000)});await due.dispatch();await due.dispatch();assert.equal(due.calls.length,1);assert.equal(due.calls[0].kind,'test');
});
