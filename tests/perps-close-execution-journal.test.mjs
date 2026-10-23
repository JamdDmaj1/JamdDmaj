import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,mkdirSync,chmodSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {createPrivateKey,createCipheriv} from 'node:crypto';
import bs58 from 'bs58';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {verifyOwnerSignedPerpsCloseIntent,validateStoredPerpsCloseExecution} from '../lib/perps-close-execution-record.js';
import {readFinalizedPerpsClosePayout} from '../lib/perps-close-payout-receipt.js';
import {closePayoutFixture} from './helpers/perps-close-payout-fixture.mjs';
import {conversionFixture} from './helpers/perps-conversion-fixture.mjs';
import {readJournaledPerpsCloseConversion} from '../lib/perps-journal-close-conversion.js';
import {verifyOwnerSignedPerpsCloseConversionIntent,validateStoredPerpsCloseConversion} from '../lib/perps-close-conversion-record.js';
import {readFinalizedPerpsCloseConversionReceipt} from '../lib/perps-close-conversion-receipt.js';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {readServerPerpsTradeTransaction} from '../lib/perps-server-trade-transaction.js';
import {readJournalledPerpsConversion,requireVerifiedPerpsConversionHistory} from '../lib/perps-conversion-history.js';
import {createPerpsConversionUsdValuationReader,requirePerpsConversionUsdValuation} from '../lib/perps-conversion-usd-valuation.js';
import {createServerPerpsDailyAccountReader,requireFreshServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {createPerpsNetworkFeeValuationReader} from '../lib/perps-network-fee-valuation.js';
import {readFinalizedPerpsCloseCompletion,requireVerifiedPerpsCloseCompletion,reconcileRecordedPerpsCloses} from '../lib/perps-close-completion.js';
import {createServerPerpsExecutor} from '../lib/perps-server-executor.js';
import {createServerPerpsWorker} from '../lib/perps-server-worker.js';
import {openPerpsBackupRegistry} from '../lib/perps-backup-registry.js';
import {authorizePerpsCloseConversion} from '../lib/perps-close-conversion-signing.js';
import {createPerpsCloseConversionBroadcaster} from '../lib/perps-close-conversion-broadcast.js';
import {createPerpsCloseConversionExecutor} from '../lib/perps-close-conversion-executor.js';
import {PERPS_POOL} from '../lib/perps-server-custody.js';
import {createNativePerpsCloseExecutor} from '../lib/perps-close-executor.js';
import {createServerPerpsCloseCoordinator} from '../lib/perps-server-close-coordinator.js';
async function fixture(t,options={}){
 const f=await closePayoutFixture(options),root=mkdtempSync(join(tmpdir(),'jamd-close-exec-')),path=join(root,'journal.sqlite'),opened=[];let time=f.options.now();
 const open=()=>{const j=openPerpsExecutionJournal(path,{now:()=>time});opened.push(j);return j;},journal=open();
 t.after(()=>{for(const j of opened)try{j.close();}catch{}rmSync(root,{recursive:true,force:true});});
 const exits=options.withExits?['SL','TP'].map((kind,i)=>({address:bs58.encode(Buffer.alloc(32,40+i)),kind,sizeUsdUnits:'30000000',triggerPriceUsdUnits:i?'110000000':'90000000',counter:String(i+1)})):[];
 const parent={reservation:'parent',signature:bs58.encode(Buffer.alloc(64,17)),wire_hash:'a'.repeat(64),confirmed_slot:50,entry_exit_plan:JSON.stringify({sizeUsdUnits:'30000000',exits})};
 f.row.entries=JSON.stringify([parent]);const raw=new DatabaseSync(path);
 raw.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated,signature,wire_hash,confirmed_slot,position_address,entry_exit_plan) VALUES(?,?,?,?,?,'OPEN',?,?,?,?,?,?,?)")
  .run(f.row.wallet,'signal-parent','parent',new Date(time).toISOString().slice(0,10),10000000,time-10000,time-10000,parent.signature,parent.wire_hash,parent.confirmed_slot,f.row.position,parent.entry_exit_plan);
 raw.prepare('INSERT INTO perps_position_closes(id,wallet,position,state,created,updated,observed_slot,fee_lamports,unsigned_wire_hash,entries,settlement) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(f.row.id,f.row.wallet,f.row.position,'PREPARED',f.row.created,f.row.created,f.row.observed_slot,f.row.fee_lamports,f.row.unsigned_wire_hash,f.row.entries,f.row.settlement);
 for(const exit of exits)raw.prepare('INSERT INTO perps_exit_request_bindings(address,reservation) VALUES(?,?)').run(exit.address,'parent');raw.close();
 const ownerSigned=Buffer.from(f.tx.transaction[0],'base64');ownerSigned.fill(0,65,129);
 const intent=()=>verifyOwnerSignedPerpsCloseIntent(journal.readPositionClose(f.row.id),ownerSigned.toString('base64'));
 const uncertain=()=>{journal.beginPositionCloseSigning(f.row.id);return journal.recordPositionCloseBroadcast(f.row.id,intent());};
 return {...f,journal,path,open,ownerSigned,intent,uncertain,trackClose(value){opened.push(value);return value;},advance(ms){time+=ms;}};
}
test('durable close claim and exact owner-signed intent survive restart without releasing parent risk or permitting unsigned cancellation',async t=>{
 const f=await fixture(t),risk=f.journal.riskState(f.row.wallet),a=f.journal.beginPositionCloseSigning(f.row.id);
 assert.equal(a.state,'SIGNING');assert.equal(a.signature,null);assert.equal(f.open().readPositionCloseExecution(f.row.id).state,'SIGNING');
 assert.throws(()=>f.open().beginPositionCloseSigning(f.row.id));assert.throws(()=>f.journal.cancelPreparedPositionClose(f.row.id));
 const intent=f.intent();assert.equal(intent.readyForBroadcast,false);assert.equal(intent.requiresCustodyAuthorization,true);
 assert.throws(()=>f.journal.recordPositionCloseBroadcast(f.row.id,{...intent}));
 const b=f.journal.recordPositionCloseBroadcast(f.row.id,intent);assert.equal(b.state,'UNCERTAIN');assert.equal(b.signature,f.identity.signature);assert.equal(b.wire_hash,f.identity.wireHash);
 assert.equal(b.owner_signed_wire,f.ownerSigned.toString('base64'));assert.deepEqual(f.open().readPositionCloseExecution(f.row.id),b);
 assert.equal(f.journal.pendingPositionCloseExecutions(f.row.wallet).length,1);assert.throws(()=>f.journal.recordPositionCloseBroadcast(f.row.id,intent));
 assert.deepEqual(f.journal.riskState(f.row.wallet),risk);assert.equal(f.journal.read('parent').state,'OPEN');
 assert.equal(f.journal.readPositionClose(f.row.id).state,'PREPARED');
});
test('only the recorded finalized first-leg payout advances execution and repeated polling is idempotent without freeing capital',async t=>{
 for(const options of [{asset:'SOL'},{asset:'ETH'},{asset:'BTC'},{side:'SHORT'}]){
  const f=await fixture(t,options),risk=f.journal.riskState(f.row.wallet);f.uncertain();
  const payout=await readFinalizedPerpsClosePayout(f.journal.readPositionClose(f.row.id),f.identity,f.options);
  assert.throws(()=>f.journal.reconcilePositionClosePayout(f.row.id,{...payout}));
  const row=f.journal.reconcilePositionClosePayout(f.row.id,payout);assert.equal(row.state,'FIRST_LEG_FINALIZED');assert.equal(row.confirmed_slot,300);
  const stored=JSON.parse(row.payout_json);assert.equal(stored.receivedTokenUnits,'7000000');assert.equal(stored.executionDay,new Date(f.tx.blockTime*1000).toISOString().slice(0,10));
  assert.deepEqual(f.journal.reconcilePositionClosePayout(f.row.id,payout),row);assert.deepEqual(f.open().readPositionCloseExecution(f.row.id),row);
  assert.equal(validateStoredPerpsCloseExecution(row,f.journal.readPositionClose(f.row.id)),row);
  assert.deepEqual(f.journal.riskState(f.row.wallet),risk);assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.pendingPositionCloses(f.row.wallet).length,1);
  assert.throws(()=>f.journal.cancelPreparedPositionClose(f.row.id));
 }
});
test('stale receipts, changed parent rows or parent entries and changed signed bytes cannot advance execution',async t=>{
 for(const mode of ['expired','wallClock','parent','entry','signedWire','keeperPresent']){
  const f=await fixture(t);
  if(['signedWire','keeperPresent'].includes(mode)){
   const b=mode==='keeperPresent'?Buffer.from(f.tx.transaction[0],'base64'):Buffer.from(f.ownerSigned);if(mode==='signedWire')b[b.length-1]^=1;
   assert.throws(()=>verifyOwnerSignedPerpsCloseIntent(f.row,b.toString('base64')));continue;
  }
  f.uncertain();const p=await readFinalizedPerpsClosePayout(f.journal.readPositionClose(f.row.id),f.identity,f.options);
  if(mode==='expired')f.expire();if(mode==='wallClock')f.advance(10001);
  if(mode==='parent'||mode==='entry'){
   const db=new DatabaseSync(f.path);if(mode==='parent')db.prepare('UPDATE perps_position_closes SET entries=? WHERE id=?').run('[]',f.row.id);
   else db.prepare("UPDATE perps_reservations SET entry_exit_plan='{}' WHERE reservation='parent'").run();db.close();
  }
  assert.throws(()=>f.journal.reconcilePositionClosePayout(f.row.id,p),mode);assert.equal(f.journal.readPositionCloseExecution(f.row.id).state,'UNCERTAIN');
 }
});
test('a contradictory finalized observation cannot overwrite the previously recorded financial payout',async t=>{
 const f=await fixture(t);f.uncertain();const original=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options),stored=f.journal.reconcilePositionClosePayout(f.row.id,original);
 f.fields.transferToken='7000001';f.refreshEvent();const transfer=Buffer.from(bs58.decode(f.inner[0].data));transfer.writeBigUInt64LE(7000001n,1);f.inner[0].data=bs58.encode(transfer);
 const i=f.keys.indexOf(f.vault);f.tx.meta.postBalances[i]--;f.tx.meta.postBalances[0]++;f.tx.meta.postTokenBalances.find(b=>b.accountIndex===i).uiTokenAmount.amount=String(100000000n-7000001n);
 const changed=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);assert.equal(changed.receivedTokenUnits,'7000001');
 assert.throws(()=>f.journal.reconcilePositionClosePayout(f.row.id,changed));assert.deepEqual(f.journal.readPositionCloseExecution(f.row.id),stored);
});
test('two actual processes sharing SQLite can claim the same prepared close only once',async t=>{
 const f=await fixture(t),module=new URL('../lib/perps-execution-journal.js',import.meta.url).href;
 const code=`import {openPerpsExecutionJournal} from ${JSON.stringify(module)};const j=openPerpsExecutionJournal(${JSON.stringify(f.path)},{now:()=>${f.options.now()}});try{j.beginPositionCloseSigning('close-1');process.stdout.write('WON');}catch{process.stdout.write('LOST');}finally{j.close();}`;
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('close',exit=>exit===0?resolve(output):reject(Error(error)));});
 const results=await Promise.all([run(),run()]);assert.deepEqual(results.sort(),['LOST','WON']);assert.equal(f.journal.readPositionCloseExecution(f.row.id).state,'SIGNING');
 assert.equal(f.journal.riskState(f.row.wallet).activeMarginUsdcUnits,'10000000');
});

