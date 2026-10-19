import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {createPerpsCustodyProvisioner} from '../lib/perps-custody-provisioning.js';
import {createPerpsControlClient} from '../lib/perps-control-client.js';
import {setupPerpsControlPanel} from '../lib/perps-control-panel.js';
import {validateAutomationSettings} from '../lib/automation-panel.js';
import {authenticateTrial} from '../lib/web-trial-session.js';
import {hashIdentifier} from '../lib/server.js';
import {fixtureWallet as walletAddress,fixtureNow as now} from './helpers/perps-history-fixture.mjs';
const owner='a'.repeat(64),otherOwner='b'.repeat(64),token='c'.repeat(64),otherToken='d'.repeat(64),settings={capital:100,loss:50,positions:2,margin:20,leverage:3,dailyTrades:3};
async function fixture(t,overrides={}){
 const dir=mkdtempSync(join(tmpdir(),'jamd-perps-api-')),controls=openPerpsAutomationControls(join(dir,'controls.sqlite'),{now:()=>now});
 t.after(()=>{controls.close();rmSync(dir,{recursive:true,force:true});});
 const first=controls.provision({ownerAccountHash:owner,walletAddress,settings}),keys=new Map([[await hashIdentifier(token),owner],[await hashIdentifier(otherToken),otherOwner]]),authCalls=[];
 const storage=async(method,commands)=>{
  authCalls.push({method,commands});assert.equal(method,'pipeline');assert.equal(commands[0][0],'GET');
  return [{result:keys.get(commands[0][1].replace('jamd:trial:session:',''))??null}];
 };
 const authenticate=r=>authenticateTrial(r,storage),handler=createPerpsAutomationApi({controls,authenticate,rateLimit:async()=>true,...overrides});
 return {dir,controls,first,handler,authCalls,authenticate};
}
function request(body,options={}){
 return new Request('https://executor.example/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://www.jamddmaj.com',...options.headers},body:JSON.stringify(body),...options});
}
test('verified session identity, not JSON identity, governs ownership and all responses are noncacheable',async t=>{
 const f=await fixture(t),response=await f.handler(new Request('https://executor.example/v1/automation?walletAddress='+walletAddress,{headers:{Authorization:'Bearer '+token}}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');assert.equal((await response.json()).controls.enabled,false);assert.equal(f.authCalls.length,1);
 const foreign=await f.handler(new Request('https://executor.example/v1/automation?walletAddress='+walletAddress,{headers:{Authorization:'Bearer '+otherToken}}));
 assert.equal(foreign.status,403);assert.equal((await foreign.json()).error.code,'controls-unavailable');
 const forged=await f.handler(request({action:'pause',walletAddress,ownerAccountHash:owner}));assert.equal(forged.status,400);
});
test('save/review/pause run against durable controls without exposing provisioning, custody or transaction methods',async t=>{
 const f=await fixture(t),saved=await f.handler(request({action:'save',walletAddress,expectedRevision:f.first.revision,settings:{...settings,leverage:4}}));
 assert.equal(saved.status,200);const state=(await saved.json()).controls;assert.equal(state.paused,true);assert.equal(state.enabled,false);
 const review=await f.handler(request({action:'activationReview',walletAddress,expectedRevision:state.revision}));
 assert.equal(review.status,200);const approval=(await review.json()).review;assert.match(approval.token,/^[a-f0-9]{64}$/);assert.equal(approval.revision,state.revision);
 const activate=await f.handler(request({action:'activate',walletAddress,expectedRevision:approval.revision,token:approval.token,explicitApproval:true}));
 assert.equal(activate.status,503);assert.equal((await activate.json()).error.code,'execution-unavailable');
 const paused=await f.handler(request({action:'pause',walletAddress}));assert.equal(paused.status,200);assert.equal((await paused.json()).controls.enabled,false);
 for(const action of ['provision','readForExecutor','pauseForRisk','sendTransaction','closePositions'])assert.equal((await f.handler(request({action,walletAddress}))).status,400);
});
test('cookies, device IDs, unknown sessions and disabled auth stores cannot authorize a mutation',async t=>{
 const f=await fixture(t);
 for(const headers of [{Cookie:'jamddmajSession='+token},{'x-jamddmaj-device':token},{Authorization:'Bearer '+'f'.repeat(64)},{Authorization:'Bearer '+token.toUpperCase()}]){
  const response=await f.handler(request({action:'pause',walletAddress},{headers:{'Content-Type':'application/json',...headers}}));assert.equal(response.status,401);
 }
 const unavailable=await fixture(t,{authenticate:async()=>{throw Error('private redis endpoint and credential');}});
 const response=await unavailable.handler(request({action:'pause',walletAddress}));assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
});
test('origin, method, path, body size, duplicate parameters and unknown readiness fields are rejected',async t=>{
 const f=await fixture(t);
 assert.equal((await f.handler(request({action:'pause',walletAddress},{headers:{Authorization:'Bearer '+token,Origin:'https://attacker.example','Content-Type':'application/json'}}))).status,403);
 for(const method of ['DELETE','PUT','PATCH'])assert.equal((await f.handler(new Request('https://executor.example/v1/automation',{method}))).status,405);
 assert.equal((await f.handler(new Request('https://executor.example/admin'))).status,404);
 for(const body of [null,[],{action:'listForWorker'},{action:'activate',walletAddress,executionReady:true},{action:'activate',walletAddress,custodyAuthorized:true},{action:'__proto__',walletAddress},
  {action:'save',walletAddress,settings:{...settings,note:'x'.repeat(5000)}}])assert.equal((await f.handler(request(body))).status,400);
 for(const suffix of ['?walletAddress='+walletAddress+'&walletAddress='+walletAddress,'?walletAddress='+walletAddress+'&owner='+owner]){
  assert.equal((await f.handler(new Request('https://executor.example/v1/automation'+suffix,{headers:{Authorization:'Bearer '+token}}))).status,400);
 }
 const response=await f.handler(new Request('https://executor.example/v1/automation',{method:'OPTIONS',headers:{Origin:'https://localhost'}}));
 assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),'https://localhost');assert.equal(response.headers.get('access-control-allow-credentials'),null);
});
test('rate limit errors fail closed and stale/invalid settings return bounded application errors',async t=>{
 for(const rateLimit of [async()=>false,async()=>{throw Error('private limiter secret');}]){
  const f=await fixture(t,{rateLimit}),response=await f.handler(request({action:'pause',walletAddress}));assert.ok([429,503].includes(response.status));assert.equal((await response.text()).includes('secret'),false);
 }
 const f=await fixture(t);
 const saved=await f.handler(request({action:'save',walletAddress,expectedRevision:f.first.revision,settings}));assert.equal(saved.status,200);
 const stale=await f.handler(request({action:'save',walletAddress,expectedRevision:f.first.revision,settings}));assert.equal(stale.status,409);
 assert.equal((await stale.json()).error.code,'settings-changed');
 const bad=await f.handler(request({action:'save',walletAddress,expectedRevision:f.controls.readForExecutor({walletAddress}).revision,settings:{...settings,enabled:true}}));assert.equal(bad.status,400);
});

