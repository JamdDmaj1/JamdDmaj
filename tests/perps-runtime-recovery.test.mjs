import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,rmSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {Encrypter,Decrypter} from 'age-encryption';
import bs58 from 'bs58';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {withLockedPerpsRuntimeRecoverySnapshot,readPerpsRuntimeRecoverySnapshot,inspectExistingPerpsRuntimeDatabases} from '../lib/perps-runtime-recovery.js';
const allowNonPosixForTests=process.platform==='win32',ownerAccountHash='e'.repeat(64),now=Date.now(),day=new Date(now).toISOString().slice(0,10);
const settings={capital:100,loss:90,positions:10,margin:10,leverage:3,dailyTrades:10};
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'jamd-runtime-test-'));chmodSync(root,0o700);
 const directory=join(root,'wallets'),keys=join(root,'keys'),keyFile=join(keys,'master.key'),operatorDirectory=join(root,'operator');
 mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});const common={allowNonPosixForTests,now:()=>now};
 createPerpsCustodyMasterKey(keyFile,common);const vault=openPerpsCustodyVault({directory,keyFile,...common}),wallet=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 const controlsPath=join(root,'controls.sqlite'),journalPath=join(root,'journal.sqlite');
 const controls=openPerpsAutomationControls(controlsPath,{now:()=>now}),initial=controls.provision({ownerAccountHash,walletAddress:wallet.walletAddress,settings});
 const approval=controls.issueActivationChallenge({ownerAccountHash,walletAddress:wallet.walletAddress,expectedRevision:initial.revision});
 controls.consumeRequestQuota({ownerAccountHash});const journal=openPerpsExecutionJournal(journalPath,{now:()=>now});
 let index=0;
 for(const [id,final]of [['reserved','RESERVED'],['signing','SIGNING'],['uncertain','UNCERTAIN'],['cancelled','CANCELLED'],['open','OPEN'],['closed','CLOSED']]){
  index++;const positionAddress=bs58.encode(Buffer.alloc(32,30+index)),exitAddress=bs58.encode(Buffer.alloc(32,60+index));
  journal.reserve({walletAddress:wallet.walletAddress,signalId:'signal-'+id,reservationId:id,marginUsd:10,positionAddress,
   entryExitPlan:{sizeUsdUnits:'30000000',exits:[{address:exitAddress,kind:'SL',sizeUsdUnits:'30000000',triggerPriceUsdUnits:'95000000',counter:String(index)}]},
   limits:{capitalUsd:100,dailyLossUsd:90,positions:10,dailyTrades:10},snapshot:{walletAddress:wallet.walletAddress,network:'solana-mainnet',balancesComplete:true,observedAt:now,day,availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0}});
  if(['SIGNING','UNCERTAIN','OPEN','CLOSED'].includes(final))journal.beginSigning(id);
  if(['UNCERTAIN','OPEN','CLOSED'].includes(final))journal.recordBroadcastIntent(id,{wireHash:'f'.repeat(64),signature:bs58.encode(Buffer.alloc(64,8+index))});
  if(final==='CANCELLED')journal.cancelUnsigned(id);
  if(['OPEN','CLOSED'].includes(final)){
   // Persistence corpus only: no fabricated receipt is passed to an execution
   // API, and every database/wallet lives in this unfunded temporary fixture.
   const raw=new DatabaseSync(journalPath);try{
    raw.prepare('UPDATE perps_reservations SET state=?,confirmed_slot=100,closed_slot=? WHERE reservation=?').run(final,final==='CLOSED'?120:null,id);
    if(final==='CLOSED')raw.prepare('INSERT INTO perps_consumed_exit_events(signature,instruction_index,inner_index,reservation) VALUES(?,?,?,?)').run(bs58.encode(Buffer.alloc(64,100)),0,1,id);
   }finally{raw.close();}
  }
 }
 for(const path of [controlsPath,journalPath])chmodSync(path,0o600);
 // Deliberately active unfunded fixture: restoration must override this state,
 // not merely rely on the original controls already being paused.
 const raw=new DatabaseSync(controlsPath);raw.prepare("UPDATE perps_automation_controls SET enabled=1,paused=0,risk_day=?,risk_loss_units='12000000'").run(day);raw.close();
 const restoredStores=[];t.after(()=>{for(const store of restoredStores)store.close();controls.close();journal.close();rmSync(root,{recursive:true,force:true});});
 const operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 const runtimePaths={controlsPath,journalPath,temporaryDirectory:root};
 const request={directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,runtimePaths,...common};
 const restore={operatorDirectory,destinationDirectory:join(root,'restored'),explicitOperatorApproval:true,...common};
 return {root,directory,keyFile,controls,journal,controlsPath,journalPath,initial,approval,operator,vault,wallet,request,restore,runtimePaths,common,restoredStores};
}
async function mutateArchive(f,archive,mutate){
 const decrypt=new Decrypter();decrypt.addIdentity(readFileSync(f.operator.identityFile,'utf8').trim());
 const payload=JSON.parse(new TextDecoder().decode(await decrypt.decrypt(archive.ciphertext)));await mutate(payload);
 const encrypt=new Encrypter();encrypt.addRecipient(f.operator.recipient);return encrypt.encrypt(new TextEncoder().encode(JSON.stringify(payload)));
}