test('a pending wallet entry prevents claiming the close without changing either reservation',async t=>{
 const f=await fixture(t),db=new DatabaseSync(f.path),time=f.options.now();
 db.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated) VALUES(?,?,?,?,?,'UNCERTAIN',?,?)")
  .run(f.row.wallet,'other-signal','other-entry',new Date(time).toISOString().slice(0,10),1000000,time,time);db.close();
 assert.throws(()=>f.journal.beginPositionCloseSigning(f.row.id));
 assert.equal(f.journal.readPositionCloseExecution(f.row.id),null);
 assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.read('other-entry').state,'UNCERTAIN');
 assert.equal(f.journal.readPositionClose(f.row.id).state,'PREPARED');
});

async function settledFixture(t,options={}){
 const f=await fixture(t,options);f.uncertain();
 const payout=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);f.journal.reconcilePositionClosePayout(f.row.id,payout);
 const swap=options.side==='SHORT'||options.amount===0n?null:await conversionFixture({asset:options.asset??'SOL',walletAddress:f.row.wallet,amountUnits:payout.receivedTokenUnits,nativeSolInput:payout.delivery==='NATIVE_SOL',nowMs:f.options.now()});
 const request=(m,p)=>['getTransaction','getSignatureStatuses','getGenesisHash'].includes(m)||m==='getMultipleAccounts'&&p[1].commitment==='finalized'?f.request(m,p):swap.request(m,p);
 return {...f,swap,payout,conversionOptions:{...f.options,maxSlippageBps:100,request}};
}

test('reopened real journal re-verifies its exact finalized close before preparing a protected conversion of actual proceeds',async t=>{
 for(const options of [{asset:'SOL'},{asset:'SOL',unwrapSol:false},{asset:'ETH'},{asset:'BTC'}]){
  const f=await settledFixture(t,options),journal=f.open(),before=journal.readPositionCloseSettlement(f.row.id);
  const result=await journal.preparePositionCloseConversion(f.row.id,f.conversionOptions),p=readJournaledPerpsCloseConversion(result,journal);
  assert.equal(result.stage,'JOURNALED_CLOSE_CONVERSION_PREPARED');assert.equal(result.amountUnits,f.payout.receivedTokenUnits);
  assert.equal(result.closeSignature,before.execution.signature);assert.equal(result.requiresSignedCloseJournalBinding,false);
  assert.equal(result.requiresConversionJournalBinding,true);assert.equal(result.readyForSigning,false);
  assert.equal(p.prepared.wire.walletAddress,f.row.wallet);assert.equal(p.prepared.wire.amountUnits,'7000000');
  assert.equal(p.prepared.simulation.receivedUsdcUnits,String(f.swap.received));
  assert.throws(()=>readJournaledPerpsCloseConversion({...result},journal));assert.throws(()=>readJournaledPerpsCloseConversion(result,f.journal));
  assert.deepEqual(journal.readPositionCloseSettlement(f.row.id),before);assert.equal(journal.read('parent').state,'OPEN');
  // The coordinator deliberately shares one monotonic lease clock across
  // first-leg revalidation and conversion simulation.
  f.expire();assert.throws(()=>readJournaledPerpsCloseConversion(result,journal));
 }
});

test('unconfirmed history, missing journal claim and invalid conversion policy cannot become a prepared second leg',async t=>{
 const unsigned=await fixture(t);let calls=0;
 await assert.rejects(unsigned.journal.preparePositionCloseConversion(unsigned.row.id,{request:()=>{calls++;throw Error();}}));assert.equal(calls,0);
 unsigned.uncertain();await assert.rejects(unsigned.journal.preparePositionCloseConversion(unsigned.row.id,{request:()=>{calls++;throw Error();}}));assert.equal(calls,0);
 for(const mode of ['confirmed','missing','policy']){
  const f=await settledFixture(t);if(mode==='confirmed')f.status.confirmationStatus='confirmed';
  const request=(m,p)=>mode==='missing'&&m==='getSignatureStatuses'?Promise.resolve({context:{slot:310},value:[null]}):f.conversionOptions.request(m,p);
  if(mode==='policy')await assert.rejects(f.journal.preparePositionCloseConversion(f.row.id,{...f.conversionOptions,maxSlippageBps:101,request}));
  else assert.equal((await f.journal.preparePositionCloseConversion(f.row.id,{...f.conversionOptions,request})).stage,'JOURNALED_CLOSE_PAYOUT_NOT_CURRENTLY_VERIFIABLE');
  assert.equal(f.swap.calls.length,0);assert.equal(f.journal.read('parent').state,'OPEN');
 }
});

test('changes to durable close facts or original entries during an asynchronous recovery read abort conversion before simulation',async t=>{
 for(const mode of ['entry','payout','parent','simulation-entry']){
  const f=await settledFixture(t);let changed=false;
  const request=async(m,p)=>{const result=await f.conversionOptions.request(m,p);if(!changed&&(mode!=='simulation-entry'||m==='simulateTransaction')){
   changed=true;const db=new DatabaseSync(f.path);
   if(mode==='entry'||mode==='simulation-entry')db.prepare("UPDATE perps_reservations SET entry_exit_plan='{}' WHERE reservation='parent'").run();
   if(mode==='payout')db.prepare("UPDATE perps_position_close_executions SET payout_json=replace(payout_json,'7000000','7000001')").run();
   if(mode==='parent')db.prepare("UPDATE perps_position_closes SET updated=updated+1").run();db.close();
  }return result;};
  await assert.rejects(f.journal.preparePositionCloseConversion(f.row.id,{...f.conversionOptions,request}),mode);
  if(mode==='simulation-entry')assert(f.swap.calls.some(c=>c.method==='simulateTransaction'));else assert.equal(f.swap.calls.length,0);
  assert.equal(f.journal.read('parent').state,'OPEN');
 }
});

test('a stored payout differing from newly finalized chain evidence is not silently replaced or converted',async t=>{
 const f=await settledFixture(t),db=new DatabaseSync(f.path);
 db.prepare("UPDATE perps_position_close_executions SET payout_json=replace(payout_json,'7000000','7000001')").run();db.close();
 await assert.rejects(f.journal.preparePositionCloseConversion(f.row.id,f.conversionOptions));
 assert.equal(f.swap.calls.length,0);assert.equal(f.journal.read('parent').state,'OPEN');
 assert.equal(JSON.parse(f.journal.readPositionCloseExecution(f.row.id).payout_json).receivedTokenUnits,'7000001');
});

test('journaled USDC collateral or zero return performs no second transaction and still retains accounting risk',async t=>{
 for(const options of [{side:'SHORT'},{amount:0n}]){
  const f=await settledFixture(t,options),result=await f.journal.preparePositionCloseConversion(f.row.id,f.conversionOptions);
  assert.equal(result.stage,'JOURNALED_CLOSE_REQUIRES_NO_CONVERSION');assert.equal(result.readyForSigning,false);
  assert.equal(result.receivedUsdcUnits,options.side==='SHORT'?'7000000':'0');
  assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.readPositionCloseExecution(f.row.id).state,'FIRST_LEG_FINALIZED');
 }
});

async function conversionAttemptFixture(t,options={}){
 const f=await settledFixture(t,options),prepared=await f.journal.preparePositionCloseConversion(f.row.id,f.conversionOptions),p=readJournaledPerpsCloseConversion(prepared,f.journal);
 // Public deterministic, unfunded test seed matching closePayoutFixture. It
 // signs only invalid-blockhash in-memory models; no network transport exists.
 const fixturePrivateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,51)]),format:'der',type:'pkcs8'});
 const receipt=await conversionReceiptFixture({asset:options.asset??'SOL',nativeSolInput:f.payout.delivery==='NATIVE_SOL',amountUnits:f.payout.receivedTokenUnits,fixturePrivateKey,finalizedSlot:400,nowMs:f.options.now()});
 assert.equal(receipt.wire.serializedTxBase64,p.prepared.wire.serializedTxBase64);
 const intent=()=>verifyOwnerSignedPerpsCloseConversionIntent(p.prepared.wire,receipt.transaction.transaction[0]);
 const uncertain=()=>{f.journal.preparePositionCloseConversionRecord(f.row.id,prepared);f.journal.beginPositionCloseConversionSigning(f.row.id,prepared);return f.journal.recordPositionCloseConversionBroadcast(f.row.id,intent());};
 return {...f,prepared,p,receipt,intent,uncertain};
}

