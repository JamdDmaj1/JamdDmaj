import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openPhoenixVmCustody} from './helpers/phoenix-vm-custody.mjs';
import {createPhoenixManualService} from '../lib/phoenix-manual-service.js';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'jamd-phoenix-service-'));chmodSync(root,0o700);const f=await openPhoenixVmCustody(root);
 t.after(()=>{f.close();rmSync(root,{recursive:true,force:true});});let running=true,network=0;
 const unavailable=async()=>{network++;throw Error('NO_NETWORK_IN_FIXTURE');};
 const service=createPhoenixManualService({controls:f.controls,vault:f.vault,journal:f.journal,riskJournal:f.riskJournal,swapJournal:f.swapJournal,
  backupRegistry:f.backupRegistry,publicClient:{catalog:unavailable,quote:unavailable},client:{ixs:{}},readExchangeKeys:unavailable,
  rpcRequest:unavailable,sendRequest:unavailable,assertUncontended(){},isRunning:()=>running});
 return {...f,service,network:()=>network,setRunning(v){running=v;}};
}
test('service reports pending entry gates and never enables trading or sends on status/history',async t=>{
 const f=await fixture(t),who=f.identity,status=await f.service.status(who);
 assert.equal(status.entryAvailable,false);assert.equal(status.entryReason,'PHOENIX_RELEASE_GATES_PENDING');assert.equal(status.closeAvailable,true);
 assert.deepEqual((await f.service.history(who)).items,[]);assert.equal(f.network(),0);
 f.setRunning(false);assert.equal((await f.service.status(who)).closeAvailable,false);
 await assert.rejects(()=>f.service.status({...who,ownerAccountHash:'e'.repeat(64)}),/OWNERSHIP/);
 await assert.rejects(()=>f.service.prepareClose({...who,workflowId:'b'.repeat(64)}),/CUSTODY/);assert.equal(f.network(),0);
});
test('authenticated API allows only exact native actions and obtains ownership from the verified session',async t=>{
 const f=await fixture(t),api=createPerpsAutomationApi({controls:f.controls,authenticate:async()=>f.ownerAccountHash,rateLimit:async()=>true,botPhoenix:f.service});
 const call=(fields,token='f'.repeat(64))=>api(new Request('https://executor.invalid/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({action:'phoenixStatus',walletAddress:f.identity.walletAddress,...fields})}));
 const response=await call({}),body=await response.json();assert.equal(response.status,200);assert.equal(body.phoenix.walletAddress,f.identity.walletAddress);
 assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');assert.equal(JSON.stringify(body).includes(f.ownerAccountHash),false);
 assert.equal((await call({ownerAccountHash:'e'.repeat(64)})).status,400);assert.equal((await call({serializedTxBase64:'injected'})).status,400);
 assert.equal((await call({action:'phoenixClosePrepare',workflowId:'b'.repeat(64)})).status,409);
 assert.equal((await call({},'wrong')).status,401);assert.equal(f.network(),0);
 const unavailable=createPerpsAutomationApi({controls:f.controls,authenticate:async()=>f.ownerAccountHash,rateLimit:async()=>true});
 const off=await unavailable(new Request('https://executor.invalid/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+'f'.repeat(64),'Content-Type':'application/json'},body:JSON.stringify({action:'phoenixStatus',walletAddress:f.identity.walletAddress})}));
 assert.equal(off.status,503);assert.equal((await off.json()).error.code,'phoenix-unavailable');
});
