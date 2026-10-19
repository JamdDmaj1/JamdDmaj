import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startPerpsControlService} from '../scripts/perps-control-service.mjs';

test('actual controls service binds loopback, stops cleanly and never creates custody keys or enables execution',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'jamd-controls-service-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
 const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const service=startPerpsControlService({directory,port});
 t.after(()=>service.close());await once(service.server,'listening');
 assert.equal(service.server.address().address,'127.0.0.1');
 const health=await fetch('http://127.0.0.1:'+port+'/health');
 assert.deepEqual(await health.json(),{ok:true,mode:'controls-only',tradingEnabled:false,executionAvailable:false,custodyProvisioningAvailable:false});
 const unauthenticated=await fetch('http://127.0.0.1:'+port+'/v1/automation');assert.equal(unauthenticated.status,401);await unauthenticated.arrayBuffer();
 assert.deepEqual(readdirSync(directory).filter(name=>!name.startsWith('controls.sqlite')),[]);
 const closing=service.close();assert.equal(service.close(),closing);await closing;
 assert.equal(service.server.listening,false);
});

test('service refuses execute mode, relative storage and invalid ports before opening a database',()=>{
 for(const args of [{directory:'relative'}, {directory:tmpdir(),mode:'execute'}, {directory:tmpdir(),port:80}]){
  assert.throws(()=>startPerpsControlService(args),/PERPS_CONTROL_SERVICE_NOT_CONFIGURED/);
 }
});