test('durable conversion preparation and signing claim survive restart without authorizing funds or releasing original risk',async t=>{
 const f=await conversionAttemptFixture(t),risk=f.journal.riskState(f.row.wallet);
 assert.throws(()=>f.journal.preparePositionCloseConversionRecord(f.row.id,{...f.prepared}));
 const prepared=f.journal.preparePositionCloseConversionRecord(f.row.id,f.prepared);assert.equal(prepared.state,'PREPARED');
 assert.deepEqual(f.open().readPositionCloseConversion(f.row.id),prepared);assert.throws(()=>f.journal.preparePositionCloseConversionRecord(f.row.id,f.prepared));
 const signing=f.journal.beginPositionCloseConversionSigning(f.row.id,f.prepared);assert.equal(signing.state,'SIGNING');
 assert.deepEqual(f.open().readPositionCloseConversion(f.row.id),signing);assert.throws(()=>f.journal.beginPositionCloseConversionSigning(f.row.id,f.prepared));
 assert.throws(()=>f.journal.recordPositionCloseConversionBroadcast(f.row.id,{...f.intent()}));
 const recorded=f.journal.recordPositionCloseConversionBroadcast(f.row.id,f.intent());assert.equal(recorded.state,'UNCERTAIN');
 assert.equal(recorded.signature,f.receipt.identity.signature);assert.equal(recorded.wire_hash,f.receipt.identity.wireHash);
 assert.equal(recorded.owner_signed_wire,f.receipt.transaction.transaction[0]);assert.deepEqual(f.open().readPositionCloseConversion(f.row.id),recorded);
 assert.throws(()=>f.journal.recordPositionCloseConversionBroadcast(f.row.id,f.intent()));assert.throws(()=>f.journal.cancelPreparedPositionClose(f.row.id));
 assert.deepEqual(f.journal.riskState(f.row.wallet),risk);assert.equal(f.journal.read('parent').state,'OPEN');
});

test('only exact recorded finalized second-leg receipts persist actual USDC, fees and rent without completing risk accounting',async t=>{
 for(const options of [{asset:'SOL'},{asset:'SOL',unwrapSol:false},{asset:'ETH'},{asset:'BTC'}]){
  const f=await conversionAttemptFixture(t,options),risk=f.journal.riskState(f.row.wallet);f.uncertain();
  const payout=await readFinalizedPerpsCloseConversionReceipt(f.p.prepared.wire,f.receipt.identity,f.receipt.receiptOptions);
  assert.throws(()=>f.journal.reconcilePositionCloseConversion(f.row.id,{...payout}));
  const row=f.journal.reconcilePositionCloseConversion(f.row.id,payout);assert.equal(row.state,'FINALIZED');
  const stored=JSON.parse(row.receipt_json);assert.equal(stored.receivedUsdcUnits,String(f.receipt.received));assert.equal(stored.networkFeeLamports,'5400');
  assert.equal(stored.convertedTokenUnits,'7000000');assert.equal(stored.blockTime,f.receipt.transaction.blockTime);
  assert.equal(f.journal.pendingPositionCloseConversions(f.row.wallet).length,1);
  assert.deepEqual(f.journal.reconcilePositionCloseConversion(f.row.id,payout),row);assert.deepEqual(f.open().readPositionCloseConversion(f.row.id),row);
  assert.equal(validateStoredPerpsCloseConversion(row,f.row,f.journal.readPositionCloseExecution(f.row.id)),row);
  assert.deepEqual(f.journal.riskState(f.row.wallet),risk);assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.readPositionClose(f.row.id).state,'PREPARED');
 }
});

test('expired preparation, expired conversion receipts and changed stored minimum cannot advance financial state',async t=>{
 for(const mode of ['preparation','receipt','minimum']){
  const f=await conversionAttemptFixture(t);
  if(mode==='preparation'){f.expire();assert.throws(()=>f.journal.preparePositionCloseConversionRecord(f.row.id,f.prepared));assert.equal(f.journal.readPositionCloseConversion(f.row.id),null);continue;}
  f.uncertain();const payout=await readFinalizedPerpsCloseConversionReceipt(f.p.prepared.wire,f.receipt.identity,f.receipt.receiptOptions);
  if(mode==='receipt')f.receipt.expire();
  else {const db=new DatabaseSync(f.path),row=f.journal.readPositionCloseConversion(f.row.id),w=JSON.parse(row.wire_json);w.minimumUsdcUnits=String(BigInt(w.minimumUsdcUnits)+1n);db.prepare('UPDATE perps_close_conversions SET wire_json=?').run(JSON.stringify(w));db.close();}
  assert.throws(()=>f.journal.reconcilePositionCloseConversion(f.row.id,payout));assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'UNCERTAIN');
 }
});

async function recoveryOptions(t,f){
 const root=dirname(f.path),directory=join(root,'wallets'),keyDirectory=join(root,'keys'),keyFile=join(keyDirectory,'master.key'),operatorDirectory=join(root,'operator');
 chmodSync(root,0o700);for(const p of [directory,keyDirectory])mkdirSync(p,{mode:0o700});
 const common={allowNonPosixForTests:process.platform==='win32',now:f.options.now};createPerpsCustodyMasterKey(keyFile,common);
 const ownerAccountHash='e'.repeat(64),walletAddress=f.row.wallet,purpose='jamddmaj-perps-automation',seed=Buffer.alloc(32,51),key=readFileSync(keyFile),iv=Buffer.alloc(12,7);
 // Only this freshly created unfunded test vault uses the public test seed.
 // No production key/record is read, imported or exported by this corpus.
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(JSON.stringify({version:1,purpose,ownerAccountHash,walletAddress})));
 const ciphertext=Buffer.concat([cipher.update(seed),cipher.final()]);key.fill(0);seed.fill(0);
 writeFileSync(join(directory,'owner-'+ownerAccountHash+'.json'),JSON.stringify({version:1,purpose,ownerAccountHash,walletAddress,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')}),{mode:0o600,flag:'wx'});
 const vault=openPerpsCustodyVault({directory,keyFile,...common});assert.equal(vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true}).walletAddress,walletAddress);
 const controlsPath=join(root,'controls.sqlite'),controls=openPerpsAutomationControls(controlsPath,{now:f.options.now});
 controls.provision({ownerAccountHash,walletAddress,settings:{capital:100,loss:90,positions:2,margin:10,leverage:3,dailyTrades:5}});controls.close();
 for(const p of [f.path,controlsPath])chmodSync(p,0o600);
 const operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 return {request:{directory,keyFile,recipient:operator.recipient,explicitOperatorApproval:true,runtimePaths:{controlsPath,journalPath:f.path,temporaryDirectory:root},...common},
  restore:{operatorDirectory,destinationDirectory:join(root,'restored'),explicitOperatorApproval:true,...common}};
}

async function authorizedConversionFixture(t,{persistConversion=true}={}){
 const f=await conversionAttemptFixture(t),options=await recoveryOptions(t,f),archive=await createPerpsCustodyRecoveryArchive({...options.request,requireRestoreProof:true});
 const restored=await restorePerpsCustodyRecoveryArchive({...options.restore,ciphertext:archive.ciphertext});
 const common={allowNonPosixForTests:process.platform==='win32',now:f.options.now,monotonicNow:f.options.monotonicNow};
 const backupRegistry=openPerpsBackupRegistry(join(dirname(f.path),'backup.sqlite'),common);
 await backupRegistry.registerArchive(archive,{explicitOperatorApproval:true});backupRegistry.acceptRestoreProof({proofFile:restored.proofFile,explicitOperatorApproval:true});
 const controls=openPerpsAutomationControls(options.request.runtimePaths.controlsPath,{now:f.options.now}),ownerAccountHash='e'.repeat(64),walletAddress=f.row.wallet;
 const vault=openPerpsCustodyVault({directory:options.request.directory,keyFile:options.request.keyFile,...common});
 f.trackClose(backupRegistry);f.trackClose(controls);if(persistConversion)f.journal.preparePositionCloseConversionRecord(f.row.id,f.prepared);
 let allowed=true;const controlRevision=controls.read({ownerAccountHash,walletAddress}).revision;
 const args={journal:f.journal,controls,backupRegistry,request:f.conversionOptions.request,isClosingAllowed:()=>allowed,ownerAccountHash,walletAddress,closeId:f.row.id,
  controlRevision,maxSlippageBps:100,now:f.options.now,monotonicNow:f.options.monotonicNow};
 return {...f,args,vault,backupRegistry,archiveSha256:archive.sha256,disallow(){allowed=false;}};
}

test('worker close coordinator advances verified proceeds once and never sends in maintenance',async t=>{
 const f=await authorizedConversionFixture(t,{persistConversion:false});let execution=false,sends=0;
 const coordinator=createServerPerpsCloseCoordinator({journal:f.journal,controls:f.args.controls,vault:f.vault,backupRegistry:f.backupRegistry,
  rpcRequest:f.conversionOptions.request,readFinalizedAccount:async()=>{throw Error('not expected before finality');},
  isExecutionRunning:()=>execution,maxSlippageBps:100,now:f.options.now,monotonicNow:f.options.monotonicNow,
  fetchImpl:async(_url,options)=>{sends++;const row=f.journal.readPositionCloseConversion(f.row.id);
   assert.equal(row.state,'UNCERTAIN');assert.equal(JSON.parse(options.body).params[0],row.owner_signed_wire);
   return Response.json({jsonrpc:'2.0',id:1,result:row.signature});}});
 const identity={ownerAccountHash:f.args.ownerAccountHash,walletAddress:f.row.wallet};
 assert.equal((await coordinator.runOnce(identity)).stage,'AUTOMATED_CLOSE_EXECUTION_UNAVAILABLE');assert.equal(sends,0);
 const forbidden=()=>{throw Error('No new entry or account completion is allowed in this conversion cycle');};
 const executor=createServerPerpsExecutor({mode:'execute',controls:f.args.controls,journal:f.journal,vault:f.vault,backupRegistry:f.backupRegistry,
  readFeed:forbidden,readAccount:forbidden,readFinalizedAccount:forbidden,rpcRequest:f.conversionOptions.request,builderRequest:forbidden,
  fetchImpl:forbidden,closeCoordinator:coordinator,now:f.options.now,monotonicNow:f.options.monotonicNow});
 const reports=[],worker=createServerPerpsWorker({mode:'execute',controls:f.args.controls,executor,now:f.options.now,saveStatus:v=>reports.push(v)});
 execution=true;await worker.run({once:true});
 assert.equal(reports.length,1);assert.equal(reports[0].results.AUTOMATED_CLOSE_CYCLE,1);
 assert.equal(sends,1);assert.equal(f.journal.read('parent').state,'OPEN');
 execution=false;await coordinator.runOnce(identity);assert.equal(sends,1);
});

