import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('let checkingChatSession = false;');
const end=html.indexOf('captureMemoryIntent(prompt);',start);
const code=html.slice(start,end)+'return true; }';
function fixture(status){
 const calls=[],prompt={value:'Keep my message'},images=[],files=[];
 const c={els:{prompt},pendingImages:images,pendingTextFiles:files,currentChatId:'first',activeController:null,imageGenerationMode:false,
  getApiKey:()=>'',window:{JamdTrial:{sessionStatus:typeof status==='function'?status:async()=>status}},
  openSettings:()=>calls.push('settings'),document:{querySelector:()=>({click:()=>calls.push('account')}),getElementById:()=>({scrollIntoView(){},focus(){}})},
  showToast:()=>calls.push('notice'),resolvedLanguage:()=> 'es',initGoogleAccount:async()=>calls.push('refresh')};
 vm.createContext(c);vm.runInContext(code,c);return {c,calls,prompt,images,files};
}
test('expired or missing access opens Account without consuming the composer or retrying chat',async()=>{
 for(const status of ['missing','rejected']){const f=fixture(status);assert.equal(await f.c.sendMessage(),undefined);
  assert.deepEqual(f.calls,['settings','account','notice','refresh']);assert.equal(f.prompt.value,'Keep my message');assert.equal(f.images.length,0);}
});
test('a valid verified session allows sending; a profile or unavailable verification never does',async()=>{
 assert.equal(await fixture('valid').c.sendMessage(),true);
 for(const status of ['unavailable','changed',undefined]){const f=fixture(status);assert.equal(await f.c.sendMessage(),undefined);assert.deepEqual(f.calls,['notice']);assert.equal(f.prompt.value,'Keep my message');}
 const f=fixture(async()=>{throw Error('offline');});assert.equal(await f.c.sendMessage(),undefined);assert.deepEqual(f.calls,['notice']);
});
test('duplicate clicks share the in-flight check and edits or chat changes cannot send stale content',async()=>{
 for(const change of [f=>f.prompt.value='Edited',f=>f.c.currentChatId='another',f=>f.images.push('image'),f=>f.files.push('file')]){
  let done,checks=0;const f=fixture(()=>{checks++;return new Promise(r=>done=r);});const pending=f.c.sendMessage();
  assert.equal(await f.c.sendMessage(),undefined);assert.equal(checks,1);change(f);done('valid');assert.equal(await pending,undefined);assert.deepEqual(f.calls,[]);
 }
});
test('own-key chat bypasses managed-session checks and server rejection opens recovery without retry',async()=>{
 const f=fixture(()=>assert.fail('managed session must not be consulted'));f.c.getApiKey=()=> 'own-key';assert.equal(await f.c.sendMessage(),true);
 const fetchBody=html.slice(html.indexOf('async function fetchChatCompletion('),html.indexOf('function saveApiKey('));
 assert.match(fetchBody,/failure\?\.error\?\.code === "trial-login"\) requestChatSignIn\(\)/);
 assert.equal((fetchBody.match(/await fetch\(/g)||[]).length,1);
});
