import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {readPerpsBroadcastReceipt} from '../lib/perps-broadcast-receipt.js';
import {reconcilePendingPerps} from '../lib/perps-pending-recovery.js';
import {readServerPerpsTradeTransaction} from '../lib/perps-server-trade-transaction.js';
import {bindRecoverablePerpsEntryCollateral,readRecoverablePerpsEntryCollateral} from '../lib/perps-entry-collateral-recovery-binding.js';
import {preparePerpsEntryCollateralRecovery,readPreparedPerpsEntryCollateralRecovery} from '../lib/perps-entry-collateral-recovery-preparation.js';
import {recordPerpsEntryCollateralRecoveryIntent,readPerpsEntryCollateralRecoveryIntent} from '../lib/perps-entry-collateral-recovery-intent.js';
import {submitPerpsEntryCollateralRecovery} from '../lib/perps-entry-collateral-recovery-submit.js';
import {readRecordedPerpsEntryRecoveryReceipt,reconcileRecordedPerpsEntryRecovery} from '../lib/perps-entry-collateral-recovery-receipt.js';
import {readFailedPerpsEntryRecovery,requireFailedPerpsEntryRecovery,reconcileAccountedFailedPerpsEntryRecovery,proveAccountedEntryRecoveryFailures,requireAccountedEntryRecoveryFailures,claimWithAccountedEntryRecoveryFailures} from '../lib/perps-entry-recovery-failure.js';
import {readJournalledPerpsEntryRecovery,requireVerifiedPerpsEntryRecoveryHistory} from '../lib/perps-entry-recovery-history.js';
import {createPerpsEntryRecoveryUsdValuationReader,requirePerpsEntryRecoveryUsdValuation,createHistoricalPerpsEntryRecoveryUsdValuationReader,requireHistoricalPerpsEntryRecoveryUsdValuation} from '../lib/perps-entry-recovery-usd-valuation.js';
import {createPerpsNetworkFeeValuationReader} from '../lib/perps-network-fee-valuation.js';
import {proveAccountedPerpsEntryRecovery,requireAccountedPerpsEntryRecovery} from '../lib/perps-entry-recovery-completion.js';
import {readHistoricalPerpsEntryRecoveryCosts,requireHistoricalPerpsEntryRecoveryCosts} from '../lib/perps-entry-recovery-historical-costs.js';
import {requireAvailablePerpsEntryCollateralForOpening,readBoundPerpsEntryCollateral} from '../lib/perps-entry-conversion-binding.js';
import {unsignedRecoveryAccountFixture} from './helpers/perps-unsigned-recovery-account.mjs';
import {proveAccountedFailedEntryConversion} from '../lib/perps-entry-conversion-failure-completion.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsBackupRegistry,PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL,PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL} from '../lib/perps-backup-registry.js';
import {deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {authorizeBotEntryConversionCustody,authorizeBotFailedEntryRecoveryCustody,authorizeBotEntryCollateralRecoveryCustody,consumeBotSwapCustody} from '../lib/perps-bot-swap-signing.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {openManualPerpsPolicyStore} from '../lib/perps-manual-policy-store.js';
import {createBotManualPerpsService} from '../lib/perps-bot-manual-service.js';
import {createPerpsAutomationApi} from '../lib/perps-automation-api.js';
import {createBotManualPerpsClient} from '../lib/bot-manual-perps-client.js';
import {nativeBrowserClient} from './helpers/perps-native-browser-client.mjs';
import {PERPS_PLATFORM_FEE} from '../lib/perps-platform-fee.js';
import {recoverNeverBroadcastHeldPerpsEntryConversion} from '../lib/perps-entry-conversion-recovery.js';
import {recoverHeldPerpsEntryCollateral} from '../lib/perps-entry-conversion-recovery.js';
import {readRecordedPerpsEntryConversionFailure,requireRecordedPerpsEntryConversionFailure} from '../lib/perps-entry-conversion-recovery.js';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
import {entryOpeningFixture} from './helpers/perps-entry-opening-fixture.mjs';
import {entryDailyAccountFixture} from './helpers/perps-entry-daily-account.mjs';
import {decodeServerPerpsCustody} from '../lib/perps-server-custody.js';
import {openPerpsPlatformFeeJournal} from '../lib/perps-platform-fee-journal.js';
import {openPerpsPlatformFeePaymentJournal} from '../lib/perps-platform-fee-payment-journal.js';
import {conversionFixture} from './helpers/perps-conversion-fixture.mjs';
import {buildUnsignedPerpsEntryConversionWire} from '../lib/perps-entry-conversion-wire.js';
import {simulatePerpsEntryConversion,readSimulatedPerpsEntryConversion} from '../lib/perps-entry-conversion-simulation.js';
import {prepareProtectedPerpsEntryConversion,readPreparedPerpsEntryConversion} from '../lib/perps-entry-conversion-preparation.js';
import {createPerpsEntryConversionEngine,consumePerpsEntryConversionGrant} from '../lib/perps-entry-conversion-engine.js';
async function fixture(asset='BTC',newDestination=false,walletAddress){
 const f=await conversionFixture({asset,nativeSolInput:false,closeWrappedAccount:false,strictWire:false,...(walletAddress?{walletAddress}:{})}),input=10000000n,output=9970000n,owner=f.walletAddress;
 const wire=await buildUnsignedPerpsEntryConversionWire({walletAddress:owner,asset,blockhash:f.wire.blockhash,lastValidBlockHeight:f.wire.lastValidBlockHeight,usdcUnits:String(input),minimumCollateralUnits:asset==='SOL'?'99500000':'9950000'},f.u,f.c);
 const actualOutput=asset==='SOL'?99700000n:output;
 for(const map of [f.before,f.after])for(const c of [f.u,f.c]){const a=map.get(c.address),old=Buffer.from(a.data[0],'base64'),b=Buffer.alloc(1200);old.copy(b);a.data[0]=b.toString('base64');}
 f.before.set(wire.source,f.token(owner,f.u.mint,20000000n));f.after.set(wire.source,f.token(owner,f.u.mint,20000000n-input));
 f.before.set(wire.destination,newDestination?null:f.token(owner,f.c.mint,17n));f.after.set(wire.destination,f.token(owner,f.c.mint,(newDestination?0n:17n)+actualOutput));
 const oldPayer=f.before.get(owner);f.after.set(owner,{...oldPayer,lamports:oldPayer.lamports-5400-(newDestination?2039280:0)});
 const readAmount=a=>Buffer.from(a.data[0],'base64').readBigUInt64LE(64);
 for(const [c,delta]of [[f.u,input],[f.c,-actualOutput]]){
  const old=f.before.get(c.tokenAccount),amount=readAmount(old),authority=bs58.encode(Buffer.from(old.data[0],'base64').subarray(32,64));
  f.after.set(c.tokenAccount,f.token(authority,c.mint,amount+delta,c.asset==='SOL'?5n:0n));
  for(const map of [f.before,f.after]){const a=map.get(c.address),b=Buffer.from(a.data[0],'base64');b.writeBigUInt64LE(readAmount(map.get(c.tokenAccount)),222);a.data[0]=b.toString('base64');}
 }
 return {...f,wire,input,output:actualOutput};
}
test('entry conversion conserves exact USDC and collateral for all markets and new/existing ATAs',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const fresh of [false,true]){
  const f=await fixture(asset,fresh),r=await simulatePerpsEntryConversion(f.wire,f.options);
  assert.equal(r.receivedCollateralUnits,String(f.output));assert.equal(r.usdcUnits,'10000000');assert.equal(r.networkFeeLamports,'5400');assert.equal(r.rentLockedLamports,fresh?'2039280':'0');
  assert.equal(r.readyForSigning,false);assert.equal(r.requiresFinalizedReceiptBeforeOpening,true);assert.equal(readSimulatedPerpsEntryConversion(r).wire,f.wire);assert.throws(()=>readSimulatedPerpsEntryConversion({...r}));f.expire();assert.throws(()=>readSimulatedPerpsEntryConversion(r));
 }
});
test('entry conversion rejects altered funding, configuration, principal, wire and native simulation failures',async()=>{
 for(const mode of ['payer','source','destination','custodyConfig','custodyPrincipal','suffix','vault','oracle','native','replacement','bank','height']){
  const f=await fixture();
  const mutate=(key,offset)=>{const a=f.after.get(key),b=Buffer.from(a.data[0],'base64');b[offset]^=1;a.data[0]=b.toString('base64');};
  if(mode==='payer')f.after.get(f.walletAddress).lamports++;
  if(mode==='source')mutate(f.wire.source,64);if(mode==='destination')mutate(f.wire.destination,64);
  if(mode==='custodyConfig')mutate(f.u.address,199);if(mode==='custodyPrincipal')mutate(f.u.address,1004);if(mode==='suffix')mutate(f.u.address,1199);
  if(mode==='vault')mutate(f.c.tokenAccount,64);if(mode==='oracle')mutate(f.c.dovesAgOracle,168);
  if(mode==='native')f.response.err='BlockhashNotFound';if(mode==='replacement')f.response.replacementBlockhash={blockhash:f.wire.blockhash};
  const request=f.options.request;f.options.request=async(m,p)=>{const r=await request(m,p);if(mode==='bank'&&m==='simulateTransaction')r.context.slot++;if(mode==='height'&&m==='getBlockHeight')return 1001;return r;};
  await assert.rejects(simulatePerpsEntryConversion(f.wire,f.options),mode);
 }
});
test('joined entry preparation binds draft, oracle, exact wire and costs without exposing signing bytes',async()=>{
 for(const asset of ['BTC','ETH','SOL']){
  const f=await fixture(asset,true),draft={asset,side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},r=await prepareProtectedPerpsEntryConversion(draft,f.walletAddress,f.options);
  assert.deepEqual(r.draft,draft);assert.equal(r.maxSlippageBps,50);assert.equal(r.usdcUnits,'10000000');assert.equal(r.readyForSigning,false);assert.equal(r.submitted,false);
  assert.equal(r.simulatedCollateralUnits,String(f.output));assert.equal(r.rentLockedLamports,'2039280');assert.equal('serializedTxBase64' in r,false);
  const p=readPreparedPerpsEntryConversion(r);assert.equal(p.wire.minimumCollateralUnits,r.minimumCollateralUnits);assert.equal(p.simulation.observedSlot,r.observedSlot);
  assert.throws(()=>readPreparedPerpsEntryConversion({...r}));f.expire();assert.throws(()=>readPreparedPerpsEntryConversion(r));
 }
});
test('joined entry preparation rejects Short, stale/foreign oracles and insufficient exact funding before any authorization',async()=>{
 const draft={asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'};
 for(const mode of ['short','oracle','source','time','bank']){
  const f=await fixture();
  if(mode==='oracle')for(const map of [f.before,f.after])map.get(f.c.dovesAgOracle).owner=f.c.address;
  if(mode==='source')f.before.set(f.wire.source,f.token(f.walletAddress,f.u.mint,1n));
  if(mode==='time')f.expire();
  const request=f.options.request;f.options.request=async(m,p)=>{const r=await request(m,p);if(mode==='bank'&&m==='getMultipleAccounts'&&p[1].minContextSlot)r.context.slot=0;return r;};
  if(mode==='time'){
   let calls=0;const clock=f.options.monotonicNow;f.options.monotonicNow=()=>clock()+(calls++?10001:0);
  }
  await assert.rejects(prepareProtectedPerpsEntryConversion({...draft,side:mode==='short'?'SHORT':'LONG'},f.walletAddress,f.options),mode);
 }
});
test('first-leg lifecycle requires one-use explicit approval and journals before its only mocked send',async()=>{
 for(const timeout of [false,true]){
  const pair=generateKeyPairSync('ed25519'),wallet=bs58.encode(pair.publicKey.export({type:'spki',format:'der'}).subarray(-32)),f=await fixture('BTC',false,wallet),events=[];let pending=null,sends=0;
  const journal={read:async()=>pending,begin:async row=>{events.push('journal');pending=row;},resolve:async()=>{}};
  const engine=createPerpsEntryConversionEngine({...f.options,sendRequest:async(method,p)=>{sends++;events.push('send');assert.equal(method,'sendTransaction');assert.equal(p[1].maxRetries,0);if(timeout)throw Error('transport-timeout');return pending.signature;},journal,isCurrent:()=>true});
  const review=await engine.prepare({asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},wallet);
  assert.throws(()=>engine.authorize(review,false));assert.throws(()=>engine.authorize({...review},true));
  await assert.rejects(engine.submit(review,'not-a-signature'));assert.equal(sends,0);
  const grant=engine.authorize(review,true),approved=await consumePerpsEntryConversionGrant(grant,wallet);assert.throws(()=>engine.authorize(review,true));await assert.rejects(consumePerpsEntryConversionGrant(grant,wallet));
  const message=Buffer.from(approved.message),signature=sign(null,message,pair.privateKey),signed=Buffer.concat([Buffer.from([1]),signature,message]).toString('base64');
  if(timeout)await assert.rejects(engine.submit(review,signed),/transport-timeout/);else assert.equal(await engine.submit(review,signed),bs58.encode(signature));
  assert.deepEqual(events,['journal','send']);assert.equal(sends,1);assert.equal(pending.signature,bs58.encode(signature));await assert.rejects(engine.submit(review,signed));assert.equal(sends,1);
 }
});
test('entry lifecycle refuses changed external authorization and never turns a review into a signature',async()=>{
 const f=await fixture(),journal={read:async()=>null,begin:async()=>assert.fail('No durable send allowed'),resolve:async()=>{}};let current=true;
 const engine=createPerpsEntryConversionEngine({...f.options,journal,isCurrent:()=>current,sendRequest:async()=>assert.fail('No send allowed')});
 const review=await engine.prepare({asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},f.walletAddress),grant=engine.authorize(review,true);
 current=false;await assert.rejects(consumePerpsEntryConversionGrant(grant,f.walletAddress));assert.equal(review.readyForSigning,false);
 engine.invalidate();assert.throws(()=>engine.authorize(review,true));
});

for(const asset of ['BTC','ETH','SOL'])for(const mode of ['success','limits','backup','hold','controls','account','service','api','timeout','unsent','sign-fail','simulation-fail','recovery','opening','opening-timeout','opening-failed','opening-failed-prior','opening-return','opening-return-prior','opening-return-old-finality','opening-return-retry','opening-return-failed','opening-return-failed-prior','opening-return-failed-claim','opening-return-failed-retry','opening-return-failed-retry-prior','opening-sign-fail','first-failed','first-failed-prior'])test('reserved bot entry conversion one-use custody: '+asset+' '+mode,async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-entry-custody-'));chmodSync(root,0o700);
 const ownerAccountHash='f'.repeat(64),directory=join(root,'wallets'),keyDirectory=join(root,'keys'),keyFile=join(keyDirectory,'master.key');
 for(const path of [directory,keyDirectory])mkdirSync(path,{mode:0o700});
 const vaultOptions={allowNonPosixForTests:process.platform==='win32',now:()=>Date.parse('2026-10-20T20:00:00Z')};
 createPerpsCustodyMasterKey(keyFile,vaultOptions);const vault=openPerpsCustodyVault({directory,keyFile,...vaultOptions});
 const {walletAddress}=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 const f=await fixture(asset,false,walletAddress),who={ownerAccountHash,walletAddress};
 let runtimeNow=f.options.now();const common={allowNonPosixForTests:process.platform==='win32',now:()=>runtimeNow,monotonicNow:()=>0};
 const controls=openPerpsAutomationControls(join(root,'controls.sqlite'),common),executionJournal=openPerpsExecutionJournal(join(root,'risk.sqlite'),common);
 const journal=openBotSwapJournal(join(root,'swaps.sqlite'),{...common,initialize:true,explicitOperatorApproval:true});
 async function verifyCompletedArchive(reservationId){
  // Real encrypted archive/restore of this unfunded native-flow fixture. No
  // imported persistence rows or fabricated signatures stand in for the flow.
  const operatorDirectory=join(root,'completed-operator');
  const operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
  const feesPath=join(root,'fees.sqlite'),paymentsPath=join(root,'payments.sqlite');
  openPerpsPlatformFeeJournal(feesPath,{entryJournal:executionJournal,now:common.now}).close();
  openPerpsPlatformFeePaymentJournal(paymentsPath,{now:common.now}).close();
  for(const path of [feesPath,paymentsPath,join(root,'controls.sqlite'),join(root,'risk.sqlite')])chmodSync(path,0o600);
  const runtimePaths={controlsPath:join(root,'controls.sqlite'),journalPath:join(root,'risk.sqlite'),swapsPath:join(root,'swaps.sqlite'),feesPath,paymentsPath,temporaryDirectory:root};
  const archiveRequest={directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,runtimePaths,...common};
  const archive=await createPerpsCustodyRecoveryArchive(archiveRequest);
  const retry=journal.recent(ownerAccountHash,walletAddress).find(row=>JSON.parse(row.review).recoveryAttempt>0);
  if(retry){
   const rootId=JSON.parse(retry.review).rootRecoveryId,original=journal.read(rootId),raw=new DatabaseSync(join(root,'swaps.sqlite'));
   try{
    raw.prepare('UPDATE bot_wallet_swaps SET review=? WHERE id=?').run(JSON.stringify({...JSON.parse(original.review),previousRecoveryId:'f'.repeat(64)}),rootId);
    await assert.rejects(()=>createPerpsCustodyRecoveryArchive(archiveRequest));
   }finally{raw.prepare('UPDATE bot_wallet_swaps SET review=? WHERE id=?').run(original.review,rootId);raw.close();}
  }
  const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory,destinationDirectory:join(root,'completed-restore'),explicitOperatorApproval:true,...common});
  assert.equal(restored.readyForSigning,false);assert.equal(restored.tradingEnabled,false);
  const restoredJournal=openPerpsExecutionJournal(join(restored.runtimeDirectory,'journal.sqlite'),common);
  const restoredSwaps=openBotSwapJournal(join(restored.runtimeDirectory,'swaps.sqlite'),common);
  const restoredControls=openPerpsAutomationControls(join(restored.runtimeDirectory,'controls.sqlite'),common);
  try{
   assert.deepEqual(restoredJournal.read(reservationId),executionJournal.read(reservationId));
   assert.deepEqual(restoredJournal.entryConversionHold(reservationId),executionJournal.entryConversionHold(reservationId));
   assert.deepEqual(restoredJournal.riskState(walletAddress),executionJournal.riskState(walletAddress));
   assert.deepEqual(restoredSwaps.recent(ownerAccountHash,walletAddress),journal.recent(ownerAccountHash,walletAddress));
   assert.equal(restoredSwaps.pending(walletAddress).length,0);
   const restoredPolicy=restoredControls.read(who);assert.equal(restoredPolicy.paused,true);
   assert.deepEqual(restoredPolicy.settings,controls.read(who).settings);
   for(const [sourcePath,file,tables]of [[feesPath,'fees.sqlite',['perps_platform_fee_consents','perps_platform_fee_assessments']],
    [paymentsPath,'payments.sqlite',['perps_platform_fee_payments']]]){
    const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(join(restored.runtimeDirectory,file),{readOnly:true});
    try{for(const table of tables)assert.deepEqual(target.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),source.prepare('SELECT * FROM '+table+' ORDER BY rowid').all());}
    finally{target.close();source.close();}
   }
  }finally{restoredControls.close();restoredSwaps.close();restoredJournal.close();}
 }
 const backupPath=join(root,'backup.sqlite');let backupRegistry;
 t.after(()=>{backupRegistry?.close();journal.close();executionJournal.close();controls.close();rmSync(root,{recursive:true,force:true});});
 const state=controls.provision({...who,settings:{capital:20,loss:20,positions:1,margin:10,leverage:3,dailyTrades:1}});
 openPerpsBackupRegistry(backupPath,common).close();
 // Restore-accepted persistence corpus for an unfunded ephemeral wallet. Real
 // encrypted restore/attestation is exercised separately, not fabricated here.
 const db=new DatabaseSync(backupPath),archive='b'.repeat(64),at=f.options.now();
 try{
  db.exec(PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL+';'+PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL);
  db.prepare("INSERT INTO perps_backup_challenges(archive,token_hash,created,expires,bindings,status) VALUES(?,?,?,?,?,'ACCEPTED')").run(archive,'c'.repeat(64),at,at+86400000,JSON.stringify([who]));
  db.prepare('INSERT INTO perps_verified_backups VALUES(?,?,?,?,?)').run(ownerAccountHash,walletAddress,archive,randomUUID(),at);
  db.prepare('INSERT INTO perps_backup_fee_scope VALUES(?,1)').run(archive);db.prepare('INSERT INTO perps_backup_swap_scope VALUES(?,1)').run(archive);
 }finally{db.close();}
 chmodSync(backupPath,0o600);backupRegistry=openPerpsBackupRegistry(backupPath,common);
 const accountRequest=async(method,params)=>{
  if(method==='getMultipleAccounts')return {context:{slot:500000},value:params[0].map(key=>f.before.get(key)??null)};
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getSlot')return 500000;if(method==='getBlocks')return [68000];if(method==='getFirstAvailableBlock')return 100;
  if(method==='getBlockTime')return at/1000-(params[0]===500000?5:172800);
  if(method==='getSignaturesForAddress')return [];throw Error('UNEXPECTED_ACCOUNT_RPC');
 };
 const readAccount=()=>readServerPerpsDailyAccount({walletAddress},{request:accountRequest,...common,journal:executionJournal});
 const limits={capitalUsd:'20',dailyLossUsd:'20',positions:1,dailyTrades:1};let policy={walletAddress,limits};
 let claim,sends=0;
 if(['service','api','timeout','unsent','sign-fail','simulation-fail','opening','opening-timeout','opening-failed','opening-failed-prior','opening-return','opening-return-prior','opening-return-old-finality','opening-return-retry','opening-return-failed','opening-return-failed-prior','opening-return-failed-claim','opening-return-failed-retry','opening-return-failed-retry-prior','opening-sign-fail','first-failed','first-failed-prior'].includes(mode)){
  const policyStore=openManualPerpsPolicyStore(join(root,'manual-policy.sqlite'),{...common,initialize:true});
  let actualFeeJournal;
  try{
   policyStore.save({...who,limits,expectedRevision:null,explicitApproval:true});const consents=[];
   const forbidden=()=>assert.fail('No opening, close, HTTP execution or fee collection');
   if(mode.startsWith('opening')||mode==='api')actualFeeJournal=openPerpsPlatformFeeJournal(join(root,'fees.sqlite'),{entryJournal:executionJournal,now:common.now});
   let refuseSimulation=false;
   const serviceVault=mode==='sign-fail'?{...vault,signBotSwap:()=>{throw Error('MOCK_SIGN_REFUSED');}}:
    mode==='simulation-fail'?{...vault,signBotSwap:grant=>{const signed=vault.signBotSwap(grant);refuseSimulation=true;return signed;}}:vault;
   const deps={controls,vault:serviceVault,journal:executionJournal,swapJournal:journal,policyStore,backupRegistry,readAccount,
    rpcRequest:(method,params)=>method==='simulateTransaction'&&refuseSimulation?Promise.resolve({context:{slot:params[1].minContextSlot},value:{err:'BlockhashNotFound'}}):f.options.request(method,params),
    builderRequest:async()=>{throw Error('PERPS_PRESWAP_INTENT_MISMATCH_MINIMUM_OUTPUT');},feeJournal:{recordConsent:value=>{if(mode==='unsent')throw Error('MOCK_CONSENT_STORE_REFUSED');consents.push(value);return actualFeeJournal?.recordConsent(value);}},
    platformFees:{assertActivationReadiness:async()=>{},status:()=>({dueUnits:'0',pendingCount:0,failedCount:0})},
    hasPendingSwap:wallet=>journal.pending(wallet).length>0,isRunning:()=>true,fetchImpl:forbidden,readFinalizedAccount:forbidden,...common,
    sendRequest:async(method,args)=>{
     assert.equal(method,'sendTransaction');assert.equal(args[1].maxRetries,0);sends++;
     assert.equal(journal.pending(walletAddress)[0].state,'UNKNOWN');
     if(mode==='timeout')throw Error('MOCK_TIMEOUT');return bs58.encode(Buffer.from(args[0],'base64').subarray(1,65));
    }};
   const service=createBotManualPerpsService(deps),draft={asset,side:'LONG',margin:'10',leverage:'3',referencePrice:'100',...(mode.startsWith('opening')?{stopLoss:'95'}:{})};
   async function boundaryClient(target){
    const token='a'.repeat(64),handler=createPerpsAutomationApi({controls,botManual:target,rateLimit:async()=>true,
     authenticate:async request=>{assert.equal(request.headers.get('authorization'),'Bearer '+token);return ownerAccountHash;}});
    if(process.env.JAMDDMAJ_NATIVE_BROWSER==='1'){
     const client=await nativeBrowserClient(handler,{now:common.now(),token});t.after(()=>client.close());return client;
    }
    return createBotManualPerpsClient({now:common.now,readSessionToken:()=>token,fetchImpl:(url,options)=>
     handler(new Request(url,{...options,headers:{...options.headers,Origin:'https://www.jamddmaj.com'}}))});
   }
   if(mode==='api'){
    let token='a'.repeat(64);const actions=[];
    const api=createPerpsAutomationApi({controls,botManual:service,rateLimit:async()=>true,authenticate:async request=>{
     assert.equal(request.headers.get('authorization'),'Bearer '+token);return ownerAccountHash;
    }});
    const handler=async request=>{actions.push((await request.clone().json()).action);return api(request);};
    const client=process.env.JAMDDMAJ_NATIVE_BROWSER==='1'?
     await nativeBrowserClient(handler,{now:common.now(),token}):createBotManualPerpsClient({now:common.now,readSessionToken:()=>token,fetchImpl:async(url,options)=>{
     return handler(new Request(url,{...options,headers:{...options.headers,Origin:'https://www.jamddmaj.com'}}));
    }});
    if(client.close)t.after(()=>client.close());
    const review=await client.prepare(walletAddress,draft);
    assert.equal(review.stage,'BOT_MANUAL_ENTRY_CONVERSION_REVIEW');assert.equal(review.maxSlippageBps,50);
    assert.equal(executionJournal.pending(walletAddress).length,0);assert.equal(sends,0);
    await assert.rejects(client.confirm({...review},true,true));await assert.rejects(client.confirm(review,false,true));
    await assert.rejects(client.confirm(review,true,false));assert.equal(sends,0);
    const result=await client.confirm(review,true,true);assert.equal(result.fundingStage,'UNKNOWN');assert.equal(sends,1);
    assert.equal(executionJournal.entryConversionHold(review.id).state,'HELD');assert.equal(consents.length,1);
    const consentDb=new DatabaseSync(join(root,'fees.sqlite'),{readOnly:true});
    try{
     const consent=consentDb.prepare('SELECT * FROM perps_platform_fee_consents WHERE reservation=?').get(review.id);
     assert.equal(consent.wallet,walletAddress);assert.equal(consent.margin,'10000000');
     assert.equal(JSON.parse(consent.terms).feeUnits,'20000');
     assert.equal(consentDb.prepare('SELECT COUNT(*) AS n FROM perps_platform_fee_assessments').get().n,0);
    }finally{consentDb.close();}
    await assert.rejects(client.confirm(review,true,true));assert.equal(sends,1);
    const status=await client.status(walletAddress);assert.equal(status.operations[0].id,review.id);
    assert.equal((await client.recover(walletAddress,review.id)).fundingStage,'UNKNOWN');assert.equal(sends,1);
    assert.deepEqual(actions,['botManualPrepare','botManualConfirm','botManualStatus','botManualRecover']);
    assert.equal(controls.read(who).paused,true);assert.equal(controls.read(who).enabled,false);return;
   }
   await assert.rejects(()=>service.prepareEntryConversion({...who,draft:{...draft,side:'SHORT'}}));assert.equal(sends,0);
   const flowClient=mode.startsWith('opening')?await boundaryClient(service):null;
   const review=flowClient?await flowClient.prepare(walletAddress,draft):mode==='service'?await service.prepare({...who,draft}):await service.prepareEntryConversion({...who,draft});
   assert.equal(review.stage,'BOT_MANUAL_ENTRY_CONVERSION_REVIEW');assert.equal(review.maxSlippageBps,50);
   assert.equal(review.requiresSeparateOpeningConfirmation,true);assert.equal(review.submitted,false);
   assert.equal(executionJournal.pending(walletAddress).length,0);assert.equal(sends,0);
   await assert.rejects(()=>service.confirm({...who,id:review.id,explicitApproval:false}));assert.equal(sends,0);
   const confirm={...who,id:review.id,explicitApproval:true,explicitFeeApproval:true,feeTermsVersion:PERPS_PLATFORM_FEE.version};
   await assert.rejects(()=>service.confirm({...confirm,explicitFeeApproval:false}));
   await assert.rejects(()=>service.confirm({...confirm,feeTermsVersion:'old-terms'}));assert.equal(sends,0);
   if(['unsent','sign-fail','simulation-fail'].includes(mode)){
    await assert.rejects(()=>service.confirm(confirm),/MOCK_CONSENT_STORE_REFUSED|MOCK_SIGN_REFUSED|UNVERIFIED_PERPS_ENTRY_CONVERSION_SIMULATION/);
    const parent=executionJournal.read(review.id),hold=executionJournal.entryConversionHold(review.id),swap=journal.read(hold.conversion_id);
    assert.equal(parent.state,'CANCELLED');assert.equal(hold.state,'HELD');assert.equal(swap.state,'ABORTED');
    assert.equal(swap.signed===null,mode!=='simulation-fail');
    assert.equal(sends,0);assert.equal(executionJournal.pending(walletAddress).length,0);assert.equal(journal.pending(walletAddress).length,0);
    const restarted=createBotManualPerpsService(deps),recovered=await restarted.recover({...who,id:review.id});
    assert.equal(recovered.state,'CANCELLED');assert.equal(recovered.requiresOpeningReview,false);
    await assert.rejects(()=>restarted.confirm(confirm));assert.equal(sends,0);return;
   }
   const result=flowClient?await flowClient.confirm(review,true,true):await service.confirm(confirm);
   assert.equal(result.id,review.id);assert.equal(result.state,'RESERVED');assert.equal(result.fundingStage,'UNKNOWN');
   assert.equal(result.requiresOpeningReview,true);assert.equal(sends,1);assert.equal(consents.length,1);
   assert.equal(executionJournal.pending(walletAddress).length,1);assert.equal(executionJournal.read(review.id).signature,null);
   assert.equal(executionJournal.entryConversionHold(review.id).state,'HELD');
   if(flowClient){
    await assert.rejects(()=>flowClient.prepare(walletAddress,draft,{entryReservationId:review.id}));
    assert.equal(sends,1);assert.equal(executionJournal.read(review.id).signature,null);
   }
   assert.throws(()=>recoverNeverBroadcastHeldPerpsEntryConversion({executionJournal,journal,reservationId:review.id,ownerAccountHash}));
   assert.equal(executionJournal.read(review.id).state,'RESERVED');
   await assert.rejects(()=>service.confirm(confirm));assert.equal(sends,1);
   const restarted=createBotManualPerpsService(deps),status=await restarted.status(who);
   assert.equal(status.available,false);assert.equal(status.operations[0].fundingStage,'UNKNOWN');
   assert.deepEqual(status.operations[0].draft,review.draft);
   assert.equal((await restarted.recover({...who,id:review.id})).fundingStage,'UNKNOWN');assert.equal(sends,1);
   if(mode.startsWith('first-failed')){
    const priorDay=mode==='first-failed-prior',expectedTodayFee=priorDay?'0':'540';
    const hold=executionJournal.entryConversionHold(review.id),row=journal.read(hold.conversion_id),saved=JSON.parse(row.review);
    const failed=await conversionReceiptFixture({entry:true,asset,fixtureSignedEntryWire:row.signed,fixtureWalletAddress:walletAddress,entryMinimumUnits:saved.minimumCollateralUnits});
    const err={InstructionError:[3,'InvalidArgument']};failed.status.err=err;failed.transaction.meta.err=err;failed.transaction.meta.innerInstructions=null;
    failed.transaction.meta.postTokenBalances=structuredClone(failed.transaction.meta.preTokenBalances);
    failed.transaction.meta.postBalances=[...failed.transaction.meta.preBalances];failed.transaction.meta.postBalances[0]-=5400;
    runtimeNow+=120000+(priorDay?86400000:0);let age=0;
    const options={now:common.now,monotonicNow:()=>age,request:async(method,params)=>method==='getMultipleAccounts'?
     {context:{slot:130},value:params[0].map(key=>failed.before.get(key))}:failed.request(method,params)};
    const input={journal,id:row.id,ownerAccountHash};
    failed.status.confirmationStatus='confirmed';assert.equal(await readRecordedPerpsEntryConversionFailure(input,options),null);
    failed.status.confirmationStatus='finalized';const proof=await readRecordedPerpsEntryConversionFailure(input,options);
    assert.equal(proof.signature,row.signature);assert.equal(proof.networkFeeLamports,'5400');assert.equal(proof.originalRiskReleased,false);
    assert.equal(requireRecordedPerpsEntryConversionFailure(proof),proof);assert.throws(()=>requireRecordedPerpsEntryConversionFailure({...proof}));
    await assert.rejects(readRecordedPerpsEntryConversionFailure({...input,ownerAccountHash:'a'.repeat(64)},options));
    const original=failed.transaction.transaction[0],wire=Buffer.from(original,'base64');wire[1]^=1;failed.transaction.transaction[0]=wire.toString('base64');
    await assert.rejects(readRecordedPerpsEntryConversionFailure(input,options));failed.transaction.transaction[0]=original;
    failed.transaction.meta.postBalances[1]++;await assert.rejects(readRecordedPerpsEntryConversionFailure(input,options));failed.transaction.meta.postBalances[1]--;
    age=10001;assert.throws(()=>requireRecordedPerpsEntryConversionFailure(proof));age=0;
    for(const [key,value]of failed.before)failed.after.set(key,structuredClone(value));failed.after.get(walletAddress).lamports-=5400;
    const dailyFailure=entryDailyAccountFixture(failed,{journal:executionJournal,swapJournal:journal});
    if(priorDay)dailyFailure.setNow(runtimeNow);
    const account=await readServerPerpsDailyAccount(who,dailyFailure.options);
    assert.equal(account.failedTransactions,priorDay?0:1);assert.equal(account.tradesToday,0);
    assert.equal(account.networkFeeUsdUnits,expectedTodayFee);assert.equal(account.lossTodayUsdcUnits,expectedTodayFee);
    const completionInput={journal:executionJournal,swapJournal:journal,reservationId:review.id,failure:proof};
    assert.throws(()=>proveAccountedFailedEntryConversion({...completionInput,account:{...account}}));
    if(!priorDay){
     dailyFailure.setHistoryVisible(false);
     const omitted=await readServerPerpsDailyAccount(who,dailyFailure.options);
     assert.equal(omitted.transactions.length,0);
     assert.throws(()=>proveAccountedFailedEntryConversion({...completionInput,account:omitted}));
     dailyFailure.setHistoryVisible(true);
    }else{
     assert.equal(account.walletNetworkFeesLamports,'0');assert.equal(proof.networkFeeLamports,'5400');
     assert.equal(account.transactions.some(tx=>tx.signature===proof.signature),false);
    }
    const unvalued=await readServerPerpsDailyAccount(who,{...dailyFailure.options,readNetworkFees:undefined});
    assert.throws(()=>proveAccountedFailedEntryConversion({...completionInput,account:unvalued}));
    const completion=proveAccountedFailedEntryConversion({...completionInput,account});
    assert.equal(completion.feeIncludedInCurrentDay,!priorDay);assert.equal(completion.accountingDay,account.day);
    assert.equal(completion.day,proof.day);assert.equal(completion.day===account.day,!priorDay);
    assert.throws(()=>executionJournal.completeFailedEntryConversion({...completion}));
    const recoveringService=createBotManualPerpsService({...deps,rpcRequest:options.request,readFinalizedAccount:()=>readServerPerpsDailyAccount(who,dailyFailure.options)});
    const closed=await recoveringService.recover({...who,id:review.id});assert.equal(closed.state,'CANCELLED');assert.equal(executionJournal.read(review.id).closed_slot,120);
    assert.equal((await recoveringService.recover({...who,id:review.id})).state,'CANCELLED');
    assert.equal(journal.read(row.id).state,'FAILED');assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'0');
    assert.equal(executionJournal.riskState(walletAddress).executedToday,0);assert.throws(()=>executionJournal.completeFailedEntryConversion(completion));
    assert.equal((await readServerPerpsDailyAccount(who,dailyFailure.options)).lossTodayUsdcUnits,expectedTodayFee);assert.equal(sends,1);
    await verifyCompletedArchive(review.id);return;
   }
   if(mode.startsWith('opening')){
    const hold=executionJournal.entryConversionHold(review.id),first=journal.read(hold.conversion_id),stored=JSON.parse(first.review);
    const finalized=await conversionReceiptFixture({entry:true,asset,fixtureSignedEntryWire:first.signed,fixtureWalletAddress:walletAddress,entryMinimumUnits:stored.minimumCollateralUnits});
    runtimeNow+=120000;
    if(mode==='opening-return-prior')runtimeNow=Date.parse(new Date(runtimeNow).toISOString().slice(0,10)+'T00:00:00Z')+86400000+120000;
    const recoveryRequest=async(method,params)=>method==='getMultipleAccounts'?
     {context:{slot:130},value:params[0].map(key=>finalized.before.get(key))}:finalized.request(method,params);
    const bound=await recoverHeldPerpsEntryCollateral({executionJournal,journal,reservationId:review.id,ownerAccountHash},{request:recoveryRequest,now:common.now,monotonicNow:()=>0});
    assert.equal(journal.read(first.id).state,'FINALIZED');assert.equal(executionJournal.read(review.id).state,'RESERVED');
    const unsignedRecovery=bindRecoverablePerpsEntryCollateral({journal:executionJournal,reservationId:review.id,entryBinding:bound},{now:common.now});
    assert.equal(unsignedRecovery.openingSignature,null);assert.equal(unsignedRecovery.amountUnits,bound.receivedCollateralUnits);
    assert.equal(readRecoverablePerpsEntryCollateral(unsignedRecovery),unsignedRecovery);
    if(mode==='opening'||mode.startsWith('opening-return')){
     let unsentReturn=await conversionFixture({asset,walletAddress,amountUnits:unsignedRecovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,strictWire:false,nowMs:runtimeNow});
     const unsentPreparation=await preparePerpsEntryCollateralRecovery(unsignedRecovery,{request:unsentReturn.request,now:common.now,monotonicNow:()=>0});
     let accounting,recoveryQuoteBank=null,recoveryServiceSends=0,refuseRecovery=false,interruptReturn=mode==='opening-return-retry';
     const recoveryVault={...vault,signBotSwap:grant=>{const signed=vault.signBotSwap(grant);if(interruptReturn){interruptReturn=false;refuseRecovery=true;}return signed;}};
     const recoveryService=createBotManualPerpsService({...deps,
      vault:recoveryVault,
      fetchImpl:(...args)=>accounting?accounting.fetchImpl(...args):deps.fetchImpl(...args),
      readFinalizedAccount:()=>readServerPerpsDailyAccount(who,accounting),
      rpcRequest:async(method,params)=>{
       if(accounting){
        if(recoveryQuoteBank&&!['getTransaction','getSignatureStatuses'].includes(method))return recoveryQuoteBank.request(method,method==='simulateTransaction'?[params[0],{...params[1],sigVerify:false}]:params);
        return accounting.request(method,params);
       }
       if(['getTransaction','getSignatureStatuses'].includes(method))return finalized.request(method,params);
       if(method==='simulateTransaction')return refuseRecovery?{context:{slot:params[1].minContextSlot},value:{err:'BlockhashNotFound'}}:unsentReturn.request(method,[params[0],{...params[1],sigVerify:false}]);
       return unsentReturn.request(method,params);
      },sendRequest:async()=>{const pending=journal.pending(walletAddress)[0];assert.equal(pending.state,'UNKNOWN');recoveryServiceSends++;if(mode.startsWith('opening-return-failed-retry')&&recoveryServiceSends===2)throw Error('MOCK_REPLACEMENT_ACK_LOST');return pending.signature;}});
     if(mode.startsWith('opening-return')){
      await assert.rejects(recoveryService.prepareRecovery({...who,ownerAccountHash:'a'.repeat(64),id:review.id}));
      const recoveryClient=await boundaryClient(recoveryService);let recoveryReview=await recoveryClient.prepareRecovery(walletAddress,review.id),abortedRow=null;
      assert.equal(recoveryReview.stage,'BOT_MANUAL_ENTRY_RECOVERY_REVIEW');assert.equal(recoveryReview.platformFeeUsdcUnits,'0');
      const confirmRecovery={...who,id:recoveryReview.id,explicitApproval:true};
      await assert.rejects(recoveryService.confirmRecovery({...confirmRecovery,explicitApproval:false}));assert.equal(recoveryServiceSends,0);
      await assert.rejects(recoveryClient.confirmRecovery(recoveryReview,false));assert.equal(recoveryServiceSends,0);
      if(mode==='opening-return-retry'){
       const oldReview=recoveryReview,stale=await recoveryClient.prepareRecovery(walletAddress,review.id);
       await assert.rejects(recoveryClient.confirmRecovery(oldReview,true));assert.equal(recoveryServiceSends,0);
       const aborted=await recoveryClient.recoverRecovery(walletAddress,review.id);
       assert.equal(aborted.state,'ABORTED');assert.equal(aborted.requiresNewReview,true);assert.equal(aborted.originalRiskReleased,false);
       abortedRow=journal.read(aborted.id);assert.ok(abortedRow.signed);assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');
       await assert.rejects(recoveryClient.confirmRecovery(oldReview,true));await assert.rejects(recoveryClient.confirmRecovery(stale,true));
       refuseRecovery=false;
       await assert.rejects(recoveryClient.prepareRecovery(walletAddress,review.id));assert.equal(recoveryServiceSends,0);
       unsentReturn=await conversionFixture({asset,walletAddress,amountUnits:unsignedRecovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,strictWire:false,nowMs:runtimeNow,blockhash:bs58.encode(Buffer.alloc(32,11))});
       recoveryReview=await recoveryClient.prepareRecovery(walletAddress,review.id);assert.notEqual(recoveryReview.id,oldReview.id);
      }
      const pending=await recoveryClient.confirmRecovery(recoveryReview,true);assert.equal(pending.state,'UNKNOWN');assert.equal(recoveryServiceSends,1);
      if(abortedRow){assert.notEqual(pending.id,abortedRow.id);assert.deepEqual(journal.read(abortedRow.id),abortedRow);assert.notEqual(pending.signature,abortedRow.signature);}
      await assert.rejects(recoveryService.confirmRecovery(confirmRecovery));assert.equal(recoveryServiceSends,1);
      await assert.rejects(recoveryClient.confirmRecovery(recoveryReview,true));assert.equal(recoveryServiceSends,1);
      const returned=await conversionReceiptFixture({asset,fixtureSignedCloseWire:journal.read(pending.id).signed,fixtureWalletAddress:walletAddress,closeMinimumUnits:recoveryReview.minimumUsdcUnits,
       amountUnits:unsignedRecovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,nowMs:runtimeNow,finalizedSlot:200,blockhash:unsentReturn.wire.blockhash});
      if(mode==='opening-return-old-finality')runtimeNow+=86400000;
      if(mode.startsWith('opening-return-failed')){
       const priorReturnDay=mode==='opening-return-failed-prior';
       const error={InstructionError:[3,'InvalidArgument']};returned.status.err=error;returned.transaction.meta.err=error;returned.transaction.meta.innerInstructions=null;
       returned.transaction.meta.postTokenBalances=structuredClone(returned.transaction.meta.preTokenBalances);
       returned.transaction.meta.postBalances=[...returned.transaction.meta.preBalances];returned.transaction.meta.postBalances[0]-=5400;
       for(const [key,value]of returned.before)returned.after.set(key,structuredClone(value));returned.after.get(walletAddress).lamports-=5400;
       if(priorReturnDay)runtimeNow+=86400000;
       accounting=unsignedRecoveryAccountFixture(finalized,returned,{journal:executionJournal,swapJournal:journal,now:runtimeNow});
       const input={journal,executionJournal,id:pending.id,ownerAccountHash};let age=0;
       const options={request:accounting.request,now:accounting.now,monotonicNow:()=>age};
       returned.status.confirmationStatus='confirmed';assert.equal(await readFailedPerpsEntryRecovery(input,options),null);
       returned.status.confirmationStatus='finalized';const proof=await readFailedPerpsEntryRecovery(input,options);
       assert.equal(proof.slot,200);assert.equal(proof.networkFeeLamports,'5400');assert.equal(proof.originalRiskReleased,false);
       assert.equal(requireFailedPerpsEntryRecovery(proof),proof);assert.throws(()=>requireFailedPerpsEntryRecovery({...proof}));
       const sourceRow=journal.read(first.id),changedSource=new DatabaseSync(join(root,'swaps.sqlite'));
       try{
        changedSource.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(sourceRow.updated+1,first.id);
        assert.throws(()=>requireFailedPerpsEntryRecovery(proof));
       }finally{changedSource.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(sourceRow.updated,first.id);changedSource.close();}
       await assert.rejects(readFailedPerpsEntryRecovery({...input,ownerAccountHash:'a'.repeat(64)},options));
       await assert.rejects(readFailedPerpsEntryRecovery(input,{...options,request:async(method,params)=>{
        const reply=await accounting.request(method,params);
        return method==='getSignatureStatuses'&&params[0][0]===pending.signature?{...reply,context:null}:reply;
       }}));
       const originalWire=returned.transaction.transaction[0],bad=Buffer.from(originalWire,'base64');bad[1]^=1;returned.transaction.transaction[0]=bad.toString('base64');
       await assert.rejects(readFailedPerpsEntryRecovery(input,options));returned.transaction.transaction[0]=originalWire;
       returned.transaction.meta.postBalances[1]++;await assert.rejects(readFailedPerpsEntryRecovery(input,options));returned.transaction.meta.postBalances[1]--;
       const tokens=structuredClone(returned.transaction.meta.postTokenBalances);returned.transaction.meta.postTokenBalances=[];
       await assert.rejects(readFailedPerpsEntryRecovery(input,options));returned.transaction.meta.postTokenBalances=tokens;
       age=10001;assert.throws(()=>requireFailedPerpsEntryRecovery(proof));age=0;
       const unvalued=await readServerPerpsDailyAccount(who,{...accounting,readNetworkFees:undefined});
       assert.throws(()=>reconcileAccountedFailedPerpsEntryRecovery(proof,{journal,executionJournal,account:unvalued}));
       if(!priorReturnDay){const omitted=await readServerPerpsDailyAccount(who,{...accounting,request:async(method,params)=>{
        const reply=await accounting.request(method,params);return method==='getSignaturesForAddress'?reply.filter(row=>row.signature!==pending.signature):reply;
       }});
       assert.throws(()=>reconcileAccountedFailedPerpsEntryRecovery(proof,{journal,executionJournal,account:omitted}));}
       const account=await readServerPerpsDailyAccount(who,accounting);
       assert.equal(account.failedTransactions,priorReturnDay?0:1);assert.equal(account.walletNetworkFeesLamports,priorReturnDay?'0':'10800');
       assert.throws(()=>reconcileAccountedFailedPerpsEntryRecovery(proof,{journal,executionJournal,account:{...account}}));
       const failed=await recoveryClient.recoverRecovery(walletAddress,review.id);
       assert.equal(failed.state,'FAILED');assert.equal(failed.originalRiskReleased,false);assert.equal(failed.readyForRetry,false);
       assert.equal(failed.feeIncludedInCurrentDay,!priorReturnDay);assert.equal(failed.accountingDay,account.day);
       assert.equal(journal.read(pending.id).state,'FAILED');assert.equal(journal.pending(walletAddress).length,0);
       assert.equal(executionJournal.read(review.id).state,'RESERVED');assert.equal(executionJournal.entryConversionHold(review.id).state,'FINALIZED');
       assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');
       assert.throws(()=>requireFailedPerpsEntryRecovery(proof));
       const freshFailure=await readFailedPerpsEntryRecovery(input,options),currentAccount=await readServerPerpsDailyAccount(who,accounting);
       const auditArgs={journal,executionJournal,account:currentAccount,ownerAccountHash};
       const evidence=proveAccountedEntryRecoveryFailures([freshFailure],auditArgs);
       assert.equal(requireAccountedEntryRecoveryFailures(evidence,auditArgs),evidence);
       assert.equal(evidence.readyForSigning,false);assert.equal(evidence.readyForRetry,false);assert.equal(evidence.originalRiskReleased,false);
       assert.equal(evidence.requiresFreshExplicitApproval,true);assert.equal(evidence.previousRecoveryId,pending.id);
       assert.deepEqual(evidence.failedSignatures,[pending.signature]);assert.equal(evidence.day,currentAccount.day);
       assert.throws(()=>requireAccountedEntryRecoveryFailures({...evidence}));
       assert.throws(()=>requireAccountedEntryRecoveryFailures(evidence,{...auditArgs,previousRecoveryId:'f'.repeat(64)}));
       assert.throws(()=>proveAccountedEntryRecoveryFailures([{...freshFailure}],auditArgs));
       assert.throws(()=>proveAccountedEntryRecoveryFailures([],auditArgs));
       assert.throws(()=>proveAccountedEntryRecoveryFailures([freshFailure,freshFailure],auditArgs));
       assert.throws(()=>proveAccountedEntryRecoveryFailures([freshFailure],{...auditArgs,ownerAccountHash:'a'.repeat(64)}));
       assert.throws(()=>proveAccountedEntryRecoveryFailures([freshFailure],{...auditArgs,account:{...currentAccount}}));
       assert.throws(()=>proveAccountedEntryRecoveryFailures([freshFailure],{...auditArgs,account:unvalued}));
       const failedRow=journal.read(pending.id),changedFailure=new DatabaseSync(join(root,'swaps.sqlite'));
       try{
        changedFailure.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(failedRow.updated+1,pending.id);
        assert.throws(()=>requireAccountedEntryRecoveryFailures(evidence));
       }finally{changedFailure.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(failedRow.updated,pending.id);changedFailure.close();}
       age=10001;assert.throws(()=>requireAccountedEntryRecoveryFailures(evidence));age=0;
       await assert.rejects(recoveryClient.confirmRecovery(evidence,true));assert.equal(recoveryServiceSends,1);
       if(mode==='opening-return-failed-claim'){
        const bank=await conversionFixture({asset,walletAddress,amountUnits:unsignedRecovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,strictWire:false,
         nowMs:accounting.now(),blockhash:bs58.encode(Buffer.alloc(32,12)),ownerLamports:BigInt(returned.after.get(walletAddress).lamports)});
        const preparedAgain=await preparePerpsEntryCollateralRecovery(unsignedRecovery,{request:bank.request,now:accounting.now,monotonicNow:()=>age,minimumSlot:evidence.minimumSlot});
        assert.equal(preparedAgain.observedSlot>=evidence.minimumSlot,true);
        const claimOptions={journal,executionJournal,ownerAccountHash,controlRevision:controls.read(who).revision,explicitApproval:true,previousRecoveryId:pending.id};
        assert.throws(()=>claimWithAccountedEntryRecoveryFailures(evidence,{...auditArgs,previousRecoveryId:pending.id,newAttemptId:null},()=>assert.fail('No null-ID claim')));
        assert.throws(()=>claimWithAccountedEntryRecoveryFailures(evidence,{...auditArgs,previousRecoveryId:pending.id,newAttemptId:pending.id},()=>assert.fail('No original-ID claim')));
        assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(preparedAgain,claimOptions));
        assert.throws(()=>executionJournal.claimEntryRecoverySwap(preparedAgain,{swapJournal:journal,ownerAccountHash,review:{previousRecoveryId:pending.id,previousFailure:evidence.previousFailure}}));
        assert.throws(()=>executionJournal.claimEntryRecoverySwap(preparedAgain,{swapJournal:journal,ownerAccountHash,review:{previousRecoveryId:pending.id,previousFailure:evidence.previousFailure},failureEvidence:{...evidence}}));
        assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(preparedAgain,{...claimOptions,failureEvidence:{...evidence}}));
        assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(preparedAgain,{...claimOptions,failureEvidence:evidence,explicitApproval:false}));
        assert.equal(unsentPreparation.observedSlot<evidence.minimumSlot,true);
        assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(unsentPreparation,{...claimOptions,failureEvidence:evidence}));
        assert.equal(journal.pending(walletAddress).length,0);
        const intent=recordPerpsEntryCollateralRecoveryIntent(preparedAgain,{...claimOptions,failureEvidence:evidence});
        const privateIntent=readPerpsEntryCollateralRecoveryIntent(intent);
        assert.equal(requireAccountedEntryRecoveryFailures(evidence),evidence);
        assert.equal(journal.read(pending.id).state,'FAILED');assert.notEqual(intent.id,pending.id);
        const originalFailed=journal.read(pending.id),changedAncestor=new DatabaseSync(join(root,'swaps.sqlite'));
        try{
         changedAncestor.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(originalFailed.updated+1,pending.id);
         assert.throws(()=>requireAccountedEntryRecoveryFailures(evidence));assert.throws(()=>readPerpsEntryCollateralRecoveryIntent(intent));
        }finally{changedAncestor.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(originalFailed.updated,pending.id);changedAncestor.close();}
        assert.throws(()=>claimWithAccountedEntryRecoveryFailures(evidence,{...auditArgs,previousRecoveryId:pending.id,newAttemptId:'e'.repeat(64)},()=>assert.fail('No repeated claim')));
        const signing=authorizeBotEntryCollateralRecoveryCustody({intent,ownerAccountHash,controls,backupRegistry,explicitApproval:true,assertCurrent:()=>{}});
        const signed=vault.signBotSwap(signing.grant);journal.signed(privateIntent.claim,signed);
        assert.throws(()=>vault.signBotSwap(signing.grant));assert.equal(readPerpsEntryCollateralRecoveryIntent(intent,{signed:true}).prepared,preparedAgain);
        journal.recoverNeverBroadcast(intent.id,ownerAccountHash);
        assert.equal(journal.read(intent.id).state,'ABORTED');assert.equal(journal.read(pending.id).state,'FAILED');
        assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');assert.equal(recoveryServiceSends,1);
        await verifyCompletedArchive(review.id);return;
       }
       assert.equal((await recoveryClient.recoverRecovery(walletAddress,review.id)).state,'FAILED');
       recoveryQuoteBank=await conversionFixture({asset,walletAddress,amountUnits:unsignedRecovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,strictWire:false,
        nowMs:runtimeNow,blockhash:unsentReturn.wire.blockhash,ownerLamports:BigInt(returned.after.get(walletAddress).lamports)});
       await assert.rejects(recoveryClient.prepareRecovery(walletAddress,review.id),/bot-manual-recovery-review-required/);assert.equal(recoveryServiceSends,1);
       if(mode.startsWith('opening-return-failed-retry')){
        const failedSnapshot=journal.read(pending.id);
        recoveryQuoteBank=await conversionFixture({asset,walletAddress,amountUnits:unsignedRecovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,strictWire:false,
         nowMs:runtimeNow,blockhash:bs58.encode(Buffer.alloc(32,13)),ownerLamports:BigInt(returned.after.get(walletAddress).lamports)});
        const freshReview=await recoveryClient.prepareRecovery(walletAddress,review.id);assert.notEqual(freshReview.id,recoveryReview.id);assert.equal(freshReview.maxSlippageBps,50);
        await assert.rejects(recoveryClient.confirmRecovery(freshReview,false));assert.equal(recoveryServiceSends,1);
        const replacement=await recoveryClient.confirmRecovery(freshReview,true);assert.equal(replacement.state,'UNKNOWN');assert.equal(replacement.acknowledged,false);assert.equal(recoveryServiceSends,2);
        assert.notEqual(replacement.id,pending.id);assert.notEqual(replacement.signature,pending.signature);assert.deepEqual(journal.read(pending.id),failedSnapshot);
        await assert.rejects(recoveryClient.confirmRecovery(freshReview,true));assert.equal(recoveryServiceSends,2);
        const completedReturn=await conversionReceiptFixture({asset,fixtureSignedCloseWire:journal.read(replacement.id).signed,fixtureWalletAddress:walletAddress,
         closeMinimumUnits:freshReview.minimumUsdcUnits,amountUnits:unsignedRecovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,nowMs:runtimeNow,finalizedSlot:220,
         blockhash:recoveryQuoteBank.wire.blockhash,ownerLamports:BigInt(returned.after.get(walletAddress).lamports)});
        const priorRetry=mode==='opening-return-failed-retry-prior';if(priorRetry)runtimeNow+=86400000;
        accounting=unsignedRecoveryAccountFixture(finalized,completedReturn,{journal:executionJournal,swapJournal:journal,now:runtimeNow,priorReturns:[returned]});
        if(priorRetry){
         await reconcileRecordedPerpsEntryRecovery({journal,executionJournal,id:replacement.id,ownerAccountHash},{request:accounting.request,now:accounting.now,monotonicNow:()=>0});
         const account=await readServerPerpsDailyAccount(who,accounting),input={journal:executionJournal,swapJournal:journal,reservationId:review.id,signature:replacement.signature,ownerAccountHash,account};
         const options={request:accounting.request,fetchImpl:accounting.fetchImpl,now:accounting.now,monotonicNow:()=>0};
         const costs=await readHistoricalPerpsEntryRecoveryCosts(input,options);assert.equal(costs.historicalNetworkFeeUsdUnits,'1620');
         await assert.rejects(()=>readHistoricalPerpsEntryRecoveryCosts(input,{...options,request:async(method,params)=>
          method==='getTransaction'&&params[0]===pending.signature?null:accounting.request(method,params)}));
         const current=journal.read(replacement.id),raw=new DatabaseSync(join(root,'swaps.sqlite'));
         try{
          const changed=JSON.parse(current.review);changed.previousFailure.slot++;
          raw.prepare('UPDATE bot_wallet_swaps SET review=? WHERE id=?').run(JSON.stringify(changed),replacement.id);
          assert.throws(()=>requireHistoricalPerpsEntryRecoveryCosts(costs,input));
          await assert.rejects(()=>readHistoricalPerpsEntryRecoveryCosts(input,options));
         }finally{raw.prepare('UPDATE bot_wallet_swaps SET review=? WHERE id=?').run(current.review,replacement.id);raw.close();}
         assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');assert.equal(recoveryServiceSends,2);
        }
        const completed=await recoveryClient.recoverRecovery(walletAddress,review.id);
        assert.equal(completed.state,'CANCELLED');assert.equal(completed.originalRiskReleased,true);
        assert.deepEqual(await recoveryClient.recoverRecovery(walletAddress,review.id),completed);assert.equal(recoveryServiceSends,2);
        assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'0');assert.deepEqual(journal.read(pending.id),failedSnapshot);
        const finalAccount=await readServerPerpsDailyAccount(who,accounting);
        assert.equal(finalAccount.failedTransactions,priorRetry?0:1);assert.equal(finalAccount.walletNetworkFeesLamports,priorRetry?'0':'16200');assert.equal(finalAccount.entryRecoveries.length,priorRetry?0:1);
        assert.equal(actualFeeJournal.read(review.id),null);await verifyCompletedArchive(review.id);return;
       }
       if(recoveryClient.getTrace){
        const trace=recoveryClient.getTrace();
        assert.deepEqual(trace.map(row=>[row.action,row.status]),[
         ['botManualRecoveryPrepare',200],['botManualRecoveryConfirm',200],
         ['botManualRecoveryRecover',200],['botManualRecoveryRecover',200],['botManualRecoveryPrepare',409]
        ]);
        assert.equal(trace[2].stage,'ACCOUNTED_FAILED_ENTRY_RECOVERY');
        assert.equal(trace.at(-1).errorCode,'bot-manual-recovery-review-required');
        assert.equal(trace.every(row=>Object.keys(row).sort().join(',')==='action,errorCode,stage,status'),true);
       }
       assert.equal(actualFeeJournal.read(review.id),null);await verifyCompletedArchive(review.id);return;
      }
      accounting=unsignedRecoveryAccountFixture(finalized,returned,{journal:executionJournal,swapJournal:journal,now:runtimeNow});
      if(['opening-return-prior','opening-return-old-finality'].includes(mode)){
       const oldReturn=mode==='opening-return-old-finality';
       await reconcileRecordedPerpsEntryRecovery({journal,executionJournal,id:pending.id,ownerAccountHash},{request:accounting.request,now:accounting.now,monotonicNow:()=>0});
       const account=await readServerPerpsDailyAccount(who,accounting),auditInput={journal:executionJournal,swapJournal:journal,reservationId:review.id,signature:pending.signature,ownerAccountHash,account};
       assert.equal(account.entryConversions.length,0);assert.equal(account.walletNetworkFeesLamports,oldReturn?'0':'5400');
       assert.equal(account.entryRecoveries.length,oldReturn?0:1);
       assert.throws(()=>proveAccountedPerpsEntryRecovery({journal:executionJournal,swapJournal:journal,reservationId:review.id,signature:pending.signature,account}));
       let auditAge=0,auditNow=accounting.now();
       const auditOptions={request:accounting.request,fetchImpl:accounting.fetchImpl,now:()=>auditNow,monotonicNow:()=>auditAge};
       const costs=await readHistoricalPerpsEntryRecoveryCosts(auditInput,auditOptions);
       assert.equal(costs.initialDay,new Date(finalized.transaction.blockTime*1000).toISOString().slice(0,10));assert.notEqual(costs.initialDay,costs.accountingDay);
       assert.equal(costs.historicalNetworkFeeUsdUnits,oldReturn?'1080':'540');assert.equal(costs.originalRiskReleased,false);
       assert.equal(costs.recoverySlot,200);assert.equal(costs.receivedUsdcUnits,String(returned.received));
       assert.equal(BigInt(costs.historicalRecoveryLossUsdUnits)>0n,oldReturn);
       if(oldReturn){
        const day=new Date(returned.transaction.blockTime*1000).toISOString().slice(0,10);
        const tx=await readServerPerpsTradeTransaction({walletAddress,signature:pending.signature,day},{request:accounting.request,now:accounting.now,monotonicNow:()=>0,requireTradeEvent:false});
        const fact=await readJournalledPerpsEntryRecovery(tx,{journal:executionJournal,swapJournal:journal,request:accounting.request,now:accounting.now,monotonicNow:()=>0});
        const input={recoveries:[fact],day},options={fetchImpl:accounting.fetchImpl,now:()=>auditNow,monotonicNow:()=>auditAge};
        const readValue=createHistoricalPerpsEntryRecoveryUsdValuationReader(options),value=await readValue(input);
        assert.equal(value.recoveryLossUsdUnits,costs.historicalRecoveryLossUsdUnits);assert.equal(value.networkFeesIncluded,false);
        assert.equal(requireHistoricalPerpsEntryRecoveryUsdValuation(value,input),value);
        assert.throws(()=>requirePerpsEntryRecoveryUsdValuation(value,input));assert.throws(()=>requireHistoricalPerpsEntryRecoveryUsdValuation({...value},input));
        await assert.rejects(()=>createPerpsEntryRecoveryUsdValuationReader(options)(input));
        await assert.rejects(()=>readValue({recoveries:[{...fact}],day}));await assert.rejects(()=>readValue({recoveries:[fact,fact],day}));
        auditAge=10001;assert.throws(()=>requireHistoricalPerpsEntryRecoveryUsdValuation(value,input));auditAge=0;
       }
       assert.equal(requireHistoricalPerpsEntryRecoveryCosts(costs,auditInput),costs);
       assert.throws(()=>requireHistoricalPerpsEntryRecoveryCosts({...costs},auditInput));
       assert.throws(()=>requireHistoricalPerpsEntryRecoveryCosts(costs,{...auditInput,account:{...account}}));
       assert.throws(()=>proveAccountedPerpsEntryRecovery({journal:executionJournal,swapJournal:journal,reservationId:review.id,signature:pending.signature,account,historicalCosts:{...costs}}));
       const completion=proveAccountedPerpsEntryRecovery({journal:executionJournal,swapJournal:journal,reservationId:review.id,signature:pending.signature,account,historicalCosts:costs});
       assert.equal(requireAccountedPerpsEntryRecovery(completion),completion);assert.equal(completion.lossTodayUsdcUnits,account.lossTodayUsdcUnits);
       await assert.rejects(()=>readHistoricalPerpsEntryRecoveryCosts({...auditInput,ownerAccountHash:'a'.repeat(64)},auditOptions));
       await assert.rejects(()=>readHistoricalPerpsEntryRecoveryCosts(auditInput,{...auditOptions,fetchImpl:async(url,options)=>new URL(url).hostname==='api.exchange.coinbase.com'?Response.json([]):accounting.fetchImpl(url,options)}));
       const savedSource=journal.read(first.id),rawAudit=new DatabaseSync(join(root,'swaps.sqlite'));
       try{
        rawAudit.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(savedSource.updated+1,first.id);
        assert.throws(()=>requireHistoricalPerpsEntryRecoveryCosts(costs,auditInput));assert.throws(()=>requireAccountedPerpsEntryRecovery(completion));
       }finally{rawAudit.prepare('UPDATE bot_wallet_swaps SET updated=? WHERE id=?').run(savedSource.updated,first.id);rawAudit.close();}
       auditAge=10001;assert.throws(()=>requireHistoricalPerpsEntryRecoveryCosts(costs,auditInput));assert.throws(()=>requireAccountedPerpsEntryRecovery(completion));auditAge=0;
       auditNow--;assert.throws(()=>requireHistoricalPerpsEntryRecoveryCosts(costs,auditInput));auditNow++;
       auditNow+=86400000;assert.throws(()=>requireHistoricalPerpsEntryRecoveryCosts(costs,auditInput));auditNow-=86400000;
       assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');assert.equal(recoveryServiceSends,1);
      }
      const completed=await recoveryClient.recoverRecovery(walletAddress,review.id);assert.equal(completed.state,'CANCELLED');assert.equal(completed.originalRiskReleased,true);
      assert.deepEqual(await recoveryClient.recoverRecovery(walletAddress,review.id),completed);assert.equal(recoveryServiceSends,1);
      const account=await readServerPerpsDailyAccount(who,accounting);assert.equal(account.tradesToday,0);assert.equal(account.failedTransactions,0);
      assert.equal(account.walletNetworkFeesLamports,mode==='opening-return-old-finality'?'0':mode==='opening-return-prior'?'5400':'10800');
      assert.equal(account.entryRecoveries.length,mode==='opening-return-old-finality'?0:1);
      assert.equal(executionJournal.riskState(walletAddress).executedToday,0);assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'0');
      assert.equal(actualFeeJournal.read(review.id),null);await verifyCompletedArchive(review.id);return;
     }
     const unsentIntent=recordPerpsEntryCollateralRecoveryIntent(unsentPreparation,{journal,executionJournal,ownerAccountHash,controlRevision:state.revision,explicitApproval:true});
     assert.throws(()=>executionJournal.beginSigning(review.id,{entryBinding:bound}),/PERPS_ENTRY_COLLATERAL_RECOVERY_PENDING/);
     assert.equal(executionJournal.read(review.id).state,'RESERVED');
     assert.throws(()=>authorizeBotFailedEntryRecoveryCustody({intent:unsentIntent,ownerAccountHash,controls,backupRegistry,explicitApproval:true,assertCurrent:()=>{}}));
     const unsignedRecoveryGrant=authorizeBotEntryCollateralRecoveryCustody({intent:unsentIntent,ownerAccountHash,controls,backupRegistry,explicitApproval:true,assertCurrent:()=>{}});
     const unsignedRecoverySigned=vault.signBotSwap(unsignedRecoveryGrant.grant);journal.signed(unsignedRecoveryGrant.claim,unsignedRecoverySigned);
     assert.throws(()=>vault.signBotSwap(unsignedRecoveryGrant.grant));
     journal.recoverNeverBroadcast(unsentIntent.id,ownerAccountHash);
     assert.equal(requireAvailablePerpsEntryCollateralForOpening(bound),bound);
    }
    const native=structuredClone(finalized.before.get(finalized.c.address)),bytes=Buffer.from(native.data[0],'base64');bytes[202]=1;native.data[0]=bytes.toString('base64');
    const market=decodeServerPerpsCustody(asset,finalized.c.address,native);
    const opening=await entryOpeningFixture({...finalized,receiptOptions:{...finalized.receiptOptions,now:common.now}},
     {walletAddress,asset,side:'LONG',marginUsd:'10',leverage:3,maxSlippageBps:50,referencePrice:'100',stopLoss:draft.stopLoss??null,takeProfit:draft.takeProfit??null},bound,market);
    const daily=entryDailyAccountFixture(finalized,{journal:executionJournal,swapJournal:journal});let openingSends=0,openingSigned;
    let interruptedSigned=null,interruptSigning=mode==='opening-sign-fail';
    const openingVault=mode==='opening-sign-fail'?{...vault,signManualEntry:grant=>{
     if(interruptSigning){interruptSigning=false;interruptedSigned=vault.signManualEntry(grant);throw Error('MOCK_INTERRUPTED_BEFORE_BROADCAST_IDENTITY');}
     assert.throws(()=>executionJournal.recordBroadcastIntent(review.id,interruptedSigned),/ENTRY_SIGNING_LEASE_CHANGED/);
     return vault.signManualEntry(grant);
    }}:vault;
    const openingDeps={...deps,vault:openingVault,readAccount:()=>readServerPerpsDailyAccount(who,daily.options),readFinalizedAccount:()=>readServerPerpsDailyAccount(who,daily.options),
     rpcRequest:(method,params)=>['getSignatureStatuses','getTransaction'].includes(method)?finalized.request(method,params):
      method==='getMultipleAccounts'&&params[0].length===2&&params[0][0]===finalized.u.address?recoveryRequest(method,params):opening.request(method,params),
     builderRequest:opening.builderRequest,
     fetchImpl:async(url,options)=>{
      assert.equal(url,'https://perps-api.jup.ag/v2/transaction/execute');assert.equal(options.method,'POST');
      const saved=executionJournal.read(review.id);assert.equal(saved.state,'UNCERTAIN');assert.equal(JSON.parse(options.body).action,'increase-position');
      const wire=Buffer.from(JSON.parse(options.body).serializedTxBase64,'base64');assert.equal(wire[0],3);assert.equal(bs58.encode(wire.subarray(1,65)),saved.signature);
      openingSigned=wire.toString('base64');openingSends++;if(mode==='opening-timeout')throw Error('MOCK_OPENING_TIMEOUT');return Response.json({ok:true});
     }};
    const openingService=createBotManualPerpsService(openingDeps),openingClient=await boundaryClient(openingService);
    const openingReview=await openingClient.prepare(walletAddress,draft,{entryReservationId:review.id});
    assert.equal(openingReview.entryReservationId,review.id);assert.notEqual(openingReview.id,review.id);assert.equal(openingSends,0);
    const openConfirm={...who,id:openingReview.id,explicitApproval:true,explicitFeeApproval:true,feeTermsVersion:PERPS_PLATFORM_FEE.version};
    await assert.rejects(()=>openingService.confirm({...openConfirm,explicitApproval:false}));
    await assert.rejects(()=>openingService.confirm({...openConfirm,explicitFeeApproval:false}));
    await assert.rejects(()=>openingClient.confirm(review,true,true));
    await assert.rejects(()=>openingClient.confirm(openingReview,false,true));
    await assert.rejects(()=>openingClient.confirm(openingReview,true,false));
    assert.equal(openingSends,0);assert.equal(executionJournal.read(review.id).state,'RESERVED');
    let opened=await openingClient.confirm(openingReview,true,true);
    if(mode==='opening-sign-fail'){
     assert.equal(opened.state,'SIGNING');assert.equal(openingSends,0);assert.equal(sends,1);
     assert.equal(executionJournal.read(review.id).signature,null);
     const epoch=executionJournal.entryConversionHold(review.id).updated;
     assert.throws(()=>executionJournal.recoverNeverBroadcastManualOpening(review.id,{walletAddress,swapJournal:undefined}));
     assert.throws(()=>executionJournal.recoverNeverBroadcastManualOpening(review.id,{walletAddress,swapJournal:journal,ownerAccountHash:'a'.repeat(64)}));
     assert.equal(executionJournal.entryConversionHold(review.id).updated,epoch);
     const recovered=await openingClient.recover(walletAddress,review.id);
     assert.equal(recovered.state,'RESERVED');assert.equal(recovered.requiresNewReview,true);
     assert.equal(executionJournal.entryConversionHold(review.id).updated>epoch,true);
     assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');
     assert.equal(executionJournal.read(review.id).entry_exit_plan,null);
     await verifyCompletedArchive(review.id);
     await assert.rejects(()=>openingClient.confirm(openingReview,true,true));
     const fresh=await openingClient.prepare(walletAddress,draft,{entryReservationId:review.id});
     assert.notEqual(fresh.id,openingReview.id);assert.equal(openingSends,0);
     opened=await openingClient.confirm(fresh,true,true);
     await assert.rejects(()=>openingClient.confirm(fresh,true,true));
    }
    assert.throws(()=>readRecoverablePerpsEntryCollateral(unsignedRecovery));
    assert.equal(opened.id,review.id);assert.equal(opened.state,'UNCERTAIN');assert.equal(openingSends,1);assert.equal(sends,1);
    assert.throws(()=>executionJournal.recoverNeverBroadcastManualOpening(review.id,{walletAddress,swapJournal:journal}),/RECONCILIATION_REQUIRED/);
    assert.equal(executionJournal.pending(walletAddress).length,1);assert.equal(executionJournal.entryConversionHold(review.id).state,'FINALIZED');
    const exitPlan=JSON.parse(executionJournal.read(review.id).entry_exit_plan);assert.equal(exitPlan.exits.length,1);assert.equal(exitPlan.exits[0].kind,'SL');
    const riskDb=new DatabaseSync(join(root,'risk.sqlite'),{readOnly:true});
    try{assert.deepEqual(riskDb.prepare('SELECT address FROM perps_exit_request_bindings WHERE reservation=?').all(review.id).map(row=>row.address),exitPlan.exits.map(exit=>exit.address));}finally{riskDb.close();}
    await assert.rejects(()=>openingService.confirm(openConfirm));assert.equal(openingSends,1);
    await assert.rejects(()=>openingClient.confirm(openingReview,true,true));assert.equal(openingSends,1);
    const feeDb=new DatabaseSync(join(root,'fees.sqlite'),{readOnly:true});
    try{assert.equal(feeDb.prepare('SELECT COUNT(*) AS n FROM perps_platform_fee_consents').get().n,1);assert.equal(feeDb.prepare('SELECT COUNT(*) AS n FROM perps_platform_fee_assessments').get().n,0);}finally{feeDb.close();}
    const recovered=await createBotManualPerpsService(openingDeps).recover({...who,id:review.id});assert.equal(recovered.state,'UNCERTAIN');assert.equal(openingSends,1);
    const complete=opening.completeFixtureKeeperSignature(openingSigned),record=executionJournal.read(review.id);
    let finality='processed';const receiptCalls=[],openingError=mode.startsWith('opening-failed')?{InstructionError:[2,'InvalidArgument']}:null,openingBlockTime=runtimeNow/1000;
    const receiptRequest=async(method,params)=>{
     receiptCalls.push(method);
     if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
     if(method==='getSignatureStatuses'){
      assert.equal(params[0][0],record.signature);return {context:{slot:181},value:[{slot:180,confirmationStatus:finality,err:openingError}]};
     }
     if(method==='getTransaction'){
      assert.equal(params[0],record.signature);assert.equal(params[1].commitment,'finalized');
      return {slot:180,blockTime:openingBlockTime,transaction:[complete,'base64'],meta:openingError?{err:openingError,fee:5400,innerInstructions:[]}:structuredClone(opening.fixtureTradeMeta)};
     }
     throw Error('WRITE_OR_UNEXPECTED_RECEIPT_RPC');
    };
    const recoverOpening=()=>reconcilePendingPerps(executionJournal,walletAddress,{readReceipt:row=>readPerpsBroadcastReceipt(row,receiptRequest,{now:common.now,requireFinalized:true})});
    assert.equal((await recoverOpening()).unresolved,1);assert.equal(executionJournal.read(review.id).state,'UNCERTAIN');
    finality='finalized';
    if(openingError){
     const failedProof=await readPerpsBroadcastReceipt({walletAddress,signature:record.signature,wireHash:record.wire_hash},receiptRequest,{now:common.now,requireFinalized:true});
     assert.throws(()=>bindRecoverablePerpsEntryCollateral({journal:executionJournal,reservationId:review.id,entryBinding:bound},{now:common.now}));
     assert.throws(()=>bindRecoverablePerpsEntryCollateral({journal:executionJournal,reservationId:review.id,entryBinding:bound,failedOpeningReceipt:{...failedProof}},{now:common.now}));
     const recovery=bindRecoverablePerpsEntryCollateral({journal:executionJournal,reservationId:review.id,entryBinding:bound,failedOpeningReceipt:failedProof},{now:common.now});
     assert.equal(recovery.amountUnits,bound.receivedCollateralUnits);assert.equal(recovery.source,bound.collateralAccount);
     assert.equal(recovery.maxSlippageBps,50);assert.equal(recovery.minimumSlot,180);assert.equal(recovery.readyForSigning,false);
     assert.equal(readRecoverablePerpsEntryCollateral(recovery),recovery);assert.throws(()=>readRecoverablePerpsEntryCollateral({...recovery}));
     const reverse=await conversionFixture({asset,walletAddress,amountUnits:recovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,strictWire:false,nowMs:runtimeNow});
     const preparedRecovery=await preparePerpsEntryCollateralRecovery(recovery,{request:reverse.request,now:common.now,monotonicNow:()=>0});
     assert.equal(preparedRecovery.amountUnits,bound.receivedCollateralUnits);assert.equal(preparedRecovery.maxSlippageBps,50);
     assert.equal(preparedRecovery.readyForSigning,false);assert.equal(preparedRecovery.serializedTxBase64,undefined);
     const recoveryWire=readPreparedPerpsEntryCollateralRecovery(preparedRecovery).wire;
     assert.equal(recoveryWire.source,bound.collateralAccount);assert.equal(recoveryWire.nativeSolInput,false);assert.equal(recoveryWire.closeWrappedAccount,false);
     assert.throws(()=>readPreparedPerpsEntryCollateralRecovery({...preparedRecovery}));
     await assert.rejects(preparePerpsEntryCollateralRecovery({...recovery},{request:reverse.request,now:common.now,monotonicNow:()=>0}));
     await assert.rejects(preparePerpsEntryCollateralRecovery(recovery,{request:async(method,params)=>{
      if(method==='getGenesisHash')return 'devnet';return reverse.request(method,params);
     },now:common.now,monotonicNow:()=>0}));
     const sourceAccount=reverse.after.get(recovery.source),sourceBytes=Buffer.from(sourceAccount.data[0],'base64');
     sourceBytes.writeBigUInt64LE(sourceBytes.readBigUInt64LE(64)+1n,64);sourceAccount.data[0]=sourceBytes.toString('base64');
     await assert.rejects(preparePerpsEntryCollateralRecovery(recovery,{request:reverse.request,now:common.now,monotonicNow:()=>0}));
     const intentOptions={journal,executionJournal,ownerAccountHash,controlRevision:state.revision,explicitApproval:true};
     assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(preparedRecovery,{...intentOptions,explicitApproval:false}));
     assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(preparedRecovery,{...intentOptions,ownerAccountHash:'a'.repeat(64)}));
     const recoveryIntent=recordPerpsEntryCollateralRecoveryIntent(preparedRecovery,intentOptions);
     assert.equal(readBoundPerpsEntryCollateral(bound),bound);
     assert.throws(()=>requireAvailablePerpsEntryCollateralForOpening(bound),/PERPS_ENTRY_COLLATERAL_RECOVERY_PENDING/);
     assert.equal(recoveryIntent.state,'SIGNING');assert.equal(recoveryIntent.readyForSigning,false);
     const persisted=journal.read(recoveryIntent.id);assert.equal(persisted.signature,null);assert.equal(persisted.signed,null);
     assert.equal(persisted.message,recoveryWire.messageBase64);
     assert.equal(JSON.parse(persisted.review).reservationId,review.id);
     assert.equal(journal.pending(walletAddress).length,1);
     assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(preparedRecovery,intentOptions));
     const reopenedSwaps=openBotSwapJournal(join(root,'swaps.sqlite'),common);
     try{assert.deepEqual(reopenedSwaps.read(recoveryIntent.id),persisted);
      assert.throws(()=>recordPerpsEntryCollateralRecoveryIntent(preparedRecovery,{...intentOptions,journal:reopenedSwaps}));
     }finally{reopenedSwaps.close();}
     let recoveryCurrent=true;
     const recoveryAuthority={intent:recoveryIntent,ownerAccountHash,controls,backupRegistry,explicitApproval:true,assertCurrent:()=>{if(!recoveryCurrent)throw Error('MOCK_RECOVERY_CONTEXT_CHANGED');}};
     assert.throws(()=>authorizeBotFailedEntryRecoveryCustody({...recoveryAuthority,explicitApproval:false}));
     assert.throws(()=>authorizeBotFailedEntryRecoveryCustody({...recoveryAuthority,intent:{...recoveryIntent}}));
     const authorizedRecovery=authorizeBotFailedEntryRecoveryCustody(recoveryAuthority);
     assert.throws(()=>authorizeBotFailedEntryRecoveryCustody(recoveryAuthority));
     const signedRecovery=vault.signBotSwap(authorizedRecovery.grant);
     assert.equal(Buffer.from(signedRecovery,'base64').subarray(65).toString('base64'),recoveryWire.messageBase64);
     assert.throws(()=>vault.signBotSwap(authorizedRecovery.grant));
     journal.signed(authorizedRecovery.claim,signedRecovery);
     assert.equal(journal.read(recoveryIntent.id).state,'SIGNING');
     sourceBytes.writeBigUInt64LE(sourceBytes.readBigUInt64LE(64)-1n,64);sourceAccount.data[0]=sourceBytes.toString('base64');
     let recoverySends=0,signedSimulations=0;
     const submitOptions={now:common.now,monotonicNow:()=>0,request:async(method,params)=>{
      if(method==='simulateTransaction'){
       assert.equal(params[0],signedRecovery);assert.equal(params[1].sigVerify,true);signedSimulations++;
       return reverse.request(method,[recoveryWire.serializedTxBase64,{...params[1],sigVerify:false}]);
      }
      return reverse.request(method,params);
     },sendRequest:async(method,params)=>{
      assert.equal(method,'sendTransaction');assert.equal(params[0],signedRecovery);assert.equal(params[1].maxRetries,0);
      assert.equal(journal.read(recoveryIntent.id).state,'UNKNOWN');recoverySends++;
      if(asset==='BTC')throw Error('MOCK_RECOVERY_TIMEOUT');return journal.read(recoveryIntent.id).signature;
     }};
     recoveryCurrent=false;await assert.rejects(submitPerpsEntryCollateralRecovery(recoveryIntent,submitOptions));assert.equal(recoverySends,0);
     recoveryCurrent=true;const submittedRecovery=await submitPerpsEntryCollateralRecovery(recoveryIntent,submitOptions);
     assert.equal(submittedRecovery.state,'UNKNOWN');assert.equal(submittedRecovery.acknowledged,asset!=='BTC');
     assert.equal(signedSimulations,1);assert.equal(recoverySends,1);
     await assert.rejects(submitPerpsEntryCollateralRecovery(recoveryIntent,submitOptions));assert.equal(recoverySends,1);
     const recoveryRestart=openBotSwapJournal(join(root,'swaps.sqlite'),common);
     try{assert.equal(recoveryRestart.read(recoveryIntent.id).state,'UNKNOWN');assert.equal(recoveryRestart.read(recoveryIntent.id).signed,signedRecovery);}finally{recoveryRestart.close();}
     const returned=await conversionReceiptFixture({asset,fixtureSignedCloseWire:signedRecovery,fixtureWalletAddress:walletAddress,
      closeMinimumUnits:preparedRecovery.minimumUsdcUnits,amountUnits:recovery.amountUnits,nativeSolInput:false,closeWrappedAccount:false,nowMs:runtimeNow,finalizedSlot:200});
     const receiptRpc=async(method,params)=>{
      if(method==='getMultipleAccounts')return {context:{slot:210},value:params[0].map(key=>returned.before.get(key)??finalized.before.get(key))};
      if(method==='getTransaction')return params[0]===first.signature?finalized.request(method,params):params[0]===record.signature?receiptRequest(method,params):returned.request(method,params);
      if(method==='getSignatureStatuses')return params[0][0]===first.signature?finalized.request(method,params):params[0][0]===record.signature?receiptRequest(method,params):returned.request(method,params);
      return returned.request(method,params);
     };
     const receiptInput={journal,executionJournal,id:recoveryIntent.id,ownerAccountHash},receiptOptions={request:receiptRpc,now:common.now,monotonicNow:()=>0};
     await assert.rejects(readRecordedPerpsEntryRecoveryReceipt({...receiptInput,ownerAccountHash:'a'.repeat(64)},receiptOptions));
     returned.status.confirmationStatus='processed';assert.equal(await readRecordedPerpsEntryRecoveryReceipt(receiptInput,receiptOptions),null);
     returned.status.confirmationStatus='finalized';
     const receiptJournal=openBotSwapJournal(join(root,'swaps.sqlite'),common);let finalRecovery;
     try{finalRecovery=await readRecordedPerpsEntryRecoveryReceipt({...receiptInput,journal:receiptJournal},receiptOptions);}finally{receiptJournal.close();}
     assert.equal(finalRecovery.receivedUsdcUnits,String(returned.received));
     assert.equal(journal.read(recoveryIntent.id).state,'UNKNOWN');
     assert.equal(executionJournal.read(review.id).state,'UNCERTAIN');assert.equal(recoverySends,1);
     returned.status.confirmationStatus='processed';
     assert.equal((await reconcileRecordedPerpsEntryRecovery(receiptInput,receiptOptions)).state,'UNKNOWN');
     assert.equal(journal.read(recoveryIntent.id).state,'UNKNOWN');
     returned.status.confirmationStatus='finalized';
     const actualReturnedWire=returned.transaction.transaction[0];
     const tamperedReturn=Buffer.from(actualReturnedWire,'base64');tamperedReturn[1]^=1;returned.transaction.transaction[0]=tamperedReturn.toString('base64');
     await assert.rejects(reconcileRecordedPerpsEntryRecovery(receiptInput,receiptOptions));
     assert.equal(journal.read(recoveryIntent.id).state,'UNKNOWN');
     returned.transaction.transaction[0]=actualReturnedWire;
     const completedReturn=await reconcileRecordedPerpsEntryRecovery(receiptInput,receiptOptions);
     assert.equal(completedReturn.state,'FINALIZED');assert.equal(completedReturn.originalRiskReleased,false);
     assert.equal(completedReturn.receivedUsdcUnits,String(returned.received));
     assert.equal(journal.pending(walletAddress).length,0);
     assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');
     assert.deepEqual(await reconcileRecordedPerpsEntryRecovery(receiptInput,receiptOptions),completedReturn);
     const recoveryTransaction=await readServerPerpsTradeTransaction({walletAddress,signature:completedReturn.signature,day:new Date(runtimeNow).toISOString().slice(0,10)},
      {request:receiptRpc,now:common.now,requireTradeEvent:false});
     const recoveryHistory=await readJournalledPerpsEntryRecovery(recoveryTransaction,{journal:executionJournal,swapJournal:journal,request:receiptRpc,now:common.now,monotonicNow:()=>0});
     assert.equal(recoveryHistory.receivedUsdcUnits,String(returned.received));assert.equal(recoveryHistory.reservationId,review.id);
     assert.equal(recoveryHistory.convertedCollateralUnits,bound.receivedCollateralUnits);assert.equal(recoveryTransaction.events.length,0);
     assert.equal(requireVerifiedPerpsEntryRecoveryHistory(recoveryHistory),recoveryHistory);
     assert.throws(()=>requireVerifiedPerpsEntryRecoveryHistory({...recoveryHistory}));
     const valuationDay=recoveryHistory.day;let valuationAge=0;
     const valueRecovery=createPerpsEntryRecoveryUsdValuationReader({now:()=>runtimeNow+120000,monotonicNow:()=>valuationAge,fetchImpl:async url=>{
      const query=new URL(url),pair=query.searchParams.get('pair'),isUsdc=pair==='USDCUSD';
      assert.ok(isUsdc||['XBTUSD','ETHUSD','SOLUSD'].includes(pair));
      const minute=Math.floor(recoveryHistory.blockTime/60)*60,mid=isUsdc?'1':'100',low=isUsdc?'0.99':'99',high=isUsdc?'1.01':'101';
      return Response.json({error:[],result:{[isUsdc?'USDC/USD':asset+'/USD']:[[minute,mid,high,low,mid,mid,'1',1],[minute+60,mid,high,low,mid,mid,'1',1]],last:minute+60}});
     }});
     const valued=await valueRecovery({recoveries:[recoveryHistory],day:valuationDay});
     assert.equal(valued.networkFeesIncluded,false);assert.equal(valued.usesUnderlyingMarketProxy,true);
     const scale=100000000n,divisor=10n**BigInt(recoveryHistory.collateralDecimals)*scale;
     const expectedSpent=(BigInt(recoveryHistory.convertedCollateralUnits)*10100000000n*1000000n+divisor-1n)/divisor;
     const expectedReceived=BigInt(recoveryHistory.receivedUsdcUnits)*99000000n/scale;
     const expectedFee=(BigInt(recoveryHistory.swapFeeUsdcUnits)*101000000n+scale-1n)/scale;
     assert.equal(valued.items[0].spentUsdUpperUnits,String(expectedSpent));assert.equal(valued.items[0].receivedUsdLowerUnits,String(expectedReceived));
     assert.equal(valued.items[0].feeUsdUpperUnits,String(expectedFee));
     assert.equal(valued.recoveryLossUsdUnits,String(expectedSpent-expectedReceived>expectedFee?expectedSpent-expectedReceived:expectedFee));
     assert.ok(BigInt(valued.recoveryLossUsdUnits)>=BigInt(valued.items[0].feeUsdUpperUnits));
     assert.equal(requirePerpsEntryRecoveryUsdValuation(valued,{recoveries:[recoveryHistory],day:valuationDay}),valued);
     assert.throws(()=>requirePerpsEntryRecoveryUsdValuation({...valued},{recoveries:[recoveryHistory],day:valuationDay}));
     await assert.rejects(valueRecovery({recoveries:[recoveryHistory,recoveryHistory],day:valuationDay}));
     daily.setNow(runtimeNow+120000);
     const accountingRequest=async(method,params)=>{
      if(method==='getSignaturesForAddress')return params[0]===walletAddress?[
       {signature:returned.identity.signature,slot:200,blockTime:returned.transaction.blockTime,err:null,confirmationStatus:'finalized'},
       {signature:record.signature,slot:180,blockTime:runtimeNow/1000,err:openingError,confirmationStatus:'finalized'},
       {signature:first.signature,slot:120,blockTime:finalized.transaction.blockTime,err:null,confirmationStatus:'finalized'}]:[];
      if(['getTransaction','getSignatureStatuses'].includes(method))return receiptRpc(method,params);
      return daily.options.request(method,params);
     };
     const accountingOptions={...daily.options,request:accountingRequest,readNetworkFees:undefined,readEntryRecoveryLoss:valueRecovery};
     const fullAccount=await readServerPerpsDailyAccount(who,accountingOptions);
     assert.equal(fullAccount.tradesToday,0);assert.equal(fullAccount.failedTransactions,1);
     assert.equal(fullAccount.entryConversions.length,1);assert.equal(fullAccount.entryRecoveries.length,1);
     assert.equal(fullAccount.entryRecoveryLossUsdUnits,valued.recoveryLossUsdUnits);
     assert.equal(fullAccount.walletNetworkFeesLamports,'16200');
     assert.equal(fullAccount.lossTodayUsdcUnits,String(BigInt(fullAccount.entryConversionLossUsdUnits)+BigInt(valued.recoveryLossUsdUnits)));
     await assert.rejects(readServerPerpsDailyAccount(who,{...accountingOptions,readEntryRecoveryLoss:undefined}));
     const completionInput={journal:executionJournal,swapJournal:journal,reservationId:review.id,signature:completedReturn.signature};
     assert.throws(()=>proveAccountedPerpsEntryRecovery({...completionInput,account:fullAccount}));
     const networkReader=createPerpsNetworkFeeValuationReader({now:()=>runtimeNow+120000,monotonicNow:()=>0,fetchImpl:async url=>{
      assert.equal(new URL(url).hostname,'api.exchange.coinbase.com');
      return Response.json([...new Set([finalized.transaction.blockTime,returned.transaction.blockTime].map(time=>Math.floor(time/60)*60))].map(minute=>[minute,99,100,99.5,99.5,1]));
     }});
     const valuedAccount=await readServerPerpsDailyAccount(who,{...accountingOptions,readNetworkFees:networkReader});
     assert.equal(valuedAccount.networkFeeUsdUnits,'1620');assert.equal(valuedAccount.networkFeesIncludedInUsdLoss,true);
     assert.equal(valuedAccount.lossTodayUsdcUnits,String(BigInt(fullAccount.lossTodayUsdcUnits)+1620n));
     assert.throws(()=>proveAccountedPerpsEntryRecovery({...completionInput,account:{...valuedAccount}}));
     const completedAccounting=proveAccountedPerpsEntryRecovery({...completionInput,account:valuedAccount});
     assert.equal(completedAccounting.originalRiskReleased,false);assert.equal(completedAccounting.recoverySlot,200);
     assert.equal(requireAccountedPerpsEntryRecovery(completedAccounting),completedAccounting);
     assert.throws(()=>requireAccountedPerpsEntryRecovery({...completedAccounting}));
     valuationAge=10001;assert.throws(()=>requirePerpsEntryRecoveryUsdValuation(valued,{recoveries:[recoveryHistory],day:valuationDay}));
     assert.throws(()=>requireAccountedPerpsEntryRecovery(completedAccounting));
     assert.equal(recoverySends,1);
     for(let attempt=0;attempt<2;attempt++){
      const result=await recoverOpening();assert.equal(result.unresolved,1);assert.equal(result.failed,0);
      assert.equal(executionJournal.read(review.id).state,'UNCERTAIN');
      assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');
      assert.equal(executionJournal.entryConversionHold(review.id).state,'FINALIZED');
     }
     assert.equal(actualFeeJournal.read(review.id),null);
     const failedReceipt=await readServerPerpsTradeTransaction({walletAddress,signature:record.signature,day:new Date(runtimeNow).toISOString().slice(0,10)},
      {request:receiptRequest,now:common.now,requireTradeEvent:false});
     assert.throws(()=>actualFeeJournal.assessFinalizedOpen(review.id,failedReceipt));
     if(mode==='opening-failed-prior'){
      runtimeNow+=86400000;
      const openingTransaction=await receiptRequest('getTransaction',[record.signature,{commitment:'finalized'}]);
      const oldOpening={transaction:openingTransaction,identity:{signature:record.signature},status:{err:openingError},request:receiptRequest};
      const oldAccounting=unsignedRecoveryAccountFixture(finalized,returned,{journal:executionJournal,swapJournal:journal,now:runtimeNow,priorReturns:[oldOpening]});
      const account=await readServerPerpsDailyAccount(who,oldAccounting);
      assert.equal(account.transactions.length,0);assert.equal(account.entryConversions.length,0);assert.equal(account.entryRecoveries.length,0);
      assert.equal(account.lossTodayUsdcUnits,'0');assert.equal(account.walletNetworkFeesLamports,'0');
      assert.throws(()=>proveAccountedPerpsEntryRecovery({...completionInput,account}));
      const input={...completionInput,ownerAccountHash,account},options={request:oldAccounting.request,fetchImpl:oldAccounting.fetchImpl,now:oldAccounting.now,monotonicNow:()=>0};
      const costs=await readHistoricalPerpsEntryRecoveryCosts(input,options);
      assert.equal(costs.failedOpeningSlot,180);assert.equal(costs.recoverySlot,200);assert.equal(costs.historicalNetworkFeeUsdUnits,'1620');
      assert.equal(costs.failedOpeningDay,costs.initialDay);assert.equal(costs.recoveryDay,costs.initialDay);assert.notEqual(costs.accountingDay,costs.initialDay);
      assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'10020000');
      const service=createBotManualPerpsService({...openingDeps,rpcRequest:oldAccounting.request,fetchImpl:oldAccounting.fetchImpl,
       readFinalizedAccount:()=>readServerPerpsDailyAccount(who,oldAccounting)}),client=await boundaryClient(service);
      const completed=await client.recoverRecovery(walletAddress,review.id);assert.equal(completed.state,'CLOSED');assert.equal(completed.originalRiskReleased,true);
      assert.deepEqual(await client.recoverRecovery(walletAddress,review.id),completed);
      assert.equal(executionJournal.read(review.id).confirmed_slot,180);assert.equal(executionJournal.read(review.id).closed_slot,200);
      assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'0');assert.equal(actualFeeJournal.read(review.id),null);
      assert.equal(openingSends,1);assert.equal(recoverySends,1);assert.equal(sends,1);await verifyCompletedArchive(review.id);return;
     }
     valuationAge=0;
     const releaseAccount=await readServerPerpsDailyAccount(who,{...accountingOptions,readNetworkFees:networkReader});
     const releaseProof=proveAccountedPerpsEntryRecovery({...completionInput,account:releaseAccount});
     assert.throws(()=>executionJournal.completeEntryRecovery({...releaseProof}));
     const released=executionJournal.completeEntryRecovery(releaseProof);
     assert.equal(released.state,'CLOSED');assert.equal(released.closed_slot,200);assert.equal(released.confirmed_slot,180);
     assert.equal(executionJournal.riskState(walletAddress).pendingMarginUsdcUnits,'0');
     assert.equal(executionJournal.entryConversionHold(review.id).state,'FINALIZED');
     assert.throws(()=>executionJournal.completeEntryRecovery(releaseProof));
     const afterReleaseAccount=await readServerPerpsDailyAccount(who,{...accountingOptions,readNetworkFees:networkReader});
     assert.equal(afterReleaseAccount.lossTodayUsdcUnits,releaseAccount.lossTodayUsdcUnits);
     assert.equal(afterReleaseAccount.entryRecoveries.length,1);assert.equal(afterReleaseAccount.failedTransactions,1);
     assert.equal(actualFeeJournal.read(review.id),null);assert.equal(recoverySends,1);
     runtimeNow+=10001;assert.throws(()=>readRecoverablePerpsEntryCollateral(recovery));
     assert.throws(()=>readPreparedPerpsEntryCollateralRecovery(preparedRecovery));
     assert.equal(openingSends,1);assert.equal(sends,1);await verifyCompletedArchive(review.id);return;
    }
    assert.equal((await recoverOpening()).confirmed,1);
    assert.equal(executionJournal.read(review.id).state,'OPEN');assert.equal(executionJournal.read(review.id).confirmed_slot,180);
    assert.equal(executionJournal.pending(walletAddress).length,0);
    // Original margin plus its still-uncollected 0.2% commercial fee reserve.
    assert.equal(executionJournal.riskState(walletAddress).activeMarginUsdcUnits,'10020000');
    const callsAfter=receiptCalls.length;assert.equal((await recoverOpening()).checked,0);assert.equal(receiptCalls.length,callsAfter);
    assert.equal(openingSends,1);assert.equal(sends,1);
    const tradeReceipt=await readServerPerpsTradeTransaction({walletAddress,signature:record.signature,day:new Date(runtimeNow).toISOString().slice(0,10)},
     {request:receiptRequest,now:common.now});
    assert.equal(tradeReceipt.unknownPerpsEvents,0);assert.equal(tradeReceipt.events.length,1);
    assert.equal(tradeReceipt.events[0].asset,asset);assert.equal(tradeReceipt.events[0].action,'Increase');
    assert.throws(()=>actualFeeJournal.assessFinalizedOpen(review.id,{...tradeReceipt}));
    const assessment=actualFeeJournal.assessFinalizedOpen(review.id,tradeReceipt);
    assert.equal(assessment.fee,'20000');assert.equal(assessment.state,'AWAITING_PAYMENT_REVIEW');
    assert.deepEqual(actualFeeJournal.assessFinalizedOpen(review.id,tradeReceipt),assessment);
    const checkedFees=new DatabaseSync(join(root,'fees.sqlite'),{readOnly:true});
    try{assert.equal(checkedFees.prepare('SELECT COUNT(*) AS n FROM perps_platform_fee_assessments').get().n,1);}finally{checkedFees.close();}
    const visible=await openingClient.status(walletAddress);
    assert.equal(visible.operations.some(row=>row.id===review.id),false);
    const visibleEntry=await openingClient.recover(walletAddress,review.id);
    assert.equal(visibleEntry.state,'OPEN');assert.equal(visibleEntry.signature,record.signature);
    assert.equal(visibleEntry.fundingStage,'FINALIZED');assert.equal(visibleEntry.requiresOpeningReview,false);
    assert.equal(openingSends,1);assert.equal(sends,1);
   }
  }finally{actualFeeJournal?.close();policyStore.close();}return;
 }
 const adapter={read:async()=>journal.pending(walletAddress).find(row=>row.state==='UNKNOWN')??null,
  begin:async row=>journal.beginBroadcast(claim,row),resolve:async()=>assert.fail('No recovery mutation')};
 const engine=createPerpsEntryConversionEngine({...f.options,journal:adapter,isCurrent:()=>true,
  sendRequest:async(method,params)=>{assert.equal(method,'sendTransaction');assert.equal(journal.read(claim.id).state,'UNKNOWN');sends++;return bs58.encode(Buffer.from(params[0],'base64').subarray(1,65));}});
 const prepared=await engine.prepare({asset,side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},walletAddress);
 const reservationId='entry-'+asset,id='a'.repeat(64),wire=readPreparedPerpsEntryConversion(prepared).wire;
 executionJournal.reserve({walletAddress,signalId:'manual:'+reservationId,reservationId,marginUsd:'10',limits,snapshot:await readAccount(),positionAddress:(await deriveServerPerpsIdentities({walletAddress,asset,side:'LONG'})).position,platformFeeUnits:'20000'});
 executionJournal.holdEntryConversion({reservationId,conversionId:id,wire,draft:prepared.draft});
 const review={...prepared,id,controlRevision:state.revision,reservationId};
 const input={prepared,review,journal,executionJournal,reservationId,ownerAccountHash,controls,backupRegistry,readAccount,readLimits:()=>policy,assertCurrent:()=>{}};
 await assert.rejects(authorizeBotEntryConversionCustody({...input,prepared:{...prepared}}));
 await assert.rejects(authorizeBotEntryConversionCustody({...input,review:{...review,maxSlippageBps:500}}));
 await assert.rejects(authorizeBotEntryConversionCustody({...input,ownerAccountHash:'e'.repeat(64)}));
 await assert.rejects(authorizeBotEntryConversionCustody({...input,executionJournal:{...executionJournal}}));
 if(mode==='account'){
  await assert.rejects(authorizeBotEntryConversionCustody({...input,readAccount:async()=>({...await readAccount()}),engineGrant:engine.authorize(prepared,true)}));
  assert.equal(journal.pending(walletAddress).length,0);assert.equal(sends,0);return;
 }
 const result=await authorizeBotEntryConversionCustody({...input,engineGrant:engine.authorize(prepared,true)});claim=result.claim;
 assert.throws(()=>consumeBotSwapCustody({...result.grant}));
 if(mode==='recovery'){
  const recovery={executionJournal,journal,reservationId,ownerAccountHash};
  assert.throws(()=>recoverNeverBroadcastHeldPerpsEntryConversion({...recovery,ownerAccountHash:'e'.repeat(64)}));
  assert.equal(journal.read(id).state,'SIGNING');
  assert.equal(recoverNeverBroadcastHeldPerpsEntryConversion(recovery).state,'CANCELLED');
  assert.equal(recoverNeverBroadcastHeldPerpsEntryConversion(recovery).state,'CANCELLED');
  assert.equal(journal.read(id).state,'ABORTED');assert.equal(journal.read(id).signed,null);
  assert.throws(()=>vault.signBotSwap(result.grant));assert.equal(sends,0);
  assert.equal(executionJournal.pending(walletAddress).length,0);return;
 }
 if(mode!=='success'){
  if(mode==='limits')policy={walletAddress,limits:{...limits,capitalUsd:'19'}};
  if(mode==='backup'){const db=new DatabaseSync(backupPath);try{db.exec("UPDATE perps_backup_challenges SET status='REVOKED'");}finally{db.close();}}
  if(mode==='hold'){const db=new DatabaseSync(join(root,'risk.sqlite'));try{db.exec("UPDATE perps_entry_conversion_holds SET conversion_id='"+'d'.repeat(64)+"'");}finally{db.close();}}
  if(mode==='controls'){const db=new DatabaseSync(join(root,'controls.sqlite'));try{db.prepare('UPDATE perps_automation_controls SET revision=?').run(randomUUID());}finally{db.close();}}
  assert.throws(()=>vault.signBotSwap(result.grant));assert.throws(()=>vault.signBotSwap(result.grant));
  assert.equal(sends,0);assert.equal(journal.read(id).signed,null);assert.equal(executionJournal.read(reservationId).state,'RESERVED');return;
 }
 const signed=vault.signBotSwap(result.grant);assert.throws(()=>vault.signBotSwap(result.grant));journal.signed(claim,signed);
 await engine.submit(prepared,signed);assert.equal(sends,1);await assert.rejects(engine.submit(prepared,signed));
 assert.equal(executionJournal.read(reservationId).state,'RESERVED');assert.equal(executionJournal.entryConversionHold(reservationId).state,'HELD');
});
