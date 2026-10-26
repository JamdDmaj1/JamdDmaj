#!/usr/bin/env node
// Existing reviewed private state only; no bootstrap or automatic activation.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {openServerPerpsRuntime,perpsWorkerEnvironment,startServerPerpsControlBoundary} from '../lib/perps-server-runtime.js';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let runtime,boundary;
 const stop=()=>{void Promise.all([boundary?.close(),runtime?.close()]).catch(()=>{process.exitCode=1;});};
 try{
  if(process.argv.slice(2).some(arg=>!['--once','--controls','--custody-setup','--web-status','--platform-fees','--bot-swaps'].includes(arg))
    ||(process.argv.includes('--custody-setup')||process.argv.includes('--web-status'))&&!process.argv.includes('--controls'))throw Error();
  runtime=openServerPerpsRuntime({...perpsWorkerEnvironment(process.env),custodyProvisioning:process.argv.includes('--custody-setup'),existingWebStatus:process.argv.includes('--web-status'),platformFeesEnabled:process.argv.includes('--platform-fees'),botSwapsEnabled:process.argv.includes('--bot-swaps')});
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  if(process.argv.includes('--controls')){
   boundary=startServerPerpsControlBoundary(runtime,{port:Number(process.env.JAMDDMAJ_PERPS_CONTROL_PORT??8788),trustLoopbackProxy:process.env.JAMDDMAJ_PERPS_TRUST_LOOPBACK_PROXY==='true'});
   boundary.server.on('error',()=>{process.exitCode=1;stop();});await once(boundary.server,'listening');
  }
  await runtime.run({once:process.argv.includes('--once')});
 }catch{console.error('PERPS_RUNTIME_UNAVAILABLE');process.exitCode=1;}
 finally{
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  try{await Promise.all([boundary?.close(),runtime?.close()]);}catch{console.error('PERPS_RUNTIME_SHUTDOWN_UNAVAILABLE');process.exitCode=1;}
 }
}
