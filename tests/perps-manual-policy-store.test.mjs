import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openManualPerpsPolicyStore,requireManualPerpsPolicyStore} from '../lib/perps-manual-policy-store.js';
import {validateManualPerpsLimits} from '../lib/perps-manual-limits.js';
import {fixtureWallet as walletAddress} from './helpers/perps-history-fixture.mjs';
const ownerAccountHash='a'.repeat(64),limits={capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5};
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'jamd-manual-policy-'));chmodSync(directory,0o700);const filename=join(directory,'manual.sqlite'),handles=[];
 t.after(()=>{for(const h of handles)h.close();rmSync(directory,{recursive:true,force:true});});
 const open=options=>{const store=openManualPerpsPolicyStore(filename,{allowNonPosixForTests:process.platform==='win32',now:()=>1000,...options});handles.push(store);return store;};return {filename,open};}
test('manual limits are exact, bounded and have no implicit bot defaults',()=>{
 assert.deepEqual(validateManualPerpsLimits({...limits,capitalUsd:'50.000000',dailyLossUsd:'0.000001'}),{...limits,capitalUsd:'50',dailyLossUsd:'0.000001'});
 for(const changes of [{capitalUsd:50},{capitalUsd:'9'},{dailyLossUsd:'51'},{positions:0},{positions:11},{dailyTrades:101},{dailyLossUsd:'0'},{capitalUsd:'1e3'},{botCapital:'50'}])assert.throws(()=>validateManualPerpsLimits({...limits,...changes}));
});
test('policy requires explicit initialization/approval, persists with audit and isolates account and wallet revisions',t=>{
 const f=fixture(t);assert.throws(()=>f.open());assert.equal(existsSync(f.filename),false);const store=f.open({initialize:true}),who={ownerAccountHash,walletAddress};
 assert.equal(store.read(who),null);assert.throws(()=>store.readLimits(who));assert.throws(()=>store.save({...who,limits,expectedRevision:null}));
 const state=store.save({...who,limits,expectedRevision:null,explicitApproval:true});assert.equal(state.limits.capitalUsd,'50');assert.equal(state.updatedAt,1000);
 assert.equal(store.read({...who,ownerAccountHash:'b'.repeat(64)}),null);assert.throws(()=>requireManualPerpsPolicyStore({...store}));
 const reopened=f.open();assert.deepEqual(reopened.read(who),state);assert.throws(()=>reopened.save({...who,limits,expectedRevision:null,explicitApproval:true}),/STALE_MANUAL/);
 const next=store.save({...who,limits:{...limits,dailyLossUsd:'3'},expectedRevision:state.revision,explicitApproval:true});assert.notEqual(next.revision,state.revision);assert.equal(reopened.readLimits(who).limits.dailyLossUsd,'3');
 const db=new DatabaseSync(f.filename,{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) AS count FROM perps_manual_policy_audit').get().count,2);db.close();
});
test('an existing foreign database is refused read-only without adding a schema or changing bytes',t=>{
 const f=fixture(t),db=new DatabaseSync(f.filename);db.exec('CREATE TABLE foreign_data(value TEXT);');db.close();chmodSync(f.filename,0o600);
 const before=readFileSync(f.filename);assert.throws(()=>f.open());assert.deepEqual(readFileSync(f.filename),before);
});
