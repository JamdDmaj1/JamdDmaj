import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import bs58 from 'bs58';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {createBotWalletSwapService} from '../lib/perps-bot-swap-service.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
import {swapFixture} from './fixtures/web-swap.mjs';
import {createServerPerpsActivationAuthorizer} from '../lib/perps-server-activation.js';
const ownerAccountHash='f'.repeat(64),other='e'.repeat(64),allowNonPosixForTests=process.platform==='win32';
async function fixture(t,{nativeInput=true,withBackup=true,timeout=false}={}){
 const root=mkdtempSync(join(tmpdir(),'jamd-bot-swap-'));chmodSync(root,0o700);let clock=Date.now(),running=true,sends=0;
 const now=()=>clock,common={now,allowNonPosixForTests},directory=join(root,'wallets'),keys=join(root,'keys'),keyFile=join(keys,'master.key');
 for(const path of [directory,keys])mkdirSync(path,{mode:0o700});createPerpsCustodyMasterKey(keyFile,common);
 const vault=openPerpsCustodyVault({directory,keyFile,...common}),identity=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true}),walletAddress=identity.walletAddress;
 const controlsPath=join(root,'controls.sqlite'),journalPath=join(root,'journal.sqlite'),swapsPath=join(root,'swaps.sqlite');
 const controls=openPerpsAutomationControls(controlsPath,common);controls.provision({ownerAccountHash,walletAddress,settings:{capital:50,loss:10,positions:1,margin:10,leverage:3,dailyTrades:5}});
 const riskJournal=openPerpsExecutionJournal(journalPath,{now}),journal=openBotSwapJournal(swapsPath,{...common,initialize:true,explicitOperatorApproval:true}),backupRegistry=openPerpsBackupRegistry(join(root,'backup.sqlite'),common);
 for(const path of [controlsPath,journalPath,swapsPath])chmodSync(path,0o600);
 t.after(()=>{backupRegistry.close();journal.close();riskJournal.close();controls.close();rmSync(root,{recursive:true,force:true});});
 const operatorDirectory=join(root,'operator'),operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 const backupOptions={directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,requireRestoreProof:true,...common,runtimePaths:{controlsPath,journalPath,swapsPath,temporaryDirectory:root}};
 if(withBackup){const archive=await createPerpsCustodyRecoveryArchive(backupOptions);await backupRegistry.registerArchive(archive,{explicitOperatorApproval:true});const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory,destinationDirectory:join(root,'initial-restore'),explicitOperatorApproval:true,...common});backupRegistry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});}
 const chain=await swapFixture(walletAddress,{nativeInput,slippageBps:50,now:clock});
 let simulationFailures=0,builds=0;
 const readRequest=async(method,params)=>{
  if(method==='simulateTransaction'&&simulationFailures>0){simulationFailures--;return {context:{slot:100},value:{err:{InstructionError:[6,{Custom:1}]},unitsConsumed:100000,accounts:null}};}
  return method==='getSignatureStatuses'?{context:{slot:100},value:[{slot:99,err:null,confirmationStatus:'finalized',confirmations:null}]}:chain.rpc(method,params);
 };
 const options={controls,vault,journal,riskJournal,backupRegistry,readAccount:who=>readServerPerpsAccount({walletAddress:who.walletAddress},{request:readRequest,now}),readRequest,
  sendRequest:async(method,params)=>{assert.equal(method,'sendTransaction');sends++;if(timeout)throw Error('MOCK_TIMEOUT');return bs58.encode(Buffer.from(params[0],'base64').subarray(1,65));},
  fetchImpl:async()=>{builds++;return Response.json({ok:true,preparation:chain.preparation});},isRunning:()=>running,now};
 const service=createBotWalletSwapService(options),who={ownerAccountHash,walletAddress};
 return {root,common,who,service,options,controls,journal,riskJournal,backupRegistry,operatorDirectory,backupOptions,chain,sends:()=>sends,builds:()=>builds,failSimulations:n=>{simulationFailures=n;},expire:()=>{clock+=16000;},stop:()=>{running=false;}};
}
for(const nativeInput of [true,false])test('exclusive bot wallet review → real fixture custody signature → one mocked send → finalized recovery '+nativeInput,async t=>{
 const f=await fixture(t,{nativeInput}),review=await f.service.prepare({...f.who,direction:nativeInput?'SOL_TO_USDC':'USDC_TO_SOL',amount:nativeInput?'0.1':'10'});
 assert.equal(review.walletAddress,f.who.walletAddress);assert.equal(f.sends(),0);assert.throws(()=>f.options.vault.signBotSwap({}),/NOT_AUTHORIZED/);
 await assert.rejects(f.service.confirm({...f.who,id:review.id,explicitApproval:false}),/REVIEW_REQUIRED/);assert.equal(f.sends(),0);
 const result=await f.service.confirm({...f.who,id:review.id,explicitApproval:true});assert.equal(result.state,'UNKNOWN');assert.equal(f.sends(),1);assert.equal(f.service.hasPending(f.who.walletAddress),true);
 await assert.rejects(f.service.confirm({...f.who,id:review.id,explicitApproval:true}));assert.equal(f.sends(),1);
 const settled=await f.service.recover({...f.who,id:review.id});assert.equal(settled.state,'FINALIZED');assert.equal(f.service.hasPending(f.who.walletAddress),false);
 assert.equal(f.controls.read(f.who).enabled,false);assert.equal(JSON.stringify(result).includes('signed'),false);
});
test('ambiguous broadcast survives service restart and is never resent',async t=>{
 const f=await fixture(t,{timeout:true}),review=await f.service.prepare({...f.who,direction:'SOL_TO_USDC',amount:'0.1'}),result=await f.service.confirm({...f.who,id:review.id,explicitApproval:true});
 assert.equal(result.state,'UNKNOWN');const restarted=createBotWalletSwapService(f.options);assert.equal(restarted.hasPending(f.who.walletAddress),true);
 await assert.rejects(restarted.prepare({...f.who,direction:'SOL_TO_USDC',amount:'0.1'}),/RECONCILIATION_REQUIRED/);
 assert.equal((await restarted.recover({...f.who,id:review.id})).state,'FINALIZED');assert.equal(f.sends(),1);
});
test('foreign owner, expiry, changed settings and missing backup cannot sign or send',async t=>{
 const missing=await fixture(t,{withBackup:false});await assert.rejects(missing.service.prepare({...missing.who,direction:'SOL_TO_USDC',amount:'0.1'}));assert.equal(missing.sends(),0);
 for(const mode of ['foreign','expired','changed','stopped']){
  const f=await fixture(t),review=await f.service.prepare({...f.who,direction:'SOL_TO_USDC',amount:'0.1'});
  if(mode==='expired')f.expire();if(mode==='changed')f.controls.pause(f.who);if(mode==='stopped')f.stop();
  await assert.rejects(f.service.confirm({...f.who,ownerAccountHash:mode==='foreign'?other:ownerAccountHash,id:review.id,explicitApproval:true}));assert.equal(f.sends(),0);
 }
});
test('new encrypted backup preserves UNKNOWN swap and restores its wallet exclusion',async t=>{
 const f=await fixture(t,{timeout:true}),review=await f.service.prepare({...f.who,direction:'SOL_TO_USDC',amount:'0.1'});await f.service.confirm({...f.who,id:review.id,explicitApproval:true});
 const archive=await createPerpsCustodyRecoveryArchive(f.backupOptions),restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory:f.operatorDirectory,destinationDirectory:join(f.root,'pending-restore'),explicitOperatorApproval:true,...f.common});
 const journal=openBotSwapJournal(join(restored.runtimeDirectory,'swaps.sqlite'),f.common);try{assert.equal(journal.pending(f.who.walletAddress)[0].state,'UNKNOWN');assert.equal(journal.read(review.id).signature,f.journal.read(review.id).signature);}finally{journal.close();}
});
test('activation authorizer refuses a pending manual bot swap before any risk read',async()=>{
 let reads=0;const authorize=createServerPerpsActivationAuthorizer({controls:{read(){}},vault:{describe(){}},backupRegistry:{readVerified(){}},journal:{pending(){return [];},openPositions(){return [];}},
  readAccount:async()=>{reads++;throw Error('must not reach');},isExecutionRunning:()=>true,hasPendingBotSwap:()=>true});
 await assert.rejects(authorize({ownerAccountHash,walletAddress:'11111111111111111111111111111111'}),/PERPS_EXECUTION_NOT_CONFIGURED/);assert.equal(reads,0);
});
test('a failed unsigned route requests one fresh quote and never signs or sends during review',async t=>{
 const f=await fixture(t);f.failSimulations(1);const review=await f.service.prepare({...f.who,direction:'SOL_TO_USDC',amount:'0.1'});
 assert.equal(review.stage,'BOT_SWAP_REVIEW');assert.equal(f.builds(),2);assert.equal(f.sends(),0);assert.equal(f.journal.recent(f.who.ownerAccountHash,f.who.walletAddress).length,0);
});
test('unsigned route refresh is bounded, and confirmation never retries a failed simulation',async t=>{
 const failed=await fixture(t);failed.failSimulations(3);await assert.rejects(failed.service.prepare({...failed.who,direction:'SOL_TO_USDC',amount:'0.1'}),/WEB_SWAP_SIMULATION_FAILED/);assert.equal(failed.builds(),2);assert.equal(failed.sends(),0);
 const f=await fixture(t),review=await f.service.prepare({...f.who,direction:'SOL_TO_USDC',amount:'0.1'});f.failSimulations(1);
 await assert.rejects(f.service.confirm({...f.who,id:review.id,explicitApproval:true}),/WEB_SWAP_SIMULATION_FAILED/);assert.equal(f.builds(),1);assert.equal(f.sends(),0);assert.equal(f.journal.pending(f.who.walletAddress).length,0);
});