test('protected conversion custody authorization signs only finalized recorded proceeds and direct RPC is attempted once after durable uncertainty',async t=>{
 const f=await authorizedConversionFixture(t),risk=f.journal.riskState(f.row.wallet),grant=await authorizePerpsCloseConversion(f.prepared,f.args);
 assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'SIGNING');assert.throws(()=>f.vault.signCloseConversion({...grant}));
 const signed=f.vault.signCloseConversion(grant);assert.throws(()=>f.vault.signCloseConversion(grant));let sends=0;
 const submit=createPerpsCloseConversionBroadcaster({journal:f.journal,fetchImpl:async(url,options)=>{
  sends++;assert.equal(url,'https://api.mainnet-beta.solana.com');const input=JSON.parse(options.body);assert.equal(input.method,'sendTransaction');
  assert.equal(input.params[1].maxRetries,0);assert.equal(input.params[1].skipPreflight,false);
  const row=f.journal.readPositionCloseConversion(f.row.id);assert.equal(row.state,'UNCERTAIN');assert.equal(row.owner_signed_wire,input.params[0]);
  return Response.json({jsonrpc:'2.0',id:1,result:signed.signature});
 }});
 await assert.rejects(submit({...signed},f.args));const result=await submit(signed,f.args);assert.equal(result.stage,'CLOSE_CONVERSION_BROADCAST_ACKNOWLEDGED');
 await assert.rejects(submit(signed,f.args));assert.equal(sends,1);assert.deepEqual(f.journal.riskState(f.row.wallet),risk);
 assert.equal(f.journal.read('parent').state,'OPEN');
 const request=(m,p)=>m==='getMultipleAccounts'?f.swap.request(m,p):f.receipt.request(m,p);
 const receipt=await f.journal.recoverPositionCloseConversion(f.row.id,{...f.receipt.receiptOptions,request});
 assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'FINALIZED');assert.ok(receipt);
 assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(sends,1);
});

test('conversion executor joins the custody boundary, one attempted transport and rooted recovery without releasing parent risk',async t=>{
 const f=await authorizedConversionFixture(t);let sends=0;
 const executor=createPerpsCloseConversionExecutor({journal:f.journal,vault:f.vault,fetchImpl:async(_url,options)=>{
  sends++;const row=f.journal.readPositionCloseConversion(f.row.id);assert.equal(row.state,'UNCERTAIN');
  assert.equal(JSON.parse(options.body).params[0],row.owner_signed_wire);return Response.json({jsonrpc:'2.0',id:1,result:row.signature});
 }});
 await assert.rejects(executor.execute({...f.prepared},f.args));assert.equal(sends,0);
 assert.throws(()=>executor.recover(f.row.id,f.receipt.receiptOptions));
 const result=await executor.execute(f.prepared,f.args);assert.equal(result.stage,'CLOSE_CONVERSION_BROADCAST_ACKNOWLEDGED');
 await assert.rejects(executor.execute(f.prepared,f.args));assert.equal(sends,1);
 const request=(m,p)=>m==='getMultipleAccounts'?f.swap.request(m,p):f.receipt.request(m,p);
 const recovered=await executor.recover(f.row.id,{...f.receipt.receiptOptions,request});assert.equal(recovered.stage,'RECORDED_CONVERSION_FINALIZED');
 assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(sends,1);
});

test('conversion executor never restarts an uncertain operation after a lost response',async t=>{
 const f=await authorizedConversionFixture(t);let sends=0;
 const executor=createPerpsCloseConversionExecutor({journal:f.journal,vault:f.vault,fetchImpl:async()=>{sends++;throw Error('lost response');}});
 assert.equal((await executor.execute(f.prepared,f.args)).stage,'CLOSE_CONVERSION_BROADCAST_UNKNOWN');
 await assert.rejects(executor.execute(f.prepared,f.args));assert.equal(sends,1);
 assert.equal(f.open().readPositionCloseConversion(f.row.id).state,'UNCERTAIN');assert.equal(f.journal.read('parent').state,'OPEN');
});

test('conversion authorization blocks unavailable backup, changed controls and late closure disablement without a send',async t=>{
 for(const mode of ['backup-before','backup-after','controls-after','disabled-after','expired']){
  const f=await authorizedConversionFixture(t);let sends=0;
  if(mode==='backup-before'){
   f.backupRegistry.revokeArchive({archiveSha256:f.archiveSha256,explicitOperatorApproval:true});
   await assert.rejects(authorizePerpsCloseConversion(f.prepared,f.args));assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'PREPARED');continue;
  }
  const grant=await authorizePerpsCloseConversion(f.prepared,f.args);
  if(mode==='backup-after'){f.backupRegistry.revokeArchive({archiveSha256:f.archiveSha256,explicitOperatorApproval:true});assert.throws(()=>f.vault.signCloseConversion(grant));}
  else if(mode==='controls-after'){f.args.controls.pause({ownerAccountHash:f.args.ownerAccountHash,walletAddress:f.row.wallet});assert.throws(()=>f.vault.signCloseConversion(grant));}
  else if(mode==='expired'){f.expire();assert.throws(()=>f.vault.signCloseConversion(grant));}
  else{const signed=f.vault.signCloseConversion(grant);f.disallow();const submit=createPerpsCloseConversionBroadcaster({journal:f.journal,fetchImpl:async()=>{sends++;throw Error();}});await assert.rejects(submit(signed,f.args));}
  assert.equal(sends,0);assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'SIGNING');assert.equal(f.journal.read('parent').state,'OPEN');
 }
});

test('a conversion transport timeout stays durably uncertain across reopen and cannot be resubmitted',async t=>{
 const f=await authorizedConversionFixture(t),grant=await authorizePerpsCloseConversion(f.prepared,f.args),signed=f.vault.signCloseConversion(grant);let sends=0;
 const submit=createPerpsCloseConversionBroadcaster({journal:f.journal,fetchImpl:async()=>{sends++;throw Error('unacknowledged fixture transport');}});
 const result=await submit(signed,f.args);assert.equal(result.stage,'CLOSE_CONVERSION_BROADCAST_UNKNOWN');assert.equal(result.readyForRetry,false);
 assert.equal(f.open().readPositionCloseConversion(f.row.id).state,'UNCERTAIN');await assert.rejects(submit(signed,f.args));assert.equal(sends,1);
 assert.equal(f.journal.read('parent').state,'OPEN');
});

test('late pool fee or custody book changes abort signed conversion before any transport',async t=>{
 for(const mode of ['pool-fee','custody-owned','custody-tail']){
  const f=await authorizedConversionFixture(t),grant=await authorizePerpsCloseConversion(f.prepared,f.args),signed=f.vault.signCloseConversion(grant);let sends=0;
  const a=f.swap.after.get(mode==='pool-fee'?PERPS_POOL:f.swap.c.address),b=Buffer.from(a.data[0],'base64');
  if(mode==='pool-fee'){const n=b.readUInt32LE(8),p=16+n+32*b.readUInt32LE(12+n);b[p+56]^=1;}
  else b[mode==='custody-owned'?222:300]^=1;
  a.data[0]=b.toString('base64');
  const submit=createPerpsCloseConversionBroadcaster({journal:f.journal,fetchImpl:async()=>{sends++;throw Error('must not send');}});
  await assert.rejects(submit(signed,f.args));assert.equal(sends,0);assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'SIGNING');
  assert.equal(f.journal.read('parent').state,'OPEN');
 }
});

test('concurrent conversion submissions cannot send the same signed operation twice',async t=>{
 const f=await authorizedConversionFixture(t),grant=await authorizePerpsCloseConversion(f.prepared,f.args),signed=f.vault.signCloseConversion(grant);let sends=0;
 const submit=createPerpsCloseConversionBroadcaster({journal:f.journal,fetchImpl:async()=>{sends++;return Response.json({jsonrpc:'2.0',id:1,result:signed.signature});}});
 const results=await Promise.allSettled([submit(signed,f.args),submit(signed,f.args)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(sends,1);
 assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'UNCERTAIN');assert.equal(f.journal.read('parent').state,'OPEN');
});

test('a mismatched RPC acknowledgement cannot finalize a conversion or make it retryable',async t=>{
 const f=await authorizedConversionFixture(t),grant=await authorizePerpsCloseConversion(f.prepared,f.args),signed=f.vault.signCloseConversion(grant);let sends=0;
 const submit=createPerpsCloseConversionBroadcaster({journal:f.journal,fetchImpl:async()=>{sends++;return Response.json({jsonrpc:'2.0',id:1,result:'different-signature'});}});
 const result=await submit(signed,f.args);assert.equal(result.stage,'CLOSE_CONVERSION_BROADCAST_UNKNOWN');assert.equal(result.readyForRetry,false);
 await assert.rejects(submit(signed,f.args));assert.equal(sends,1);assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'UNCERTAIN');
 assert.equal(f.journal.read('parent').state,'OPEN');
});

test('encrypted recovery preserves every second-leg phase and its exact signed/result bytes with custody still quarantined',async t=>{
 for(const state of ['PREPARED','SIGNING','UNCERTAIN','FINALIZED']){
  const f=await conversionAttemptFixture(t);
  if(['UNCERTAIN','FINALIZED'].includes(state))f.uncertain();else {
   f.journal.preparePositionCloseConversionRecord(f.row.id,f.prepared);
   if(state==='SIGNING')f.journal.beginPositionCloseConversionSigning(f.row.id,f.prepared);
  }
  if(state==='FINALIZED')f.journal.reconcilePositionCloseConversion(f.row.id,await readFinalizedPerpsCloseConversionReceipt(f.p.prepared.wire,f.receipt.identity,f.receipt.receiptOptions));
  const before=f.journal.readPositionCloseConversion(f.row.id),options=await recoveryOptions(t,f),archive=await createPerpsCustodyRecoveryArchive(options.request),restored=await restorePerpsCustodyRecoveryArchive({...options.restore,ciphertext:archive.ciphertext});
  const j=openPerpsExecutionJournal(join(restored.runtimeDirectory,'journal.sqlite'),{now:f.options.now});
  try{assert.deepEqual(j.readPositionCloseConversion(f.row.id),before);assert.equal(j.read('parent').state,'OPEN');assert.equal(j.riskState(f.row.wallet).activeMarginUsdcUnits,'10000000');}
  finally{j.close();}assert.equal(restored.readyForSigning,false);assert.equal(restored.tradingEnabled,false);
 }
});

