import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,chmodSync,rmSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {openPerpsBackupRegistry,PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL} from '../lib/perps-backup-registry.js';
import {preparePausedPerpsFeeStores} from '../lib/perps-paused-fee-setup.js';
const owner='a'.repeat(64),wallet='11111111111111111111111111111111',now=Date.now();
function fixture(t,{active=false,stale=false,scope=true}={}){
 let registry;const root=mkdtempSync(join(tmpdir(),'jamd-fee-setup-test-'));chmodSync(root,0o700);t.after(()=>{registry?.close();rmSync(root,{recursive:true,force:true});});
 const lockDirectory=join(root,'locks');mkdirSync(lockDirectory,{mode:0o700});
 const controlsPath=join(root,'controls.sqlite'),journalPath=join(root,'journal.sqlite'),swapsPath=join(root,'swaps.sqlite'),feesPath=join(root,'fees.sqlite'),paymentsPath=join(root,'payments.sqlite'),registryPath=join(root,'backup.sqlite'),allowNonPosixForTests=process.platform==='win32';
 const controls=openPerpsAutomationControls(controlsPath);controls.provision({ownerAccountHash:owner,walletAddress:wallet,settings:{capital:50,loss:30,positions:1,margin:10,leverage:3,dailyTrades:5}});controls.close();
 openPerpsExecutionJournal(journalPath).close();openBotSwapJournal(swapsPath,{initialize:true,explicitOperatorApproval:true,allowNonPosixForTests}).close();
 openPerpsBackupRegistry(registryPath,{allowNonPosixForTests}).close();
 // Unfunded persistence corpus only. Production must use encrypted restore proof.
 const db=new DatabaseSync(registryPath),archive='b'.repeat(64),verified=now-(stale?1000000:1000);
 db.prepare("INSERT INTO perps_backup_challenges(archive,token_hash,created,expires,bindings,status) VALUES(?,?,?,?,?,'ACCEPTED')").run(archive,'c'.repeat(64),verified,now+86400000,JSON.stringify([{ownerAccountHash:owner,walletAddress:wallet}]));
 db.prepare('INSERT INTO perps_verified_backups(owner,wallet,archive,revision,verified) VALUES(?,?,?,?,?)').run(owner,wallet,archive,randomUUID(),verified);
 if(scope){db.exec(PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL);db.prepare('INSERT INTO perps_backup_swap_scope(archive,included) VALUES(?,1)').run(archive);}db.close();
 if(active){const c=new DatabaseSync(controlsPath);c.exec('UPDATE perps_automation_controls SET enabled=1,paused=0');c.close();}
 for(const p of [controlsPath,journalPath,swapsPath,registryPath])chmodSync(p,0o600);
 registry=openPerpsBackupRegistry(registryPath,{allowNonPosixForTests,now:()=>now});
 return {root,controlsPath,journalPath,swapsPath,feesPath,paymentsPath,lockDirectory,registry,
  input:{controlsPath,journalPath,swapsPath,feesPath,paymentsPath,lockDirectory,readBackupProof:who=>registry.readVerified(who),explicitOperatorApproval:true,now:()=>now,allowNonPosixForTests}};
}
test('paused fee setup creates exact empty stores without changing controls or reading keys',t=>{
 const f=fixture(t),before=readFileSync(f.controlsPath);const result=preparePausedPerpsFeeStores(f.input);
 assert.equal(result.tradingEnabled,false);assert.equal(result.custodyKeysRead,false);assert.equal(result.newRecoveryVerificationRequired,true);assert.deepEqual(readFileSync(f.controlsPath),before);
 assert.equal(existsSync(join(f.lockDirectory,'worker.lock')),false);
 const db=new DatabaseSync(f.feesPath,{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM perps_platform_fee_mandates').get().n,0);db.close();
 assert.throws(()=>preparePausedPerpsFeeStores(f.input));
});
for(const [name,options]of [['active account',{active:true}],['stale backup',{stale:true}],['backup without swaps',{scope:false}]])test('paused fee setup rejects '+name,t=>{
 const f=fixture(t,options);assert.throws(()=>preparePausedPerpsFeeStores(f.input));assert.equal(existsSync(f.feesPath),false);assert.equal(existsSync(join(f.lockDirectory,'worker.lock')),false);
});
test('running worker lease and partial fee store cannot be replaced',t=>{
 const f=fixture(t);writeFileSync(join(f.lockDirectory,'worker.lock'),'fixture',{mode:0o600});assert.throws(()=>preparePausedPerpsFeeStores(f.input));assert.equal(readFileSync(join(f.lockDirectory,'worker.lock'),'utf8'),'fixture');
 writeFileSync(f.feesPath,'partial',{mode:0o600});assert.throws(()=>preparePausedPerpsFeeStores(f.input));assert.equal(readFileSync(f.feesPath,'utf8'),'partial');
});
test('unbranded backup and missing operator approval cannot create stores',t=>{
 const f=fixture(t);assert.throws(()=>preparePausedPerpsFeeStores({...f.input,readBackupProof:()=>({backupVerified:true})}));
 assert.throws(()=>preparePausedPerpsFeeStores({...f.input,explicitOperatorApproval:false}));assert.equal(existsSync(f.feesPath),false);
});
