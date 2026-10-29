import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function chatProgressText('),html.indexOf('function updateLastMessage('));
function fixture(reduced=false){const c={resolvedLanguage:()=> 'es',window:{matchMedia:()=>({matches:reduced})},DOMException,Array,Math,Promise,setTimeout};vm.createContext(c);vm.runInContext(source,c);return c;}
test('progress uses actual task labels rather than invented thinking text',()=>{
 const f=fixture();assert.match(f.chatProgressText('lookup'),/Consultando fuentes/);assert.match(f.chatProgressText('preparing'),/Preparando respuesta/);
 assert.match(html,/assistantMessage\.progress = "lookup";[\s\S]*?await buildFreeLiveContext/);
 assert.match(html,/assistantMessage\.progress = "preparing"/);
});
test('buffered visible answer is presented in order and preserves Unicode',async()=>{
 const f=fixture(),text='Hola 🙂 '.repeat(22),parts=[];const pending=f.revealAnswerText(text,x=>parts.push(x));
 assert.ok(parts.length===1&&parts.join('')!==text);await pending;assert.equal(parts.join(''),text);assert.ok(parts.length>1);
});
test('reduced motion receives the answer immediately and stopping cancels remaining presentation',async()=>{
 const text='a'.repeat(300),parts=[];await fixture(true).revealAnswerText(text,x=>parts.push(x));assert.deepEqual(parts,[text]);
 const controller=new AbortController(),stopped=[];
 await assert.rejects(fixture().revealAnswerText(text,x=>{stopped.push(x);controller.abort();},controller.signal),{name:'AbortError'});
 assert.equal(stopped.length,1);
});
test('idle facts do not interrupt existing conversations or a typed draft',()=>{
 const body=html.slice(html.indexOf('function scheduleIdleNudge()'),html.indexOf('function showIdleNudge()'));
 assert.match(body,/!els\.prompt\.value\.trim\(\)/);assert.match(body,/!getCurrentChat\(\)\?\.messages\?\.length/);
 assert.match(html,/typeof token === "string" && token\) await revealAnswerText/);
});
