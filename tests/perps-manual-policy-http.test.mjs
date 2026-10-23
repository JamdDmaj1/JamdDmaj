import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openManualPerpsPolicyStore} from '../lib/perps-manual-policy-store.js';
import {createManualPerpsPolicyHandler} from '../lib/perps-manual-policy-http.js';
import {fixtureWallet as walletAddress} from './helpers/perps-history-fixture.mjs';
const limits={capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5},owner='a'.repeat(64);
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'jamd-manual-policy-http-'));chmodSync(dir,0o700);const store=openManualPerpsPolicyStore(join(dir,'policy.sqlite'),{initialize:true,allowNonPosixForTests:process.platform==='win32'});
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});let activeOwner=owner,quota=true;
 const handler=createManualPerpsPolicyHandler({store,authenticate:async()=>activeOwner,limit:async()=>quota,isExecutionAvailable:()=>false});
 return {store,handler,owner:value=>activeOwner=value,quota:value=>quota=value};}
function request(body,headers={}){return new Request('https://www.jamddmaj.com/api/perps-manual-policy',{method:'POST',headers:{Authorization:'Bearer '+'f'.repeat(64),'Content-Type':'application/json',Origin:'https://www.jamddmaj.com',...headers},body:JSON.stringify(body)});}
test('explicit manual policy save is owner-scoped, versioned and never enables execution or allocates bot funds',async t=>{
 const f=fixture(t);assert.equal((await (await f.handler(request({action:'read',walletAddress}))).json()).policy,null);
 const input={action:'save',walletAddress,expectedRevision:null,limits,explicitApproval:true};
 const response=await f.handler(request(input)),data=await response.json();assert.equal(response.status,200);assert.deepEqual(data.policy.limits,limits);assert.equal(data.executionAvailable,false);assert.equal(data.readyForSigning,false);
 assert.equal((await f.handler(request(input))).status,409);f.owner('b'.repeat(64));assert.equal((await (await f.handler(request({action:'read',walletAddress}))).json()).policy,null);
 assert.equal(f.store.read({ownerAccountHash:owner,walletAddress}).revision,data.policy.revision);
});
test('missing auth, foreign origins, body ownership, absent approval and invalid limits cannot save policy',async t=>{
 const f=fixture(t),input={action:'save',walletAddress,expectedRevision:null,limits,explicitApproval:true};
 assert.equal((await f.handler(request(input,{Authorization:''}))).status,401);
 assert.equal((await f.handler(request(input,{Origin:'https://other.invalid'}))).status,400);
 assert.equal((await f.handler(request({...input,ownerAccountHash:owner}))).status,400);
 assert.equal((await f.handler(request({...input,explicitApproval:false}))).status,400);
 assert.equal((await f.handler(request({...input,limits:{...limits,dailyLossUsd:'99'}}))).status,400);
 f.quota(false);assert.equal((await f.handler(request(input))).status,429);assert.equal(f.store.read({ownerAccountHash:owner,walletAddress}),null);
});
