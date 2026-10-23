import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openWebPerpsSubmissionJournal} from '../lib/perps-web-submission-journal.js';
import {openManualPerpsPolicyStore} from '../lib/perps-manual-policy-store.js';
import {openWebPerpsReviewDb} from '../lib/perps-web-review-db.js';
import {openWebPerpsService} from '../lib/perps-web-service.js';
import {createPerpsControlHttpServer} from '../lib/perps-control-http.js';
import {createManualPerpsRelay} from '../lib/perps-manual-relay.js';
import {createManualPerpsPolicyClient} from '../lib/perps-manual-policy-client.js';
import {once} from 'node:events';
import {fixtureWallet as walletAddress} from './helpers/perps-history-fixture.mjs';
const allowNonPosixForTests=process.platform==='win32',owner='a'.repeat(64);
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'jamd-web-service-'));chmodSync(directory,0o700);
 const lockDirectory=join(directory,'locks');mkdirSync(lockDirectory,{mode:0o700});
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 for(const [name,open] of [['controls.sqlite',p=>openPerpsAutomationControls(p)],['journal.sqlite',p=>openPerpsExecutionJournal(p)],
  ['web-submissions.sqlite',p=>openWebPerpsSubmissionJournal({filename:p})],
  ['manual-policy.sqlite',p=>openManualPerpsPolicyStore(p,{initialize:true,allowNonPosixForTests})],
  ['web-reviews.sqlite',p=>openWebPerpsReviewDb(p,{initialize:true,allowNonPosixForTests})]]){
  const path=join(directory,name);open(path).close();chmodSync(path,0o600);
 }
 const calls=[];return {directory,lockDirectory,calls,options:{directory,controlsDirectory:directory,lockDirectory,allowNonPosixForTests,
  fetchImpl:async url=>{calls.push(url);assert.equal(url,'https://www.jamddmaj.com/api/perps-identity');return Response.json({ok:true,accountHash:owner,verifiedAt:Date.now()});}}};
}
function request(body,path='/api/perps-manual-policy'){return new Request('https://www.jamddmaj.com'+path,{method:'POST',headers:{Authorization:'Bearer '+'e'.repeat(64),'Content-Type':'application/json',Origin:'https://www.jamddmaj.com'},body:JSON.stringify(body)});}
test('manual service uses existing stores, isolates limits and never opens custody or enables execution by default',async t=>{
 const f=fixture(t),service=openWebPerpsService(f.options);t.after(()=>service.close());
 assert.equal(service.executionAvailable(),false);assert.throws(()=>openWebPerpsService(f.options));
 const handler=service.manualHandlers['/api/perps-manual-policy'];
 assert.equal((await (await handler(request({action:'read',walletAddress}))).json()).policy,null);
 const result=await (await handler(request({action:'save',walletAddress,expectedRevision:null,explicitApproval:true,limits:{capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5}}))).json();
 assert.equal(result.ok,true);assert.equal(result.executionAvailable,false);assert.equal(result.readyForSigning,false);
 assert.equal((await service.manualHandlers['/api/perps-signing-review'](request({},'/api/perps-signing-review'))).status,503);
 assert.equal((await service.run({once:true})).checked,1);
 assert.equal(existsSync(join(f.directory,'keys')),false);assert.equal(existsSync(join(f.directory,'wallets')),false);
 await service.close();assert.equal(existsSync(join(f.lockDirectory,'web-service.lock')),false);
 const reopened=openWebPerpsService(f.options);try{assert.deepEqual((await (await reopened.manualHandlers['/api/perps-manual-policy'](request({action:'read',walletAddress}))).json()).policy,result.policy);}finally{await reopened.close();}
});
test('unsigned review cache is explicit, bounded, expiring and never replaces an existing foreign database',async t=>{
 const f=fixture(t),filename=join(f.directory,'cache.sqlite');let time=1000;
 assert.throws(()=>openWebPerpsReviewDb(filename,{allowNonPosixForTests}));assert.equal(existsSync(filename),false);
 const db=openWebPerpsReviewDb(filename,{initialize:true,allowNonPosixForTests,now:()=>time}),key='jamd:web-perps:review:v1:'+'b'.repeat(64);
 try{
  assert.equal(await db.command(['SET',key,'packet','EX',120,'NX']),'OK');assert.equal(await db.command(['SET',key,'changed','EX',120,'NX']),null);
  assert.equal(await db.command(['GET',key]),'packet');time=999;assert.equal(await db.command(['GET',key]),null);time=121000;assert.equal(await db.command(['GET',key]),null);
  await assert.rejects(db.command(['SET',key,'x'.repeat(8193),'EX',120,'NX']));
 }finally{db.close();}
 const foreign=join(f.directory,'foreign.sqlite'),sqlite=new DatabaseSync(foreign);sqlite.exec('CREATE TABLE preserved(value TEXT)');sqlite.close();chmodSync(foreign,0o600);
 const before=readFileSync(foreign);assert.throws(()=>openWebPerpsReviewDb(foreign,{allowNonPosixForTests}));assert.deepEqual(readFileSync(foreign),before);
});
test('actual manual client crosses the fixed relay and real loopback HTTP boundary into authenticated private storage',async t=>{
 const f=fixture(t),service=openWebPerpsService(f.options),server=createPerpsControlHttpServer({handler:async()=>new Response(null,{status:404}),manualHandlers:service.manualHandlers});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const relay=createManualPerpsRelay({path:'/api/perps-manual-policy',limit:async()=>{},fetchImpl:async(url,options)=>{
   assert.equal(url,'https://157.230.54.133/api/perps-manual-policy');return fetch('http://127.0.0.1:'+server.address().port+'/api/perps-manual-policy',options);
  }});
  const client=createManualPerpsPolicyClient({readSessionToken:()=>'e'.repeat(64),fetchImpl:(url,options)=>relay(new Request('https://www.jamddmaj.com'+url,options))});
  assert.equal((await client.read(walletAddress)).policy,null);
  const saved=await client.save({walletAddress,expectedRevision:null,explicitApproval:true,limits:{capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5}});
  assert.equal(saved.executionAvailable,false);assert.equal(saved.policy.limits.capitalUsd,'50');assert.deepEqual((await client.read(walletAddress)).policy,saved.policy);
  assert.equal(f.calls.length,3);
 }finally{server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));await service.close();}
});
