#!/usr/bin/env node
// Existing reviewed private state only; no bootstrap or automatic activation.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openServerPerpsRuntime,perpsWorkerEnvironment} from '../lib/perps-server-runtime.js';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let runtime;
 const stop=()=>{void runtime?.close().catch(()=>{process.exitCode=1;});};
 try{
  if(process.argv.slice(2).some(arg=>arg!=='--once'))throw Error();
  runtime=openServerPerpsRuntime(perpsWorkerEnvironment(process.env));
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  await runtime.run({once:process.argv.includes('--once')});
 }catch{console.error('PERPS_RUNTIME_UNAVAILABLE');process.exitCode=1;}
 finally{
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  try{await runtime?.close();}catch{console.error('PERPS_RUNTIME_SHUTDOWN_UNAVAILABLE');process.exitCode=1;}
 }
}
