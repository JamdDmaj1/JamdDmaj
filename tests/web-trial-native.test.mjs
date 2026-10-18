import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('Android quota refresh uses production API and does not require a personal provider key',async()=>{
 const source=(await readFile(new URL('../web-trial-ui.js',import.meta.url),'utf8')).replace('export const trialCopy','const trialCopy').replace('export function managedChatError','function managedChatError');
 const calls=[],node=()=>({setAttribute(){},replaceChildren(){},append(){},after(){}});
 const context={document:{createElement:node,getElementById:node,documentElement:{lang:'es'}},window:{Capacitor:{isNativePlatform:()=>true}},location:{protocol:'https:',origin:'https://localhost',hostname:'localhost'},sessionStorage:{getItem:()=> 'a'.repeat(64)},MutationObserver:class{observe(){}},Intl,Date,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({trial:{credits:50,status:'active',expiresAt:Date.now()/1000+18000}})};}};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls[0].url,'https://www.jamddmaj.com/api/trial');
 assert.equal(calls[0].options.headers.Authorization,'Bearer '+'a'.repeat(64));
});
