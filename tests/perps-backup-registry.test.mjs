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
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
import {createPerpsControlClient} from '../lib/perps-control-client.js';
import {setupPerpsControlPanel} from '../lib/perps-control-panel.js';
import {validateAutomationSettings} from '../lib/automation-panel.js';
import {openPhoenixExecutionJournal} from '../lib/phoenix-execution-journal.js';
import {simulatePhoenixOrder} from '../lib/phoenix-order-simulation.js';
import {phoenixSimulationFixture} from './helpers/phoenix-simulation-fixture.mjs';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {openPerpsPlatformFeeJournal} from '../lib/perps-platform-fee-journal.js';
import {openPerpsPlatformFeePaymentJournal} from '../lib/perps-platform-fee-payment-journal.js';
import {authorizePhoenixOrderSigning} from '../lib/phoenix-order-signing.js';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
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
 return {root,directory,keyFile,journalPath,journal,operator,clock,common,vault,identity,registry,registryPath,controlsPath,open,request,archive,restore,controls};
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

test('Phoenix backup scope requires the actual held ledger and preserves it through a paused restore',async t=>{
 const f=await fixture(t),old=await f.archive(),oldRestored=await f.restore(old);
 f.registry.acceptRestoreProof({proofFile:oldRestored.proofFile,explicitOperatorApproval:true});
 assert.equal(f.registry.readVerified(f.identity).phoenixStateIncluded,false);
 const path=join(f.root,'phoenix.sqlite'),phoenix=openPhoenixExecutionJournal(path,{...f.common,initialize:true,explicitOperatorApproval:true});
 try{
 const native=await phoenixSimulationFixture({wallet:f.identity.walletAddress});
 const simulation=await simulatePhoenixOrder(native.args,native.simulationOptions);
 phoenix.prepareOrder({id:'b'.repeat(64),workflowId:'c'.repeat(64),ownerAccountHash,
  controlRevision:'current-revision',wire:native.wire,simulation,request:native.request});
 f.request.runtimePaths.phoenixPath=path;
 const archive=await f.archive(),restored=await f.restore(archive);
 f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
 const proof=f.registry.readVerified(f.identity);assert.equal(proof.phoenixStateIncluded,true);
 const recovered=openPhoenixExecutionJournal(join(restored.runtimeDirectory,'phoenix.sqlite'),f.common);
 try{assert.equal(recovered.pending(f.identity.walletAddress)[0].state,'PREPARED');assert.equal(recovered.heldWorkflows(f.identity.walletAddress)[0].state,'HELD');}finally{recovered.close();}
 assert.equal(restored.tradingEnabled,false);assert.equal(restored.requiresPausedReconciliation,true);
 const db=new DatabaseSync(f.registryPath);db.prepare('DELETE FROM perps_backup_phoenix_scope WHERE archive=?').run(archive.sha256);db.close();
 assert.throws(()=>requireVerifiedPerpsCustodyBackup(proof,f.identity));
 }finally{phoenix.close();}
});

test('Phoenix custody signs exactly once only with real restored backup scopes and durable exact-wire claim',async t=>{
 const f=await fixture(t),paths={feesPath:join(f.root,'fees.sqlite'),paymentsPath:join(f.root,'payments.sqlite'),swapsPath:join(f.root,'swaps.sqlite'),phoenixPath:join(f.root,'phoenix.sqlite')};
 const fees=openPerpsPlatformFeeJournal(paths.feesPath,{entryJournal:f.journal,controls:f.controls,...f.common});
 const payments=openPerpsPlatformFeePaymentJournal(paths.paymentsPath,f.common),swaps=openBotSwapJournal(paths.swapsPath,{...f.common,initialize:true,explicitOperatorApproval:true});
 const phoenix=openPhoenixExecutionJournal(paths.phoenixPath,{...f.common,initialize:true,explicitOperatorApproval:true});
 try{
  for(const path of Object.values(paths))chmodSync(path,0o600);
  const native=await phoenixSimulationFixture({wallet:f.identity.walletAddress}),simulation=await simulatePhoenixOrder(native.args,native.simulationOptions);
  const revision=f.controls.read(f.identity).revision;
  const claim=phoenix.prepareOrder({id:'b'.repeat(64),workflowId:'c'.repeat(64),ownerAccountHash,
   controlRevision:revision,wire:native.wire,simulation,request:native.request});
  let conflict=false;
  const args={ownerAccountHash,journal:phoenix,claim,wire:native.wire,simulation,request:native.request,controls:f.controls,
   backupRegistry:f.registry,riskJournal:f.journal,swapJournal:swaps,explicitApproval:true,
   platformFeeTerms:quotePerpsPlatformFee('10000000'),assertUncontended(){if(conflict)throw Error('WALLET_BUSY');}};
  assert.throws(()=>authorizePhoenixOrderSigning(args));
  Object.assign(f.request.runtimePaths,paths);const archive=await f.archive(),restored=await f.restore(archive);
  f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
  for(const change of [{explicitApproval:false},{ownerAccountHash:'e'.repeat(64)},{claim:{...claim}},
   {platformFeeTerms:{...args.platformFeeTerms,feeUnits:'0'}},{wire:{...native.wire}},{simulation:{...simulation}}])assert.throws(()=>authorizePhoenixOrderSigning({...args,...change}));
  conflict=true;assert.throws(()=>authorizePhoenixOrderSigning(args),/WALLET_BUSY/);conflict=false;
  const grant=authorizePhoenixOrderSigning(args);assert.throws(()=>authorizePhoenixOrderSigning(args));
  assert.throws(()=>f.vault.signPhoenixOrder({...grant}));
  const signed=f.vault.signPhoenixOrder(grant);
  assert.equal(signed.requiresMarkBroadcast,true);assert.equal(phoenix.readAttempt(signed.id,ownerAccountHash).state,'SIGNED');
  assert.equal(phoenix.readAttempt(signed.id,ownerAccountHash).signed,signed.serializedTxBase64);
  assert.throws(()=>f.vault.signPhoenixOrder(grant));
  assert.equal(native.calls.some(c=>c.method==='sendTransaction'),false);
 }finally{phoenix.close();swaps.close();payments.close();fees.close();}
});