test('complete encrypted recovery preserves all reservation states, limits, risk markers and quota while forcing a fresh pause',async t=>{
 const f=await fixture(t),before=f.controls.read({ownerAccountHash,walletAddress:f.wallet.walletAddress});assert.equal(before.enabled,true);
 const archive=await createPerpsCustodyRecoveryArchive(f.request);assert.equal(archive.runtimeStateIncluded,true);assert.equal(archive.backupVerified,false);
 assert.deepEqual(f.controls.read({ownerAccountHash,walletAddress:f.wallet.walletAddress}),before);
 const restored=await restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext:archive.ciphertext});assert.equal(restored.runtimeStateIncluded,true);assert.equal(restored.readyForSigning,false);
 const controls=openPerpsAutomationControls(join(restored.runtimeDirectory,'controls.sqlite'),{now:()=>now}),journal=openPerpsExecutionJournal(join(restored.runtimeDirectory,'journal.sqlite'),{now:()=>now});
 f.restoredStores.push(controls,journal);
 const state=controls.read({ownerAccountHash,walletAddress:f.wallet.walletAddress});assert.equal(state.enabled,false);assert.equal(state.paused,true);assert.equal(state.reason,'RESTORE_REVIEW_REQUIRED');
 assert.notEqual(state.revision,f.initial.revision);assert.deepEqual(state.settings,before.settings);assert.equal(state.riskDay,day);assert.equal(state.riskLossUsdcUnits,'12000000');
 for(const id of ['reserved','signing','uncertain','cancelled','open','closed'])assert.deepEqual(journal.read(id),f.journal.read(id));
 assert.equal(journal.riskState(f.wallet.walletAddress).pendingMarginUsdcUnits,'30000000');
 assert.throws(()=>journal.cancelUnsigned('uncertain'),/RECONCILIATION_REQUIRED/);
 const raw=new DatabaseSync(join(restored.runtimeDirectory,'controls.sqlite'),{readOnly:true});
 try{const row=raw.prepare('SELECT challenge_hash,challenge_issued,challenge_expires FROM perps_automation_controls').get();assert.deepEqual({...row},{challenge_hash:null,challenge_issued:null,challenge_expires:null});assert.equal(raw.prepare('SELECT count FROM perps_control_request_quota').get().count,1);}finally{raw.close();}
 assert.equal(controls.audit({ownerAccountHash,walletAddress:f.wallet.walletAddress})[0].action,'RESTORE_AND_PAUSE');
 const history=new DatabaseSync(join(restored.runtimeDirectory,'journal.sqlite'));try{
  assert.equal(history.prepare('SELECT COUNT(*) AS n FROM perps_exit_request_bindings').get().n,6);
  const event=history.prepare('SELECT * FROM perps_consumed_exit_events').get();assert.equal(event.reservation,'closed');
  assert.throws(()=>history.prepare('INSERT INTO perps_consumed_exit_events(signature,instruction_index,inner_index,reservation) VALUES(?,?,?,?)').run(event.signature,event.instruction_index,event.inner_index,'open'),/UNIQUE/);
 }finally{history.close();}
 assert.equal(openPerpsCustodyVault({...restored,...f.common}).describe(f.wallet).exclusive,false);
 assert.equal(readdirSync(f.root).some(name=>name.startsWith('jamd-runtime-recovery-')),false);
});

test('snapshot locks both source databases, includes committed WAL rows and releases locks and private handles on completion',async t=>{
 const f=await fixture(t);let captured;
 await withLockedPerpsRuntimeRecoverySnapshot({...f.runtimePaths,...f.common},async handle=>{
  captured=handle;assert.equal(readPerpsRuntimeRecoverySnapshot(handle).length,2);
  assert.throws(()=>readPerpsRuntimeRecoverySnapshot({...handle}));
  for(const path of [f.controlsPath,f.journalPath]){const db=new DatabaseSync(path,{timeout:0});try{assert.throws(()=>db.exec('BEGIN IMMEDIATE'),/locked/);}finally{db.close();}}
 });
 assert.throws(()=>readPerpsRuntimeRecoverySnapshot(captured));
 for(const path of [f.controlsPath,f.journalPath]){const db=new DatabaseSync(path,{timeout:0});try{db.exec('BEGIN IMMEDIATE;ROLLBACK;');}finally{db.close();}}
});

