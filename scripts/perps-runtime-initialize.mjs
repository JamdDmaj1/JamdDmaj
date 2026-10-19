#!/usr/bin/env node
// Local operator only; never imported by the service entry point.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {initializeEmptyPerpsRuntime} from '../lib/perps-runtime-initialization.js';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--approve-empty-runtime')throw Error();
  console.log(JSON.stringify(initializeEmptyPerpsRuntime({directory:process.argv[3],explicitInitializationApproval:true})));
 }catch{console.error('PERPS_RUNTIME_INITIALIZATION_UNAVAILABLE');process.exitCode=1;}
}