test('authenticated recovery status projects a real operator proof without exposing it or authorizing funds',async t=>{
 const f=await fixture(t);let account=ownerAccountHash,proofReads=0;
 const api=createPerpsAutomationApi({controls:f.controls,authenticate:async()=>account,rateLimit:async()=>true,
  readBackupProof:who=>{proofReads++;return f.registry.readVerified(who);}});
 const read=()=>api(new Request('https://executor.example/v1/automation',{headers:{Authorization:'Bearer '+'c'.repeat(64)}}));
 const pending=await (await read()).json();assert.equal(pending.recovery.backupVerified,false);assert.equal(pending.recovery.verifiedAt,null);
 const archive=await f.archive(),restored=await f.restore(archive);f.registry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
 const response=await read(),body=await response.json();assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
 assert.deepEqual(body.recovery,{walletAddress:f.identity.walletAddress,stage:'BACKUP_VERIFIED_EXECUTION_PENDING',backupVerified:true,
  verifiedAt:f.clock.wall,fundingAvailable:false,readyForSigning:false});
 assert.equal(body.controls.enabled,false);assert.equal(body.controls.paused,true);
 const encoded=JSON.stringify(body);for(const privateValue of [ownerAccountHash,archive.sha256,'verificationToken','bindings'])assert.equal(encoded.includes(privateValue),false);
 const sent=[],client=createPerpsControlClient({readSessionToken:()=>'c'.repeat(64),validateSettings:validateAutomationSettings,fetchImpl:async(url,options)=>{
  sent.push(options.method);if(url.endsWith('/health'))return Response.json({ok:true,mode:'controls-only',executionAvailable:false,custodyProvisioningAvailable:true,tradingEnabled:false});
  const response=await api(new Request(url,options));assert.equal(response.status,200);return response;
 }});
 const element=()=>({children:[],append(...items){this.children.push(...items);},setAttribute(){}});
 const fields=Object.fromEntries(Object.entries(body.controls.settings).map(([key,value])=>[key,{value:value??''}]));
 const panel=setupPerpsControlPanel({panel:element(),fields,client,validateSettings:validateAutomationSettings,language:'es',doc:{createElement:element}});
 const clientRead=await client.readStatus();assert.equal(clientRead.recovery.backupVerified,true);
 await panel.connect.onclick();assert.match(panel.status.textContent,/Respaldo cifrado verificado/);assert.match(panel.status.textContent,/No deposites todavía/);
 assert.ok(sent.every(method=>method==='GET'));assert.equal(panel.provision.disabled,true);
 account='b'.repeat(64);const before=proofReads,other=await (await read()).json();assert.equal(other.controls,null);assert.equal(other.recovery,null);assert.equal(proofReads,before);
 account=ownerAccountHash;f.registry.revokeArchive({archiveSha256:archive.sha256,explicitOperatorApproval:true});
 assert.equal((await (await read()).json()).recovery.backupVerified,false);
 await panel.connect.onclick();assert.match(panel.status.textContent,/Falta verificar el respaldo/);assert.doesNotMatch(panel.status.textContent,/Respaldo cifrado verificado/);
 const forged=createPerpsAutomationApi({controls:f.controls,authenticate:async()=>account,rateLimit:async()=>true,
  readBackupProof:()=>({...f.identity,backupVerified:true,verifiedAt:f.clock.wall})});
 const denied=await forged(new Request('https://executor.example/v1/automation',{headers:{Authorization:'Bearer '+'c'.repeat(64)}}));
 assert.equal((await denied.json()).recovery.backupVerified,false);
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
