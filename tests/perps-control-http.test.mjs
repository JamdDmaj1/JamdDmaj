import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
import {createPerpsControlHttpServer} from '../lib/perps-control-http.js';
import {createPerpsServiceAuthenticator} from '../lib/perps-service-auth.js';
import {createPerpsSessionIdentityHandler} from '../lib/perps-session-identity.js';
import {authenticateTrial} from '../lib/web-trial-session.js';
import {fixtureWallet as walletAddress,fixtureNow as now} from './helpers/perps-history-fixture.mjs';
const owner='a'.repeat(64),token='c'.repeat(64),settings={capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3};
async function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'jamd-control-http-')),controls=openPerpsAutomationControls(join(directory,'controls.sqlite'),{now:()=>now});
 const initial=controls.provision({ownerAccountHash:owner,walletAddress,settings});let authenticationCalls=0;
 const identity=createPerpsSessionIdentityHandler({now:()=>now,authenticate:r=>authenticateTrial(r,async()=>[{result:owner}])});
 const authenticate=createPerpsServiceAuthenticator({now:()=>now,fetchImpl:async(url,options)=>{authenticationCalls++;return identity(new Request(url,options));}});
 const handler=createPerpsAutomationApi({controls,authenticate,rateLimit:args=>controls.consumeRequestQuota(args)}),server=createPerpsControlHttpServer({handler,now:()=>now});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});controls.close();rmSync(directory,{recursive:true,force:true});});
 return {controls,initial,base:'http://127.0.0.1:'+server.address().port,authCalls:()=>authenticationCalls};
}
test('real HTTP boundary -> fixed-origin session verification -> durable owner-scoped controls works without a signing capability',async t=>{
 const f=await fixture(t),headers={Authorization:'Bearer '+token,Origin:'https://www.jamddmaj.com'};
 const response=await fetch(f.base+'/v1/automation',{headers});assert.equal(response.status,200);assert.equal((await response.json()).controls.walletAddress,walletAddress);assert.equal(f.authCalls(),1);
 const saved=await fetch(f.base+'/v1/automation',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'save',walletAddress,expectedRevision:f.initial.revision,settings:{...settings,leverage:4}})});
 assert.equal(saved.status,200);const value=(await saved.json()).controls;assert.equal(value.enabled,false);assert.equal(value.paused,true);
 assert.equal(f.controls.readForOwner({ownerAccountHash:owner}).settings.leverage,4);
 assert.equal(response.headers.get('access-control-allow-origin'),'https://www.jamddmaj.com');assert.match(response.headers.get('cache-control'),/no-store/);
});
test('public health is explicit about unavailable execution and invalid requests cannot reach identity verification',async t=>{
 const f=await fixture(t),health=await fetch(f.base+'/health');assert.equal(health.status,200);
 const status=await health.json();assert.equal(status.tradingEnabled,false);assert.equal(status.executionAvailable,false);assert.equal(status.custodyProvisioningAvailable,false);assert.equal(f.authCalls(),0);
 assert.equal((await fetch(f.base+'/v1/automation')).status,401);assert.equal(f.authCalls(),0);
 assert.equal((await fetch(f.base+'/private-keys')).status,404);
 const large=await fetch(f.base+'/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'x'.repeat(5000)});
 assert.equal(large.status,413);assert.equal(f.authCalls(),0);
 const denied=await fetch(f.base+'/v1/automation',{headers:{Authorization:'Bearer '+token,Origin:'https://attacker.example'}});assert.equal(denied.status,403);assert.equal(f.authCalls(),0);
});
test('account quotas are atomic across connections, survive reopen and do not reset on backwards clocks',t=>{
 const directory=mkdtempSync(join(tmpdir(),'jamd-control-quota-')),path=join(directory,'controls.sqlite');let clock=now;
 const one=openPerpsAutomationControls(path,{now:()=>clock}),two=openPerpsAutomationControls(path,{now:()=>clock});
 t.after(()=>{one.close();two.close();rmSync(directory,{recursive:true,force:true});});
 for(let n=0;n<60;n++)assert.equal((n%2?one:two).consumeRequestQuota({ownerAccountHash:owner}),true);
 assert.equal(one.consumeRequestQuota({ownerAccountHash:owner}),false);assert.equal(two.consumeRequestQuota({ownerAccountHash:owner}),false);
 assert.equal(one.consumeRequestQuota({ownerAccountHash:'b'.repeat(64)}),true);
 clock+=60000;assert.equal(two.consumeRequestQuota({ownerAccountHash:owner}),true);clock=now;assert.equal(one.consumeRequestQuota({ownerAccountHash:owner}),false);
});

test('owner discovery never substitutes another account and rejects ambiguous custody ownership',async t=>{
 const f=await fixture(t),otherOwner='b'.repeat(64);
 assert.equal(f.controls.readForOwner({ownerAccountHash:otherOwner}),null);
 const secondWallet='11111111111111111111111111111111';
 f.controls.provision({ownerAccountHash:owner,walletAddress:secondWallet,settings});
 assert.throws(()=>f.controls.readForOwner({ownerAccountHash:owner}),/PERPS_CONTROLS_UNAVAILABLE/);
 const response=await fetch(f.base+'/v1/automation',{headers:{Authorization:'Bearer '+token}});
 assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:{code:'controls-unavailable'}});
 assert.equal(f.controls.read({ownerAccountHash:owner,walletAddress}).walletAddress,walletAddress);
});

test('HTTP preflight does not authenticate and untrusted forwarding cannot bypass the peer quota',async t=>{
 const f=await fixture(t);
 const preflight=await fetch(f.base+'/v1/automation',{method:'OPTIONS',headers:{Origin:'capacitor://localhost','Access-Control-Request-Headers':'authorization,content-type'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'capacitor://localhost');assert.equal(f.authCalls(),0);
 for(let n=1;n<120;n++){
  const response=await fetch(f.base+'/health',{headers:{'X-Forwarded-For':'192.0.2.'+(n%250+1)}});
  assert.equal(response.status,200);await response.arrayBuffer();
 }
 const limited=await fetch(f.base+'/health',{headers:{'X-Forwarded-For':'198.51.100.8'}});
 assert.equal(limited.status,429);assert.equal(f.authCalls(),0);
});