test('encrypted recovery rejects a conversion detached from its finalized first-leg payout',async t=>{
 const f=await conversionAttemptFixture(t);f.uncertain();const options=await recoveryOptions(t,f),db=new DatabaseSync(f.path);
 db.prepare("UPDATE perps_close_conversions SET payout_binding=?").run('f'.repeat(64));db.close();
 await assert.rejects(createPerpsCustodyRecoveryArchive(options.request));
});

test('restart reconstructs the exact recorded conversion with native roles and reconciles only its rooted signature',async t=>{
 for(const options of [{asset:'SOL'},{asset:'SOL',unwrapSol:false},{asset:'ETH'},{asset:'BTC'}]){
  const f=await conversionAttemptFixture(t,options),uncertain=f.uncertain(),j=f.open(),calls=[];
  const request=async(m,p)=>{calls.push({m,p});return m==='getMultipleAccounts'?f.swap.request(m,p):f.receipt.request(m,p);};
  const result=await j.recoverPositionCloseConversion(f.row.id,{...f.receipt.receiptOptions,request});
  assert.equal(result.stage,'RECORDED_CONVERSION_FINALIZED');assert.equal(result.signature,uncertain.signature);assert.equal(result.receivedUsdcUnits,String(f.receipt.received));
  assert.equal(result.readyForSigning,false);assert.equal(result.requiresCompleteDailyAccounting,true);
  assert.equal(j.readPositionCloseConversion(f.row.id).state,'FINALIZED');assert.equal(j.read('parent').state,'OPEN');
  const repeated=await j.recoverPositionCloseConversion(f.row.id,{...f.receipt.receiptOptions,request});assert.deepEqual(repeated.execution,result.execution);
  assert(calls.filter(c=>c.m==='getTransaction').every(c=>c.p[0]===uncertain.signature));
  assert(calls.every(c=>!['simulateTransaction','sendTransaction','requestAirdrop','getLatestBlockhash'].includes(c.m)));
 }
});

test('unknown or failed conversion history never re-prepares, re-signs, resends or forgets recorded uncertainty',async t=>{
 for(const mode of ['missing','confirmed','failed']){
  const f=await conversionAttemptFixture(t),before=f.uncertain();
  if(mode==='confirmed')f.receipt.status.confirmationStatus='confirmed';
  if(mode==='failed')f.receipt.status.err={InstructionError:[6,{Custom:6020}]};
  const request=(m,p)=>m==='getMultipleAccounts'?f.swap.request(m,p):mode==='missing'&&m==='getSignatureStatuses'?Promise.resolve({context:{slot:410},value:[null]}):f.receipt.request(m,p);
  const recover=()=>f.journal.recoverPositionCloseConversion(f.row.id,{...f.receipt.receiptOptions,request});
  if(mode==='failed')await assert.rejects(recover);else assert.equal((await recover()).stage,'RECORDED_CONVERSION_AWAITING_FINALITY');
  assert.deepEqual(f.journal.readPositionCloseConversion(f.row.id),before);assert.equal(f.journal.read('parent').state,'OPEN');
  await assert.rejects(f.journal.preparePositionCloseConversion(f.row.id,f.conversionOptions));
 }
});

test('conversion recovery refuses changed native roles or durable facts instead of substituting a new message',async t=>{
 for(const mode of ['native','durable']){
  const f=await conversionAttemptFixture(t);f.uncertain();let changed=false;
  const request=async(m,p)=>{
   const reply=await (m==='getMultipleAccounts'?f.swap.request(m,p):f.receipt.request(m,p));
   if(m==='getMultipleAccounts'&&!changed){changed=true;
    if(mode==='native'){const b=Buffer.from(reply.value[0].data[0],'base64');b[72]^=1;reply.value[0]={...reply.value[0],data:[b.toString('base64'),'base64']};}
    else {const db=new DatabaseSync(f.path);db.prepare('UPDATE perps_close_conversions SET updated=updated+1').run();db.close();}
   }return reply;
  };
  await assert.rejects(f.journal.recoverPositionCloseConversion(f.row.id,{...f.receipt.receiptOptions,request}));
  assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'UNCERTAIN');assert.equal(f.journal.read('parent').state,'OPEN');
 }
});

async function financialHistoryFixture(t,options={},build=conversionAttemptFixture){
 const f=await build(t,{transferAmountUsd:'700000',...options});f.uncertain();
 let time=f.receipt.receiptOptions.now()+70000,mono=0;const calls=[],conversionSignature=f.receipt.identity.signature,firstSignature=f.identity.signature;
 const request=async(m,p)=>{
  calls.push({m,p});if(m==='getTransaction')return structuredClone(p[0]===conversionSignature?f.receipt.transaction:p[0]===firstSignature?f.tx:null);
  if(m==='getSignatureStatuses')return f.receipt.request(m,p);
  return m==='getMultipleAccounts'&&p[0].length===2?f.swap.request(m,p):f.request(m,p);
 };
 const opts={request,now:()=>time,monotonicNow:()=>mono};
 const transaction=await readServerPerpsTradeTransaction({walletAddress:f.row.wallet,signature:conversionSignature,day:new Date(time).toISOString().slice(0,10)},{...opts,requireTradeEvent:false});
 const conversion=await readJournalledPerpsConversion(transaction,{...opts,journal:f.journal});
 const minute=Math.floor(f.receipt.transaction.blockTime/60)*60,prices={USDCUSD:[[minute,'1','1','1','1','1','20',3],[minute+60,'1','1','1','1','1','20',3]],'SOL-USD':[[minute,100,100,100,100,20],[minute-60,100,100,100,100,20]]},fetchCalls=[];
 const fetchImpl=async(url,options)=>{fetchCalls.push({url,options});const u=new URL(url);return u.hostname==='api.kraken.com'?Response.json({error:[],result:{USDCUSD:prices.USDCUSD,last:minute}}):Response.json(prices[u.pathname.split('/')[2]]);};
 return {...f,transaction,conversion,opts,request,prices,fetchImpl,fetchCalls,calls,minute,setTime(v){time=v;},expireHistoryLease(){mono=10001;}};
}

test('daily conversion history requires the exact signed journal operation and immutable first-leg event basis, not a generic swap exception',async t=>{
 const f=await financialHistoryFixture(t),c=f.conversion;
 assert.equal(c.inputValueUsdUnits,'700000');assert.equal(c.receivedUsdcUnits,'696500');assert.equal(c.swapFeeUsdcUnits,'3500');
 assert.equal(c.readyForSigning,false);assert.equal(c.firstLegSignature,f.identity.signature);
 assert.equal(requireVerifiedPerpsConversionHistory(c,{transaction:f.transaction,journal:f.journal}),c);
 assert.throws(()=>requireVerifiedPerpsConversionHistory({...c}));
 const before=f.calls.length;assert.equal(await readJournalledPerpsConversion(f.transaction,{...f.opts,journal:f.journal}),c);assert.equal(f.calls.length,before);
 assert.equal(await readJournalledPerpsConversion(f.transaction,{...f.opts,journal:{}}),null);
 const db=new DatabaseSync(f.path);db.prepare('UPDATE perps_close_conversions SET payout_binding=?').run('e'.repeat(64));db.close();
 assert.throws(()=>requireVerifiedPerpsConversionHistory(c));await assert.rejects(readJournalledPerpsConversion(f.transaction,{...f.opts,journal:f.journal}));
});

test('USDC risk uses actual closed-market bounds, charges depegs and never lets a gain erase the swap fee',async t=>{
 for(const mode of ['parity','depeg','profit','bounds']){
  const f=await financialHistoryFixture(t,mode==='profit'?{transferAmountUsd:'100000'}:{});
  if(mode==='depeg')f.prices.USDCUSD[0]=[f.minute,'0.5','0.5','0.5','0.5','0.5','20',3];
  if(mode==='bounds')f.prices.USDCUSD[0]=[f.minute,'1','1.01','0.99','1','1','20',3];
  const reader=createPerpsConversionUsdValuationReader({...f.opts,fetchImpl:f.fetchImpl}),input={conversions:[f.conversion],day:f.transaction.day},v=await reader(input);
  if(mode==='parity'||mode==='profit')assert.equal(v.conversionLossUsdUnits,'3500');
  if(mode==='depeg')assert.equal(v.conversionLossUsdUnits,'351750');
  if(mode==='bounds'){
   const received=696500n*99000000n/100000000n;assert.equal(v.items[0].receivedUsdLowerUnits,String(received));assert.equal(v.conversionLossUsdUnits,String(700000n-received));
  }
  assert.equal(v.readyForSigning,false);assert.equal(f.fetchCalls.length,1);assert(f.fetchCalls.every(c=>c.options.method==='GET'&&c.options.credentials==='omit'&&c.options.body===undefined));
  const url=new URL(f.fetchCalls[0].url);assert.equal(url.origin,'https://api.kraken.com');assert.equal(url.pathname,'/0/public/OHLC');assert.equal(url.searchParams.get('pair'),'USDCUSD');assert.equal(url.searchParams.get('interval'),'1');
  assert.equal((await reader(input)).conversionLossUsdUnits,v.conversionLossUsdUnits);assert.equal(f.fetchCalls.length,1);
  assert.throws(()=>requirePerpsConversionUsdValuation({...v},input));assert.throws(()=>requirePerpsConversionUsdValuation(v,{...input,conversions:[]}));
  f.expireHistoryLease();assert.throws(()=>requirePerpsConversionUsdValuation(v,input));
 }
});