test('custody setup is unavailable by default and rejects absent consent or invalid settings before invoking a provisioner',async t=>{
 const f=await fixture(t),body={action:'provision',settings,explicitCustodyApproval:true};
 const absent=await f.handler(request(body));assert.equal(absent.status,503);assert.equal((await absent.json()).error.code,'custody-unavailable');
 let calls=0;const handler=createPerpsAutomationApi({controls:f.controls,authenticate:f.authenticate,rateLimit:async()=>true,provisionCustody:()=>{calls++;throw Error();}});
 for(const changes of [{explicitCustodyApproval:false},{explicitCustodyApproval:undefined},{settings:{...settings,margin:5}},{ownerAccountHash:otherOwner},{walletAddress}])assert.equal((await handler(request({...body,...changes}))).status,400);
 assert.equal(calls,0);
});

test('verified session provisions exactly one paused exclusive wallet across retries without exposing secrets or resetting limits',async t=>{
 const f=await fixture(t),directory=join(f.dir,'wallets'),keys=join(f.dir,'keys'),keyFile=join(keys,'master.key'),allowNonPosixForTests=process.platform==='win32';
 mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests});
 const vault=openPerpsCustodyVault({directory,keyFile,allowNonPosixForTests}),coordinator=createPerpsCustodyProvisioner({vault,controls:f.controls});
 const handler=createPerpsAutomationApi({controls:f.controls,authenticate:f.authenticate,rateLimit:args=>f.controls.consumeRequestQuota(args),provisionCustody:args=>coordinator.provision(args)});
 const body={action:'provision',settings,explicitCustodyApproval:true},headers={Authorization:'Bearer '+otherToken,'Content-Type':'application/json'};
 const response=await handler(request(body,{headers}));assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.controls.enabled,false);assert.equal(result.controls.paused,true);assert.equal(result.setup.fundingAvailable,false);assert.equal(result.setup.backupVerified,false);
 assert.equal(f.controls.readForOwner({ownerAccountHash:otherOwner}).walletAddress,result.controls.walletAddress);
 assert.equal(vault.describe({ownerAccountHash:otherOwner,walletAddress:result.controls.walletAddress}).exclusive,true);
 const retry=await handler(request({...body,settings:{...settings,leverage:5}},{headers}));assert.deepEqual(await retry.json(),result);assert.equal(readdirSync(directory).length,1);
 assert.doesNotMatch(JSON.stringify(result),/"(ciphertext|masterKey|seed|secretKey|ownerAccountHash)"\s*:/);
 const foreign=await handler(new Request('https://executor.example/v1/automation?walletAddress='+result.controls.walletAddress,{headers:{Authorization:'Bearer '+token}}));assert.equal(foreign.status,403);
 assert.equal(f.controls.readForOwner({ownerAccountHash:owner}).walletAddress,walletAddress);
});

