import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import bs58 from 'bs58';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {verifyOwnerSignedPerpsCloseIntent,validateStoredPerpsCloseExecution} from '../lib/perps-close-execution-record.js';
import {readFinalizedPerpsClosePayout} from '../lib/perps-close-payout-receipt.js';
import {closePayoutFixture} from './helpers/perps-close-payout-fixture.mjs';
import {conversionFixture} from './helpers/perps-conversion-fixture.mjs';
import {readJournaledPerpsCloseConversion} from '../lib/perps-journal-close-conversion.js';
async function fixture(t,options={}){
 const f=await closePayoutFixture(options),root=mkdtempSync(join(tmpdir(),'jamd-close-exec-')),path=join(root,'journal.sqlite'),opened=[];let time=f.options.now();
 const open=()=>{const j=openPerpsExecutionJournal(path,{now:()=>time});opened.push(j);return j;},journal=open();
 t.after(()=>{for(const j of opened)try{j.close();}catch{}rmSync(root,{recursive:true,force:true});});
 const parent={reservation:'parent',signature:bs58.encode(Buffer.alloc(64,17)),wire_hash:'a'.repeat(64),confirmed_slot:50,entry_exit_plan:JSON.stringify({sizeUsdUnits:'30000000',exits:[]})};
 f.row.entries=JSON.stringify([parent]);const raw=new DatabaseSync(path);
 raw.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated,signature,wire_hash,confirmed_slot,position_address,entry_exit_plan) VALUES(?,?,?,?,?,'OPEN',?,?,?,?,?,?,?)")
  .run(f.row.wallet,'signal-parent','parent',new Date(time).toISOString().slice(0,10),10000000,time-10000,time-10000,parent.signature,parent.wire_hash,parent.confirmed_slot,f.row.position,parent.entry_exit_plan);
 raw.prepare('INSERT INTO perps_position_closes(id,wallet,position,state,created,updated,observed_slot,fee_lamports,unsigned_wire_hash,entries,settlement) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(f.row.id,f.row.wallet,f.row.position,'PREPARED',f.row.created,f.row.created,f.row.observed_slot,f.row.fee_lamports,f.row.unsigned_wire_hash,f.row.entries,f.row.settlement);raw.close();
 const ownerSigned=Buffer.from(f.tx.transaction[0],'base64');ownerSigned.fill(0,65,129);
 const intent=()=>verifyOwnerSignedPerpsCloseIntent(journal.readPositionClose(f.row.id),ownerSigned.toString('base64'));
 const uncertain=()=>{journal.beginPositionCloseSigning(f.row.id);return journal.recordPositionCloseBroadcast(f.row.id,intent());};
 return {...f,journal,path,open,ownerSigned,intent,uncertain,advance(ms){time+=ms;}};
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
 const swap=options.side==='SHORT'||options.amount===0n?null:await conversionFixture({asset:options.asset??'SOL',walletAddress:f.row.wallet,amountUnits:payout.receivedTokenUnits,nativeSolInput:payout.delivery==='NATIVE_SOL'});
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
