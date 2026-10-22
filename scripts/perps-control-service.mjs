#!/usr/bin/env node
// Controls and optional read-only operation status. No custody or execution
// loop; an activation request remains unavailable by default.
import {isAbsolute,resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
import {createPerpsServiceAuthenticator} from '../lib/perps-service-auth.js';
import {createPerpsControlHttpServer} from '../lib/perps-control-http.js';
import {createWebPerpsOperationStatusHandler} from '../lib/perps-web-operation-status-http.js';
export function startPerpsControlService({directory,mode='controls-only',port=8788,trustLoopbackProxy=false,webStatus=null}={}){
 if(mode!=='controls-only'||typeof directory!=='string'||!isAbsolute(directory)||!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('PERPS_CONTROL_SERVICE_NOT_CONFIGURED');
 // The owner of the persistent journals supplies genuine handles. Never open
 // a guessed path, replace a missing database or implicitly enable execution.
 let webOperationStatusHandler=null;
 if(webStatus!==null){
  if(!webStatus||Object.keys(webStatus).sort().join(',')!=='journal,limit,riskJournal')throw Error('PERPS_CONTROL_SERVICE_NOT_CONFIGURED');
  webOperationStatusHandler=createWebPerpsOperationStatusHandler(webStatus);
 }
 const controls=openPerpsAutomationControls(join(directory,'controls.sqlite'));
 const handler=createPerpsAutomationApi({controls,authenticate:createPerpsServiceAuthenticator(),rateLimit:args=>controls.consumeRequestQuota(args)});
 let server;
 try{server=createPerpsControlHttpServer({handler,trustLoopbackProxy,webOperationStatusHandler});}catch(error){controls.close();throw error;}
 let closing;
 const close=()=>closing??=new Promise((done,reject)=>{
  server.close(error=>{try{controls.close();}finally{if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')reject(error);else done();}});server.closeIdleConnections();
 });
 server.listen(port,'127.0.0.1');return {server,close};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const service=startPerpsControlService({directory:process.env.STATE_DIRECTORY||process.env.JAMDDMAJ_PERPS_CONTROL_DIRECTORY,mode:process.env.JAMDDMAJ_PERPS_SERVICE_MODE||'controls-only',trustLoopbackProxy:process.env.JAMDDMAJ_PERPS_TRUST_LOOPBACK_PROXY==='true'});
  service.server.on('error',()=>{console.error('PERPS_CONTROL_SERVICE_UNAVAILABLE');process.exitCode=1;});
  process.once('SIGTERM',()=>{void service.close().catch(()=>{process.exitCode=1;});});
  process.once('SIGINT',()=>{void service.close().catch(()=>{process.exitCode=1;});});
 }catch{console.error('PERPS_CONTROL_SERVICE_UNAVAILABLE');process.exitCode=1;}
}