test('missing, partial, substituted or malformed currency candles cannot silently become one dollar or zero conversion loss',async t=>{
 for(const mode of ['missing','partial','duplicate','inverted','outside','zero','http','content','copiedFact','duplicateFact','apiError','wrongPair','uncommittedOnly','tooMany','precision','volume']){
  const f=await financialHistoryFixture(t);let fetchImpl=f.fetchImpl,conversions=[f.conversion];
  if(mode==='missing')f.prices.USDCUSD=[];
  if(mode==='partial')f.setTime((f.minute+64)*1000);
  if(mode==='duplicate')f.prices.USDCUSD.push([...f.prices.USDCUSD[0]]);
  if(mode==='inverted')f.prices.USDCUSD[0][3]='2';
  if(mode==='outside')f.prices.USDCUSD[0][0]-=60;
  if(mode==='zero')f.prices.USDCUSD[0][3]='0';
  if(mode==='http')fetchImpl=async()=>new Response('unavailable',{status:503});
  if(mode==='content')fetchImpl=async()=>new Response('[]');
  if(mode==='apiError')fetchImpl=async()=>Response.json({error:['EService:Unavailable'],result:{}});
  if(mode==='wrongPair')fetchImpl=async()=>Response.json({error:[],result:{USDCUSDT:f.prices.USDCUSD,last:f.minute}});
  if(mode==='uncommittedOnly')f.prices.USDCUSD.pop();
  if(mode==='tooMany')f.prices.USDCUSD=Array.from({length:722},(_,i)=>[f.minute-(721-i)*60,'1','1','1','1','1','20',3]);
  if(mode==='precision')f.prices.USDCUSD[0][3]='0.999999999';
  if(mode==='volume')f.prices.USDCUSD[0][6]='-1';
  if(mode==='copiedFact')conversions=[{...f.conversion}];if(mode==='duplicateFact')conversions=[f.conversion,f.conversion];
  await assert.rejects(createPerpsConversionUsdValuationReader({...f.opts,fetchImpl})({conversions,day:f.transaction.day}),mode);
 }
});

test('older same-day conversions use the retained closed five-minute USD bucket rather than silently missing twelve-hour minute history',async t=>{
 const f=await financialHistoryFixture(t,{nowMs:Date.parse('2026-10-20T00:00:00Z')});f.setTime(Date.parse('2026-10-20T20:00:00Z'));
 f.prices.USDCUSD[1][0]=Date.parse('2026-10-20T20:00:00Z')/1000;
 const input={conversions:[f.conversion],day:f.transaction.day},v=await createPerpsConversionUsdValuationReader({...f.opts,fetchImpl:f.fetchImpl})(input);
 assert.equal(f.fetchCalls.length,1);assert.equal(new URL(f.fetchCalls[0].url).searchParams.get('interval'),'5');
 assert.equal(v.items[0].timeframeSeconds,300);assert.equal(v.conversionLossUsdUnits,'3500');
 f.setTime(Date.parse('2026-10-21T00:00:00Z'));assert.throws(()=>requirePerpsConversionUsdValuation(v,input));
});

test('real venue zero-trade bars do not poison unrelated prices, and cannot themselves value a conversion',async t=>{
 for(const mode of ['unrelated','fallback','absent','inconsistent']){
  const f=await financialHistoryFixture(t),input={conversions:[f.conversion],day:f.transaction.day};
  const empty=(time)=>[time,'0.9999','0.9999','0.9999','0.9999','0.0000','0.00000000',0];
  let fetchImpl=f.fetchImpl;
  if(mode==='unrelated')f.prices.USDCUSD.unshift(empty(f.minute-60));
  else if(mode==='inconsistent')f.prices.USDCUSD[0][7]=0;
  else {
   f.prices.USDCUSD[0]=empty(f.minute);f.setTime((Math.floor(f.minute/300)*300+370)*1000);
   fetchImpl=async(url,options)=>{
    if(new URL(url).searchParams.get('interval')!=='5')return f.fetchImpl(url,options);
    f.fetchCalls.push({url,options});const start=Math.floor(f.minute/300)*300;
    return Response.json({error:[],result:{USDCUSD:[mode==='absent'?empty(start):[start,'1','1','1','1','1','20',3],empty(start+300)],last:start+300}});
   };
  }
  const reader=createPerpsConversionUsdValuationReader({...f.opts,fetchImpl});
  if(mode==='absent'||mode==='inconsistent')await assert.rejects(reader(input),mode);
  else {
   const v=await reader(input);assert.equal(v.conversionLossUsdUnits,'3500');
   assert.equal(v.items[0].timeframeSeconds,mode==='fallback'?300:60);assert.equal(f.fetchCalls.length,mode==='fallback'?2:1);
  }
 }
});

function dailyHistoryRequest(f){
 const wallet=f.row.wallet,time=f.opts.now(),rows=[f.receipt.transaction,f.tx].map(tx=>({signature:tx===f.tx?f.identity.signature:f.receipt.identity.signature,slot:tx.slot,blockTime:tx.blockTime,err:tx.meta.err,confirmationStatus:'finalized'}));
 return async(m,p)=>{
  if(m==='getSlot')return 50000;if(m==='getBlocks')return [1];if(m==='getBlockTime')return p[0]===50000?time/1000-5:time/1000-172800;
  if(m==='getFirstAvailableBlock')return 1;
  if(m==='getSignaturesForAddress')return [wallet,f.row.position].includes(p[0])?structuredClone(rows):[];
  if(m==='getMultipleAccounts'&&p[0].length===8)return {context:{slot:50000},value:[f.swap.after.get(wallet),f.swap.after.get(f.receipt.wire.destination),...Array(6).fill(null)]};
  return f.request(m,p);
 };
}
test('complete daily accounting includes a journal-bound conversion and both network fees without counting another entry or releasing parent risk',async t=>{
 const f=await financialHistoryFixture(t),wallet=f.row.wallet,request=dailyHistoryRequest(f);
 const options={...f.opts,request,journal:f.journal,readNetworkFees:createPerpsNetworkFeeValuationReader({...f.opts,fetchImpl:f.fetchImpl}),readConversionLoss:createPerpsConversionUsdValuationReader({...f.opts,fetchImpl:f.fetchImpl})};
 const reader=createServerPerpsDailyAccountReader(options),value=await reader({walletAddress:wallet});
 assert.equal(value.transactions.length,2);assert.equal(value.conversions.length,1);assert.equal(value.tradesToday,0);
 assert.equal(value.conversionLossUsdUnits,'3500');assert.equal(value.walletNetworkFeesLamports,'10400');assert.equal(value.networkFeeUsdUnits,'1040');assert.equal(value.lossTodayUsdcUnits,'4540');
 assert.equal(requireFreshServerPerpsDailyAccount(value,{walletAddress:wallet,journal:f.journal}),value);assert.equal(f.journal.read('parent').state,'OPEN');
 assert.throws(()=>requireFreshServerPerpsDailyAccount(value,{walletAddress:wallet,journal:{}}));
 assert.equal(f.journal.readPositionCloseConversion(f.row.id).state,'UNCERTAIN'); // History is strictly read-only.
 await assert.rejects(createServerPerpsDailyAccountReader({...options,readConversionLoss:undefined})({walletAddress:wallet}));
 await assert.rejects(createServerPerpsDailyAccountReader({...options,readConversionLoss:async()=>({conversionLossUsdUnits:'0'})})({walletAddress:wallet}));
 await assert.rejects(createServerPerpsDailyAccountReader({...options,journal:{}})({walletAddress:wallet}));
 await assert.rejects(createServerPerpsDailyAccountReader({...options,readNetworkFees:async input=>{
  const fees=await options.readNetworkFees(input),db=new DatabaseSync(f.path);
  db.prepare('UPDATE perps_close_conversions SET updated=updated+1').run();db.close();return fees;
 }})({walletAddress:wallet}));
 assert.throws(()=>requireFreshServerPerpsDailyAccount(value,{walletAddress:wallet}));
});

test('a close before UTC midnight and its conversion after midnight charge the conversion day without double charging yesterday network fees',async t=>{
 const build=async(t,options)=>{
  const f=await fixture(t,{...options,nowMs:Date.parse('2026-10-20T23:59:50Z')});f.uncertain();
  f.journal.reconcilePositionClosePayout(f.row.id,await readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
  const nowMs=f.options.now()+20000;f.advance(20000);
  const swap=await conversionFixture({walletAddress:f.row.wallet,amountUnits:'7000000',nowMs});
  const request=(m,p)=>['getTransaction','getSignatureStatuses','getGenesisHash'].includes(m)||m==='getMultipleAccounts'&&p[1].commitment==='finalized'?f.request(m,p):swap.request(m,p);
  const prepared=await f.journal.preparePositionCloseConversion(f.row.id,{...swap.options,request}),p=readJournaledPerpsCloseConversion(prepared,f.journal);
  const fixturePrivateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,51)]),format:'der',type:'pkcs8'});
  const receipt=await conversionReceiptFixture({amountUnits:'7000000',fixturePrivateKey,finalizedSlot:400,nowMs});
  const uncertain=()=>{f.journal.preparePositionCloseConversionRecord(f.row.id,prepared);f.journal.beginPositionCloseConversionSigning(f.row.id,prepared);return f.journal.recordPositionCloseConversionBroadcast(f.row.id,verifyOwnerSignedPerpsCloseConversionIntent(p.prepared.wire,receipt.transaction.transaction[0]));};
  return {...f,swap,receipt,prepared,p,uncertain};
 };
 const f=await financialHistoryFixture(t,{},build),wallet=f.row.wallet;
 assert.equal(f.conversion.firstLegDay,'2026-10-20');assert.equal(f.conversion.day,'2026-10-21');
 const value=await createServerPerpsDailyAccountReader({...f.opts,request:dailyHistoryRequest(f),journal:f.journal,
  readNetworkFees:createPerpsNetworkFeeValuationReader({...f.opts,fetchImpl:f.fetchImpl}),readConversionLoss:createPerpsConversionUsdValuationReader({...f.opts,fetchImpl:f.fetchImpl})})({walletAddress:wallet});
 assert.equal(value.day,'2026-10-21');assert.equal(value.transactions.length,1);assert.equal(value.tradesToday,0);
 assert.equal(value.walletNetworkFeesLamports,'5400');assert.equal(value.networkFeeUsdUnits,'540');assert.equal(value.conversionLossUsdUnits,'3500');assert.equal(value.lossTodayUsdcUnits,'4040');
 assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(value.conversions[0].firstLegDay,'2026-10-20');
});

