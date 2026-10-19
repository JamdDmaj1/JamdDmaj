#!/usr/bin/env node
// Observation service ONLY. No custody, journal, activation or submission imports.
import {openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectPerpsSignalFeed} from './inspect-perps-signal-feed.mjs';
export function observerEnvironment(env){
 if(env.JAMDDMAJ_PERPS_MODE&&env.JAMDDMAJ_PERPS_MODE!=='observe')throw Error('OBSERVER_MODE_ONLY');
 const pollMs=Number(env.JAMDDMAJ_PERPS_OBSERVER_POLL_MS??15000),statusFile=env.JAMDDMAJ_PERPS_OBSERVER_STATUS_FILE;
 const token=env.JAMDDMAJ_CLIENT_FEED_TOKEN;
 if(typeof token!=='string'||token.length<16||token.length>4096||/[\x00-\x20\x7f]/.test(token)||!Number.isSafeInteger(pollMs)||pollMs<1000||pollMs>60000||typeof statusFile!=='string'||!isAbsolute(statusFile))throw Error('OBSERVER_CONFIGURATION_INVALID');
 return {feedToken:env.JAMDDMAJ_CLIENT_FEED_TOKEN,pollMs,statusFile};
}
function persist(path,value){
 const temporary=path+'.'+randomUUID()+'.tmp',fd=openSync(temporary,'wx',0o600);
 try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temporary,path);
}
export async function runPerpsObserver({feedToken,pollMs=15000,statusFile,signal,once=false},{fetchImpl=globalThis.fetch,now=Date.now,saveStatus=persist,onChange=value=>console.log(JSON.stringify(value)),wait=delay}={}){
 if(!Number.isSafeInteger(pollMs)||pollMs<1000||pollMs>60000||typeof statusFile!=='string'||!isAbsolute(statusFile)||typeof saveStatus!=='function'||typeof onChange!=='function'||typeof wait!=='function')throw Error('OBSERVER_CONFIGURATION_INVALID');
 let previous;
 while(!signal?.aborted){
  let report;
  try{report={...await inspectPerpsSignalFeed({feedToken},{fetchImpl,now}),mode:'observe'};}
  catch{report={stage:'SIGNAL_FEED_UNAVAILABLE',available:false,observedAt:now(),mode:'observe',tradingEnabled:false,readyForSigning:false};}
  saveStatus(statusFile,report);
  const change=JSON.stringify({...report,observedAt:undefined});if(change!==previous){onChange(report);previous=change;}
  if(once)return Object.freeze(report);
  try{await wait(pollMs,undefined,{signal});}catch(error){if(signal?.aborted)return;if(error)throw Error('OBSERVER_WAIT_UNAVAILABLE');}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 try{
  if(process.argv.slice(2).some(a=>a!=='--once'))throw Error();
  await runPerpsObserver({...observerEnvironment(process.env),signal:controller.signal,once:process.argv.includes('--once')});
 }catch{console.error('PERPS_OBSERVER_UNAVAILABLE');process.exitCode=1;}
}
