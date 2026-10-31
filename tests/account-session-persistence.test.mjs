import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {issueTrialSession,authenticateTrial} from '../lib/web-trial-session.js';
const source=await readFile(new URL('../web-trial-ui.js',import.meta.url),'utf8');
function client(plugin,initial=''){
 const memory=new Map(initial?[['jamdWebTrialSession',initial]]:[]),events=[];
 const element=()=>({setAttribute(){},replaceChildren(){},append(){},after(){}});
 const context={registerPlugin:()=>plugin,setupMarketSignalAlerts:()=>({dispose(){}}),document:{createElement:element,getElementById:id=>id==='marketTrending'?null:element(),documentElement:{lang:'en'}},
  window:{Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},dispatchEvent:e=>events.push(e.type)},
  sessionStorage:{getItem:k=>memory.get(k)||'',setItem:(k,v)=>memory.set(k,v)},MutationObserver:class{observe(){}},
  fetch:async()=>Response.json({}, {status:503}),location:{protocol:'https:',hostname:'localhost'},Event,Response,Intl,Date,AbortSignal};
 vm.createContext(context);vm.runInContext(source.replace(/^import .*;\r?$/gm, '').replaceAll('export ',''),context);
 return {trial:context.window.JamdTrial,events};
}
test('native cold start restores an encrypted-plugin session without granting account verification',async()=>{
 const token='a'.repeat(64),f=client({restore:async()=>({token}),save:async()=>{}});
 await f.trial.ready;assert.equal(f.trial.getToken(),token);assert.ok(f.events.includes('jamd-account-session-ready'));
});
test('fresh login wins over delayed restoration and missing plugin fails closed',async()=>{
 let release,saved;const token='b'.repeat(64);
 const f=client({restore:()=>new Promise(resolve=>release=resolve),save:async v=>saved=v.token});
 await f.trial.accept({token,trial:{status:'active',credits:50,expiresAt:19000}});
 release({token:'a'.repeat(64)});await f.trial.ready;assert.equal(f.trial.getToken(),token);assert.equal(saved,token);
 const old=client({restore:async()=>{throw Error('not implemented');}});await old.trial.ready;assert.equal(old.trial.getToken(),'');
});
test('two device sessions coexist on the same server account and share its quota identity',async()=>{
 const account='c'.repeat(64),records=new Map();
 const storage=async(path,commands)=>commands.map(([op,key,value])=>{
  if(op==='EVAL')return {result:JSON.stringify({status:'active',credits:50,startedAt:1000,expiresAt:19000})};
  if(op==='SET'){records.set(key,value);return {result:'OK'};}
  if(op==='GET')return {result:records.get(key)};
  assert.fail('unexpected storage command');
 });
 const pc=await issueTrialSession(account,storage),phone=await issueTrialSession(account,storage);
 assert.notEqual(pc.token,phone.token);
 for(const token of [pc.token,phone.token])assert.equal(await authenticateTrial(new Request('https://example.invalid',{headers:{authorization:'Bearer '+token}}),storage),account);
});
