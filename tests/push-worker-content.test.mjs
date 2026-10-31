import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../firebase-messaging-sw.js',import.meta.url),'utf8').replace(/^import .*;$/m,'');
function worker(){
 const handlers={},notices=[],order=[];
 const self={addEventListener:(type,fn)=>{handlers[type]=fn;order.push(type);},registration:{showNotification:async(title,options)=>notices.push({title,options})}};
 vm.runInNewContext(source,{self,startFirebasePushWorker:()=>order.push('firebase')});
 return {handlers,notices,order};
}
test('push listener is synchronous and shows exact body even with visible clients',async()=>{
 const w=worker();assert.ok(w.order.indexOf('push')<w.order.indexOf('firebase'));
 let stopped=false,work;
 w.handlers.push({data:{json:()=>({data:{kind:'test',body:'Esta es una prueba de contenido.',eventId:'notice_test_123'}})},stopImmediatePropagation:()=>stopped=true,waitUntil:p=>work=p});
 await work;assert.equal(stopped,true);assert.equal(w.notices.length,1);
 assert.equal(w.notices[0].title,'JamdDmaj · Aviso de prueba');assert.equal(w.notices[0].options.body,'Esta es una prueba de contenido.');
 assert.equal(w.notices[0].options.data.jamdPush,true);
});
test('invalid pushes cannot display arbitrary actions or empty notification text',()=>{
 const w=worker();for(const data of [{kind:'trade',body:'execute',eventId:'notice_test_123'},{kind:'test',body:' ',eventId:'notice_test_123'}])w.handlers.push({data:{json:()=>({data})},stopImmediatePropagation:()=>assert.fail(),waitUntil:()=>assert.fail()});
 assert.equal(w.notices.length,0);
});
