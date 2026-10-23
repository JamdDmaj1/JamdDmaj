#!/usr/bin/env node
// Existing state only. Manual execution and bot execution have distinct flags.
import {once} from 'node:events';
import {openWebPerpsService,startWebPerpsHttpBoundary} from '../lib/perps-web-service.js';
let service,boundary;
const stop=()=>{void Promise.all([boundary?.close(),service?.close()]).catch(()=>{process.exitCode=1;});};
try{
 if(process.argv.slice(2).some(v=>v!=='--once')||process.env.JAMDDMAJ_PERPS_WEB_EXECUTION_APPROVED!==undefined&&!['true','false'].includes(process.env.JAMDDMAJ_PERPS_WEB_EXECUTION_APPROVED))throw Error();
 service=openWebPerpsService({directory:process.env.JAMDDMAJ_PERPS_RUNTIME_DIRECTORY,controlsDirectory:process.env.JAMDDMAJ_PERPS_CONTROLS_DIRECTORY,
  lockDirectory:process.env.RUNTIME_DIRECTORY,executionApproved:process.env.JAMDDMAJ_PERPS_WEB_EXECUTION_APPROVED==='true',rpcUrl:process.env.JAMDDMAJ_PERPS_RPC_URL});
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 boundary=startWebPerpsHttpBoundary(service,{port:Number(process.env.JAMDDMAJ_PERPS_WEB_PORT??8789),trustLoopbackProxy:process.env.JAMDDMAJ_PERPS_TRUST_LOOPBACK_PROXY==='true'});
 await once(boundary.server,'listening');await service.run({once:process.argv.includes('--once')});
}catch{console.error('WEB_PERPS_SERVICE_UNAVAILABLE');process.exitCode=1;}
finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);try{await Promise.all([boundary?.close(),service?.close()]);}catch{process.exitCode=1;}}