test('app panel and fixed-origin client reach verified-session custody setup end to end using only unfunded temporary stores',async t=>{
 const f=await fixture(t),directory=join(f.dir,'wallets'),keys=join(f.dir,'keys'),keyFile=join(keys,'master.key'),allowNonPosixForTests=process.platform==='win32';
 mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});createPerpsCustodyMasterKey(keyFile,{allowNonPosixForTests});
 const coordinator=createPerpsCustodyProvisioner({vault:openPerpsCustodyVault({directory,keyFile,allowNonPosixForTests}),controls:f.controls});
 const handler=createPerpsAutomationApi({controls:f.controls,authenticate:f.authenticate,rateLimit:args=>f.controls.consumeRequestQuota(args),provisionCustody:args=>coordinator.provision(args)});
 let posts=0;const client=createPerpsControlClient({readSessionToken:()=>otherToken,validateSettings:validateAutomationSettings,fetchImpl:async(url,options)=>{
  if(url.endsWith('/health'))return Response.json({ok:true,mode:'controls-only',executionAvailable:false,tradingEnabled:false,custodyProvisioningAvailable:true});
  if(options.method==='POST')posts++;return handler(new Request(url,options));
 }});
 const node=()=>({children:[],append(...items){this.children.push(...items);},setAttribute(){}}),doc={createElement:node};
 const fields=Object.fromEntries(Object.entries(settings).map(([key,value])=>[key,{value:String(value)}]));
 const panel=setupPerpsControlPanel({panel:node(),fields,client,validateSettings:validateAutomationSettings,language:'es',doc});
 assert.equal(posts,0);assert.equal(readdirSync(directory).length,0);await panel.connect.onclick();assert.equal(panel.provision.disabled,true);
 panel.consent.checked=true;panel.consent.onchange();await panel.provision.onclick();
 assert.equal(posts,1);assert.equal(readdirSync(directory).length,1);const state=f.controls.readForOwner({ownerAccountHash:otherOwner});
 assert.ok(panel.identity.textContent.includes(state.walletAddress));assert.equal(state.enabled,false);assert.equal(state.paused,true);assert.match(panel.status.textContent,/No deposites todavía/);
 assert.equal(panel.provision.disabled,true);assert.equal(client.activate,undefined);
});
