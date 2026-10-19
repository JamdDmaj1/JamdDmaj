import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openPerpsBackupRegistry,requireVerifiedPerpsCustodyBackup} from '../lib/perps-backup-registry.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive,readPerpsCustodyRecoveryChallenge} from '../lib/perps-custody-recovery.js';
const allowNonPosixForTests=process.platform==='win32',ownerAccountHash='a'.repeat(64);
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'jamd-backup-proof-'));chmodSync(root,0o700);
 const directory=join(root,'wallets'),keys=join(root,'keys'),keyFile=join(keys,'master.key'),operatorDirectory=join(root,'operator');
 mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});const clock={wall:Date.now(),mono:0},common={allowNonPosixForTests,now:()=>clock.wall,monotonicNow:()=>clock.mono};
 createPerpsCustodyMasterKey(keyFile,common);const vault=openPerpsCustodyVault({directory,keyFile,...common}),identity=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 const controlsPath=join(root,'controls.sqlite'),journalPath=join(root,'journal.sqlite'),registryPath=join(root,'backup.sqlite');
 const controls=openPerpsAutomationControls(controlsPath,common);controls.provision({...identity,settings:{capital:100,loss:50,positions:2,margin:10,leverage:3,dailyTrades:5}});
 const journal=openPerpsExecutionJournal(journalPath,common);for(const path of [controlsPath,journalPath])chmodSync(path,0o600);
 const registries=[],open=()=>{const registry=openPerpsBackupRegistry(registryPath,common);registries.push(registry);return registry;},registry=open();
 t.after(()=>{for(const r of registries)try{r.close();}catch{}controls.close();journal.close();rmSync(root,{recursive:true,force:true});});
 const operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 const request={directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,requireRestoreProof:true,runtimePaths:{controlsPath,journalPath,temporaryDirectory:root},...common};
 let count=0;
 async function archive(){const value=await createPerpsCustodyRecoveryArchive(request);await registry.registerArchive(value,{explicitOperatorApproval:true});return value;}
 async function restore(value){return restorePerpsCustodyRecoveryArchive({ciphertext:value.ciphertext,operatorDirectory,destinationDirectory:join(root,'restored-'+(++count)),explicitOperatorApproval:true,...common});}
 return {root,directory,keyFile,journalPath,operator,clock,common,vault,identity,registry,registryPath,controlsPath,open,request,archive,restore,controls};
}
test('only a complete encrypted archive restored with the matching operator identity can prove custody backup',async t=>{
 const f=await fixture(t),archive=await f.archive();assert.throws(()=>f.registry.readVerified(f.identity));
 assert.throws(()=>readPerpsCustodyRecoveryChallenge({...archive}));assert.equal(archive.verificationToken,undefined);
 const restored=await f.restore(archive);assert.ok(restored.proofFile);assert.equal(restored.tradingEnabled,false);assert.equal(restored.readyForSigning,false);
 const proofFile=JSON.parse(readFileSync(restored.proofFile,'utf8'));assert.equal(JSON.stringify(restored).includes(proofFile.verificationToken),false);
 assert.throws(()=>f.registry.acceptRestoreProof({proofFile:restored.proofFile}));
 const accepted=f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});assert.equal(accepted.backupVerified,true);assert.equal(accepted.readyForSigning,false);
 const proof=f.registry.readVerified(f.identity);assert.equal(requireVerifiedPerpsCustodyBackup(proof,f.identity),proof);assert.throws(()=>requireVerifiedPerpsCustodyBackup({...proof},f.identity));
 assert.throws(()=>requireVerifiedPerpsCustodyBackup(proof,{...f.identity,ownerAccountHash:'b'.repeat(64)}));
 assert.equal(openPerpsCustodyVault({...restored,...f.common}).describe(f.identity).exclusive,false);assert.equal(f.controls.read(f.identity).enabled,false);
});
test('hash/token, owner/wallet, timestamps and archive mismatches cannot produce a verified registry entry',async t=>{
 const f=await fixture(t),archive=await f.archive(),restored=await f.restore(archive),original=JSON.parse(readFileSync(restored.proofFile,'utf8'));
 let i=0;for(const mutate of [p=>{p.verificationToken='0'.repeat(64);},p=>{p.archiveSha256='f'.repeat(64);},p=>{p.bindings[0].ownerAccountHash='b'.repeat(64);},p=>{p.createdAt++;},p=>{p.restoredAt=f.clock.wall+2001;},p=>{p.extra=true;}]){
  const value=structuredClone(original);mutate(value);const file=join(f.root,'invalid-'+(++i)+'.json');writeFileSync(file,JSON.stringify(value),{mode:0o600});
  assert.throws(()=>f.registry.acceptRestoreProof({proofFile:file,explicitOperatorApproval:true}));assert.throws(()=>f.registry.readVerified(f.identity));
 }
});
test('verification persists across registry reopen while revocation immediately invalidates existing private proof handles',async t=>{
 const f=await fixture(t),archive=await f.archive(),restored=await f.restore(archive);f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
 const other=f.open(),proof=other.readVerified(f.identity);assert.equal(proof.archiveSha256,archive.sha256);
 f.registry.revokeArchive({archiveSha256:archive.sha256,explicitOperatorApproval:true});assert.throws(()=>requireVerifiedPerpsCustodyBackup(proof,f.identity));assert.throws(()=>other.readVerified(f.identity));
 assert.throws(()=>f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true}));
});
test('an expired pending challenge or plain keys-only/runtime-only backup never grants readiness',async t=>{
 const f=await fixture(t),archive=await f.archive(),restored=await f.restore(archive);f.clock.wall+=86400000;
 assert.throws(()=>f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true}));
 for(const runtimePaths of [null,f.request.runtimePaths]){
  const older=await createPerpsCustodyRecoveryArchive({...f.request,runtimePaths,requireRestoreProof:false});
  await assert.rejects(f.registry.registerArchive(older,{explicitOperatorApproval:true}));
 }
 await assert.rejects(createPerpsCustodyRecoveryArchive({...f.request,runtimePaths:null}));assert.throws(()=>f.registry.readVerified(f.identity));
});
test('private proof leases expire and old accepted receipts cannot roll the registry back after a newer restore',async t=>{
 const f=await fixture(t),first=await f.archive(),one=await f.restore(first);f.registry.acceptRestoreProof({proofFile:one.proofFile,explicitOperatorApproval:true});
 const old=f.registry.readVerified(f.identity);f.clock.mono=2001;assert.throws(()=>requireVerifiedPerpsCustodyBackup(old,f.identity));
 const second=await f.archive(),two=await f.restore(second);f.registry.acceptRestoreProof({proofFile:two.proofFile,explicitOperatorApproval:true});
 const maintenance=new DatabaseSync(f.registryPath);try{maintenance.exec('VACUUM');}finally{maintenance.close();}
 assert.throws(()=>f.registry.acceptRestoreProof({proofFile:one.proofFile,explicitOperatorApproval:true}));assert.equal(f.registry.readVerified(f.identity).archiveSha256,second.sha256);
 const proof=f.registry.readVerified(f.identity);f.registry.close();assert.throws(()=>requireVerifiedPerpsCustodyBackup(proof,f.identity));
});