async function completionFixture(t,options={},{finalizeConversion=true}={}){
 const f=await financialHistoryFixture(t,options),base=dailyHistoryRequest(f);
 const request=async(m,p)=>{
  if(m==='getSignatureStatuses'&&p[0][0]===f.identity.signature)return f.options.request(m,p);
  if(m==='getMultipleAccounts'&&p[0][0]===f.row.position)return {context:{slot:50000},value:p[0].map(()=>null)};
  return base(m,p);
 };
 if(finalizeConversion)await f.journal.recoverPositionCloseConversion(f.row.id,{...f.opts,request,now:f.options.now});f.advance(70000);
 const readFinalizedAccount=createServerPerpsDailyAccountReader({...f.opts,request,journal:f.journal,
  readNetworkFees:createPerpsNetworkFeeValuationReader({...f.opts,fetchImpl:f.fetchImpl}),readConversionLoss:createPerpsConversionUsdValuationReader({...f.opts,fetchImpl:f.fetchImpl})});
 return {...f,completionOptions:{...f.opts,request,readFinalizedAccount}};
}

test('terminal close reconciliation releases original risk atomically only after both finalized legs, complete daily costs and absent sibling exits',async t=>{
 const f=await completionFixture(t),proof=await readFinalizedPerpsCloseCompletion(f.journal,f.row.id,f.completionOptions);
 assert.equal(proof.receivedUsdcUnits,'696500');assert.equal(proof.lossTodayUsdUnits,'4540');assert.equal(proof.readyForSigning,false);
 assert.equal(requireVerifiedPerpsCloseCompletion(proof,{journal:f.journal}),proof);assert.throws(()=>requireVerifiedPerpsCloseCompletion({...proof},{journal:f.journal}));
 const saved=f.journal.reconcilePositionCloseCompletion(f.row.id,proof);
 assert.equal(saved.close_id,f.row.id);assert.equal(f.journal.read('parent').state,'CLOSED');assert.equal(f.journal.readPositionClose(f.row.id).state,'COMPLETED');
 assert.equal(f.journal.riskState(f.row.wallet).activeMarginUsdcUnits,'0');assert.equal(f.journal.riskState(f.row.wallet).executedToday,1);
 assert.equal(f.journal.pendingPositionCloses(f.row.wallet).length,0);assert.throws(()=>f.journal.beginPositionCloseSigning(f.row.id));
 assert.throws(()=>requireVerifiedPerpsCloseCompletion(proof,{journal:f.journal}));
 const next=await readFinalizedPerpsCloseCompletion(f.journal,f.row.id,f.completionOptions);
 assert.deepEqual(f.journal.reconcilePositionCloseCompletion(f.row.id,next),saved);
 const account=await f.completionOptions.readFinalizedAccount({walletAddress:f.row.wallet});assert.equal(account.conversionLossUsdUnits,'3500');
});

test('conversion coordinator completes accounting idempotently without calling custody or transport',async t=>{
 const f=await completionFixture(t);let keyCalls=0,sends=0;
 const executor=createPerpsCloseConversionExecutor({journal:f.journal,vault:{signCloseConversion(){keyCalls++;throw Error('no keys in completion');}},
  fetchImpl:async()=>{sends++;throw Error('no transport in completion');}});
 const saved=await executor.complete(f.row.id,f.completionOptions);
 assert.equal(f.journal.read('parent').state,'CLOSED');assert.equal(f.journal.readPositionClose(f.row.id).state,'COMPLETED');
 assert.deepEqual(await executor.complete(f.row.id,f.completionOptions),saved);assert.equal(keyCalls,0);assert.equal(sends,0);
 assert.equal(f.journal.riskState(f.row.wallet).activeMarginUsdcUnits,'0');
});

test('native coordinator requires rooted sibling cleanup before preparing any conversion or touching custody',async t=>{
 const f=await fixture(t,{withExits:true});f.uncertain();
 f.journal.reconcilePositionClosePayout(f.row.id,await readFinalizedPerpsClosePayout(f.row,f.identity,f.options));let calls=0,keys=0,sends=0;
 const executor=createNativePerpsCloseExecutor({journal:f.journal,vault:{signNativeClose(){keys++;throw Error();},signCloseConversion(){keys++;throw Error();}},
  fetchImpl:async()=>{sends++;throw Error();}});
 const result=await executor.prepareConversion(f.row.id,{request:async(m,p)=>{
  calls++;assert.equal(m,'getMultipleAccounts');assert.equal(p[1].commitment,'finalized');assert.equal(p[1].minContextSlot,300);
  return {context:{slot:301},value:p[0].map(()=>({owner:'11111111111111111111111111111111',executable:false,lamports:2039280,data:['','base64']}))};
 }});
 assert.equal(result.stage,'NATIVE_CLOSE_SIBLING_EXIT_CLEANUP_REQUIRED');assert.equal(calls,1);assert.equal(keys,0);assert.equal(sends,0);
 assert.equal(f.journal.readPositionCloseConversion(f.row.id),null);assert.equal(f.journal.read('parent').state,'OPEN');
 assert.equal(f.journal.riskState(f.row.wallet).activeMarginUsdcUnits,'10000000');
});

test('conversion coordinator cannot complete an unfinalized conversion or release its held margin',async t=>{
 const f=await completionFixture(t,{},{finalizeConversion:false});let keyCalls=0,sends=0;
 const executor=createPerpsCloseConversionExecutor({journal:f.journal,vault:{signCloseConversion(){keyCalls++;throw Error('no keys');}},
  fetchImpl:async()=>{sends++;throw Error('no sends');}});
 await assert.rejects(executor.complete(f.row.id,f.completionOptions));assert.equal(f.journal.read('parent').state,'OPEN');
 assert.equal(f.journal.riskState(f.row.wallet).activeMarginUsdcUnits,'10000000');assert.equal(keyCalls,0);assert.equal(sends,0);
});

test('native conversion preparation captures its read transport before asynchronous sibling discovery',async t=>{
 const f=await fixture(t,{withExits:true});f.uncertain();
 f.journal.reconcilePositionClosePayout(f.row.id,await readFinalizedPerpsClosePayout(f.row,f.identity,f.options));let queries=0;
 const executor=createNativePerpsCloseExecutor({journal:f.journal,vault:{signNativeClose(){throw Error('no keys');},signCloseConversion(){throw Error('no keys');}},
  fetchImpl:async()=>{throw Error('no sends');}});
 const options={request:async(m,p)=>{
  queries++;if(queries!==1)throw Error('CAPTURED_READ_TRANSPORT');assert.equal(m,'getMultipleAccounts');
  options.request=async()=>{throw Error('REPLACED_READ_TRANSPORT');};
  return {context:{slot:301},value:p[0].map(()=>null)};
 }};
 await assert.rejects(executor.prepareConversion(f.row.id,options),/CAPTURED_READ_TRANSPORT/);
 assert.equal(queries,2);assert.equal(f.journal.readPositionCloseConversion(f.row.id),null);assert.equal(f.journal.read('parent').state,'OPEN');
});

test('native lifecycle dispatches sibling cleanup only in explicitly allowed execution cycles and never trusts it to release risk',async t=>{
 const f=await fixture(t,{withExits:true});f.uncertain();
 f.journal.reconcilePositionClosePayout(f.row.id,await readFinalizedPerpsClosePayout(f.row,f.identity,f.options));let cleanups=0,keys=0,sends=0;
 const executor=createNativePerpsCloseExecutor({journal:f.journal,vault:{signNativeClose(){keys++;throw Error();},signCloseConversion(){keys++;throw Error();}},
  fetchImpl:async()=>{sends++;throw Error();},cleanupCoordinator:{async runOnce(input){cleanups++;assert.equal(input.walletAddress,f.row.wallet);return {stage:'CLAIMED_CLEANUP_DONE'};}}});
 const options={request:async(m,p)=>{assert.equal(m,'getMultipleAccounts');return {context:{slot:301},value:p[0].map(()=>({owner:'11111111111111111111111111111111',executable:false,lamports:2039280,data:['','base64']}))};},
  ownerAccountHash:'e'.repeat(64),isClosingAllowed:()=>false};
 assert.equal((await executor.runOnce(f.row.id,options)).stage,'NATIVE_CLOSE_CONVERSION_REQUIRED');assert.equal(cleanups,0);
 assert.equal((await executor.runOnce(f.row.id,{...options,mode:'execute'})).stage,'NATIVE_CLOSE_SIBLING_EXIT_CLEANUP_REQUIRED');assert.equal(cleanups,0);
 assert.equal((await executor.runOnce(f.row.id,{...options,mode:'execute',isClosingAllowed:()=>true})).stage,'NATIVE_CLOSE_SIBLING_EXIT_CLEANUP_PENDING');
 assert.equal(cleanups,1);assert.equal(keys,0);assert.equal(sends,0);assert.equal(f.journal.readPositionCloseConversion(f.row.id),null);
 assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.riskState(f.row.wallet).activeMarginUsdcUnits,'10000000');
});

test('unfinalized conversion, live sibling exits, incomplete fee accounting and changed in-flight journal facts never release a close',async t=>{
 for(const mode of ['unfinalized','sibling','networkFees','pending','inflight']){
  const f=await completionFixture(t,{withExits:mode==='sibling'},{finalizeConversion:mode!=='unfinalized'}),opts={...f.completionOptions};
  if(mode==='networkFees')opts.readFinalizedAccount=createServerPerpsDailyAccountReader({...f.opts,request:opts.request,journal:f.journal,
   readConversionLoss:createPerpsConversionUsdValuationReader({...f.opts,fetchImpl:f.fetchImpl})});
  if(mode==='sibling'||mode==='inflight'){
   const base=opts.request;opts.request=async(m,p)=>{
    const value=await base(m,p);if(m==='getMultipleAccounts'&&p[0][0]===f.row.position){
     if(mode==='sibling')value.value[1]={owner:'11111111111111111111111111111111',executable:false,lamports:2039280,data:['','base64']};
     else {const db=new DatabaseSync(f.path);db.exec('UPDATE perps_close_conversions SET updated=updated+1');db.close();}
    }return value;
   };
  }
  if(mode==='pending'){
   const db=new DatabaseSync(f.path);db.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated) VALUES(?,?,?,?,?,'RESERVED',?,?)")
    .run(f.row.wallet,'new-signal','new-reservation',f.transaction.day,10000000,f.opts.now(),f.opts.now());db.close();
  }
  await assert.rejects(readFinalizedPerpsCloseCompletion(f.journal,f.row.id,opts),mode);
  assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.readPositionClose(f.row.id).state,'PREPARED');assert.equal(f.journal.readPositionCloseCompletion(f.row.id),null);
 }
});