test('encrypted recovery preserves uncertain cancellation identities and the startup gate refuses automatic legacy migration',async t=>{
 for(const state of ['PREPARED','SIGNING','UNCERTAIN']){
  const f=await fixture(t),raw=new DatabaseSync(f.journalPath),parent=f.journal.read('open'),address=JSON.parse(parent.entry_exit_plan).exits[0].address;
  raw.prepare('INSERT INTO perps_exit_cancellations(id,address,reservation,wallet,state,created,updated,fee_lamports,wire_hash,signature,unsigned_wire_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run('recovery-cancel',address,'open',f.wallet.walletAddress,state,now,now,15200,state==='UNCERTAIN'?'a'.repeat(64):null,state==='UNCERTAIN'?bs58.encode(Buffer.alloc(64,80)):null,'c'.repeat(64));raw.close();
  const archive=await createPerpsCustodyRecoveryArchive(f.request),restored=await restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext:archive.ciphertext});
  const store=openPerpsExecutionJournal(join(restored.runtimeDirectory,'journal.sqlite'),{now:()=>now});f.restoredStores.push(store);
  assert.deepEqual(store.readExitCancellation('recovery-cancel'),f.journal.readExitCancellation('recovery-cancel'));
  assert.equal(store.pendingExitCancellations(f.wallet.walletAddress).length,1);assert.equal(store.read('open').state,'OPEN');
 }
 const f=await fixture(t),raw=new DatabaseSync(f.journalPath);raw.exec('DROP TABLE perps_exit_cancellations');raw.close();
 assert.throws(()=>inspectExistingPerpsRuntimeDatabases({...f.runtimePaths,...f.common}));
 const check=new DatabaseSync(f.journalPath,{readOnly:true});assert.equal(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='perps_exit_cancellations'").get().n,0);check.close();
 // A recognized old archive remains recoverable; startup itself never upgrades it.
 const archive=await createPerpsCustodyRecoveryArchive(f.request);assert.equal(archive.runtimeStateIncluded,true);
 const restored=await restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext:archive.ciphertext});assert.equal(restored.readyForSigning,false);
});

test('backup lock contention never changes live policy and releases previously acquired locks after failure',async t=>{
 const f=await fixture(t),db=new DatabaseSync(f.journalPath);db.exec('BEGIN IMMEDIATE');
 try{await assert.rejects(createPerpsCustodyRecoveryArchive(f.request));}finally{db.exec('ROLLBACK');db.close();}
 assert.equal(f.controls.read({ownerAccountHash,walletAddress:f.wallet.walletAddress}).enabled,true);
 const next=new DatabaseSync(f.controlsPath,{timeout:0});try{next.exec('BEGIN IMMEDIATE;ROLLBACK;');}finally{next.close();}
 assert.equal(readdirSync(f.root).some(name=>name.startsWith('jamd-runtime-recovery-')),false);
});

test('unknown schema objects and journal wallets without matching custody/control ownership cannot be backed up',async t=>{
 const f=await fixture(t),db=new DatabaseSync(f.journalPath);
 try{
  db.exec('CREATE TABLE unexpected_secret(value TEXT)');await assert.rejects(createPerpsCustodyRecoveryArchive(f.request));db.exec('DROP TABLE unexpected_secret');
  db.prepare('UPDATE perps_reservations SET wallet=? WHERE reservation=?').run(bs58.encode(Buffer.alloc(32,17)),'reserved');await assert.rejects(createPerpsCustodyRecoveryArchive(f.request));
 }finally{db.close();}
 assert.equal(existsSync(f.restore.destinationDirectory),false);
});

test('corrupt or incomplete runtime databases are rejected before any custody keys reach the restore destination',async t=>{
 const f=await fixture(t),archive=await createPerpsCustodyRecoveryArchive(f.request);
 for(const mutate of [p=>{p.runtimeDatabases.pop();},p=>{p.runtimeDatabases[0].sha256='0'.repeat(64);},p=>{p.runtimeDatabases[0].kind='../controls';},p=>{
  const bytes=Buffer.from(p.runtimeDatabases[0].data,'base64');bytes[0]^=1;p.runtimeDatabases[0].data=bytes.toString('base64');p.runtimeDatabases[0].sha256=createHash('sha256').update(bytes).digest('hex');
 }]){
  const ciphertext=await mutateArchive(f,archive,mutate);await assert.rejects(restorePerpsCustodyRecoveryArchive({...f.restore,ciphertext}));assert.equal(existsSync(f.restore.destinationDirectory),false);
 }
});

test('Windows operator can restore a complete archive with actual restricted ACLs, without a permission-test override',{skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t),operator=await initializePerpsOperatorRecovery({directory:join(f.root,'private-operator')});
 const archive=await createPerpsCustodyRecoveryArchive({...f.request,recipient:operator.recipient});
 const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory:join(f.root,'private-operator'),destinationDirectory:join(f.root,'private-operator','restored'),explicitOperatorApproval:true,now:()=>now});
 assert.equal(restored.runtimeStateIncluded,true);assert.equal(restored.readyForSigning,false);
 const raw=new DatabaseSync(join(restored.runtimeDirectory,'controls.sqlite'),{readOnly:true});try{assert.equal(raw.prepare('SELECT paused FROM perps_automation_controls').get().paused,1);}finally{raw.close();}
});