test('a mistaken controls database, altered registry schema or loosened permissions never grants backup authority',async t=>{
 const f=await fixture(t);assert.throws(()=>openPerpsBackupRegistry(f.controlsPath,f.common));
 const controls=new DatabaseSync(f.controlsPath,{readOnly:true});try{assert.equal(controls.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='perps_backup_challenges'").get().n,0);}finally{controls.close();}
 const archive=await f.archive(),restored=await f.restore(archive);f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
 if(process.platform!=='win32'){chmodSync(f.registryPath,0o644);assert.throws(()=>f.registry.readVerified(f.identity));chmodSync(f.registryPath,0o600);}
 const db=new DatabaseSync(f.registryPath);try{db.exec('CREATE TABLE unexpected_registry_data(value TEXT)');assert.throws(()=>f.registry.readVerified(f.identity));}finally{db.close();}
});

test('operator archive and verify commands produce only encrypted output and public status, never activation',{skip:process.platform==='win32'},async t=>{
 const f=await fixture(t),cli=process.env.JAMDDMAJ_TEST_RECOVERY_OPERATOR_CLI||fileURLToPath(new URL('../scripts/perps-recovery-operator.mjs',import.meta.url));
 const registryPath=join(f.root,'cli-registry.sqlite'),output=join(f.root,'cli-backup.age');
 const run=args=>JSON.parse(execFileSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:15000,maxBuffer:8192,stdio:['ignore','pipe','pipe']}));
 const status=run(['archive','--directory',f.directory,'--key-file',f.keyFile,'--controls',f.controlsPath,'--journal',f.journalPath,'--recipient-file',f.operator.recipientFile,'--registry',registryPath,'--output',output]);
 assert.equal(status.backupVerified,false);assert.equal(status.readyForSigning,false);assert.ok(readFileSync(output).subarray(0,40).toString().startsWith('age-encryption.org/v1'));
 f.clock.wall=Date.now();const restored=await f.restore({ciphertext:readFileSync(output)});
 const accepted=run(['verify','--registry',registryPath,'--proof',restored.proofFile,'--expected-archive',status.archiveSha256]);
 assert.equal(accepted.backupVerified,true);assert.equal(accepted.readyForSigning,false);assert.equal(accepted.activationRequested,false);
 const registry=openPerpsBackupRegistry(registryPath,f.common);try{assert.equal(registry.readVerified(f.identity).archiveSha256,status.archiveSha256);}finally{registry.close();}
 assert.equal(f.controls.read(f.identity).enabled,false);
});