test('completion evidence is journal-bound, expires at midnight or its oldest lease, and a competing connection cannot release the same risk twice',async t=>{
 for(const mode of ['foreign','expired','midnight','changed','competing']){
  const f=await completionFixture(t),proof=await readFinalizedPerpsCloseCompletion(f.journal,f.row.id,f.completionOptions);
  if(mode==='foreign')assert.throws(()=>f.open().reconcilePositionCloseCompletion(f.row.id,proof));
  if(mode==='expired')f.expireHistoryLease();
  if(mode==='midnight')f.setTime(Date.parse('2026-10-21T00:00:00Z'));
  if(mode==='changed'){const db=new DatabaseSync(f.path);db.exec('UPDATE perps_close_conversions SET updated=updated+1');db.close();}
  if(mode==='competing'){
   const other=f.open(),reader=createServerPerpsDailyAccountReader({...f.opts,request:f.completionOptions.request,journal:other,
    readNetworkFees:createPerpsNetworkFeeValuationReader({...f.opts,fetchImpl:f.fetchImpl}),readConversionLoss:createPerpsConversionUsdValuationReader({...f.opts,fetchImpl:f.fetchImpl})});
   const second=await readFinalizedPerpsCloseCompletion(other,f.row.id,{...f.completionOptions,readFinalizedAccount:reader});
   f.journal.reconcilePositionCloseCompletion(f.row.id,proof);assert.throws(()=>other.reconcilePositionCloseCompletion(f.row.id,second));
   assert.equal(other.read('parent').state,'CLOSED');assert.equal(other.readPositionCloseCompletion(f.row.id).observed_slot,proof.observedSlot);continue;
  }
  if(mode!=='foreign')assert.throws(()=>f.journal.reconcilePositionCloseCompletion(f.row.id,proof));
  assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.riskState(f.row.wallet).activeMarginUsdcUnits,'10000000');
 }
});

test('terminal persistence failure rolls back every parent and close state; retrying read-only evidence cannot partially free funds',async t=>{
 const f=await completionFixture(t,{withExits:true}),proof=await readFinalizedPerpsCloseCompletion(f.journal,f.row.id,f.completionOptions),db=new DatabaseSync(f.path);
 db.exec("CREATE TRIGGER completion_disk_failure BEFORE INSERT ON perps_close_completions BEGIN SELECT RAISE(ABORT,'completion-write-failed'); END;");
 assert.throws(()=>f.journal.reconcilePositionCloseCompletion(f.row.id,proof),/completion-write-failed/);
 assert.equal(f.journal.read('parent').state,'OPEN');assert.equal(f.journal.readPositionClose(f.row.id).state,'PREPARED');assert.equal(f.journal.readPositionCloseCompletion(f.row.id),null);
 db.exec('DROP TRIGGER completion_disk_failure');db.close();f.journal.reconcilePositionCloseCompletion(f.row.id,proof);
 const restarted=f.open();assert.equal(restarted.read('parent').state,'CLOSED');assert.equal(restarted.readPositionCloseCompletionSnapshot(f.row.id).close.state,'COMPLETED');
});

test('encrypted recovery retains completed financial legs and CLOSED parents, and rejects a detached terminal payout',async t=>{
 for(const altered of [false,true]){
  const f=await completionFixture(t),proof=await readFinalizedPerpsCloseCompletion(f.journal,f.row.id,f.completionOptions);
  f.journal.reconcilePositionCloseCompletion(f.row.id,proof);
  const options=await recoveryOptions(t,{...f,options:{...f.options,now:f.opts.now}});
  if(altered){
   const db=new DatabaseSync(f.path),row=f.journal.readPositionCloseCompletion(f.row.id),value=JSON.parse(row.record_json);value.receivedUsdcUnits='1';
   db.prepare('UPDATE perps_close_completions SET record_json=?').run(JSON.stringify(value));db.close();
   await assert.rejects(createPerpsCustodyRecoveryArchive(options.request));continue;
  }
  const archive=await createPerpsCustodyRecoveryArchive(options.request),restored=await restorePerpsCustodyRecoveryArchive({...options.restore,ciphertext:archive.ciphertext}),j=openPerpsExecutionJournal(join(restored.runtimeDirectory,'journal.sqlite'),{now:f.opts.now});
  try{assert.equal(j.readPositionCloseCompletionSnapshot(f.row.id).close.state,'COMPLETED');assert.equal(j.read('parent').state,'CLOSED');assert.equal(j.riskState(f.row.wallet).activeMarginUsdcUnits,'0');}
  finally{j.close();}assert.equal(restored.readyForSigning,false);assert.equal(restored.tradingEnabled,false);
 }
});

test('direct USDC and zero-return closes complete without inventing a conversion, including a legitimate retained zero position',async t=>{
 for(const options of [{side:'SHORT',asset:'SOL'},{side:'SHORT',asset:'ETH'},{side:'SHORT',asset:'BTC'},{amount:0n},{side:'SHORT',retainedPosition:true}]){
  const f=await settledFixture(t,options),time=f.options.now()+70000,minute=Math.floor(f.tx.blockTime/60)*60;f.advance(70000);
  const request=async(m,p)=>{
   if(m==='getSlot')return 50000;if(m==='getBlocks')return [1];if(m==='getFirstAvailableBlock')return 1;
   if(m==='getBlockTime')return p[0]===50000?time/1000-5:time/1000-172800;
   if(m==='getSignaturesForAddress')return [f.row.wallet,f.row.position].includes(p[0])?[{signature:f.identity.signature,slot:300,blockTime:f.tx.blockTime,err:null,confirmationStatus:'finalized'}]:[];
   if(m==='getMultipleAccounts'&&p[0][0]===f.row.position){
    const native=await f.options.request(m,[[f.row.wallet,f.row.position],p[1]]);return {context:{slot:50000},value:[native.value[1]]};
   }
   const result=await f.options.request(m,p);if(m==='getMultipleAccounts'&&p[0].length===8)result.context.slot=50000;return result;
  };
  const opts={request,now:()=>time,monotonicNow:()=>0},fetchImpl=async()=>Response.json([[minute,100,100,100,100,20]]);
  const readFinalizedAccount=createServerPerpsDailyAccountReader({...opts,journal:f.journal,readNetworkFees:createPerpsNetworkFeeValuationReader({...opts,fetchImpl})});
  const proof=await readFinalizedPerpsCloseCompletion(f.journal,f.row.id,{...opts,readFinalizedAccount});
  assert.equal(proof.conversionSignature,null);assert.equal(proof.receivedUsdcUnits,options.side==='SHORT'?'7000000':'0');
  f.journal.reconcilePositionCloseCompletion(f.row.id,proof);assert.equal(f.journal.readPositionCloseConversion(f.row.id),null);
  assert.equal(f.journal.read('parent').state,'CLOSED');assert.equal(f.journal.readPositionCloseCompletionSnapshot(f.row.id).close.state,'COMPLETED');
 }
});

test('bounded maintenance recovers only the recorded conversion and completes accounting without preparing or submitting a transaction',async t=>{
 const f=await completionFixture(t,{}, {finalizeConversion:false}),result=await reconcileRecordedPerpsCloses(f.journal,f.row.wallet,f.completionOptions);
 assert.equal(result.checked,1);assert.equal(result.completed,1);assert.equal(result.unresolved,0);
 assert.equal(f.journal.readPositionClose(f.row.id).state,'COMPLETED');assert.equal(f.journal.read('parent').state,'CLOSED');
 assert.equal(f.journal.readPositionCloseConversion(f.row.id).signature,f.receipt.identity.signature);
 const repeated=await reconcileRecordedPerpsCloses(f.journal,f.row.wallet,f.completionOptions);assert.equal(repeated.checked,0);
 assert(f.calls.every(c=>!['sendTransaction','simulateTransaction','getLatestBlockhash'].includes(c.m)));
});

test('paused maintenance completes the actual executor-to-worker accounting path without keys, activation, signals, builders or submission',async t=>{
 for(const liveSibling of [false,true]){
  const f=await completionFixture(t,{withExits:liveSibling},{finalizeConversion:liveSibling}),walletAddress=f.row.wallet,ownerAccountHash='a'.repeat(64),reports=[];let forbiddenCalls=0;
  const forbidden=()=>{forbiddenCalls++;throw Error('NO_FINANCIAL_ACTION_IN_MAINTENANCE');};
  const controls={read:()=>({enabled:false,paused:true}),pauseForRisk:forbidden,listForWorker:({afterWallet})=>afterWallet?[]:[{walletAddress,ownerAccountHash}]};
  const base=f.completionOptions.request,request=async(m,p)=>{
   const v=await base(m,p);if(liveSibling&&m==='getMultipleAccounts'&&p[0][0]===f.row.position)v.value[1]={owner:'11111111111111111111111111111111',executable:false,lamports:1,data:['','base64']};return v;
  };
  const executor=createServerPerpsExecutor({mode:'execute',controls,journal:f.journal,
   vault:{describe:()=>({exclusive:true,purpose:'jamddmaj-perps-automation',walletAddress,ownerAccountHash}),signPrepared:forbidden},
   readAccount:forbidden,readFinalizedAccount:f.completionOptions.readFinalizedAccount,rpcRequest:request,readFeed:forbidden,builderRequest:forbidden,fetchImpl:forbidden,
   now:f.opts.now,monotonicNow:f.opts.monotonicNow});
  const worker=createServerPerpsWorker({mode:'maintenance',controls,executor,now:f.opts.now,saveStatus:v=>reports.push(v)});
  await worker.run({once:true});assert.equal(forbiddenCalls,0);assert.equal(reports.length,1);
  assert.equal(reports[0].results[liveSibling?'CLOSE_RECONCILIATION_REQUIRED':'RECONCILIATION_ONLY'],1);
  assert.equal(f.journal.read('parent').state,liveSibling?'OPEN':'CLOSED');
 }
});
