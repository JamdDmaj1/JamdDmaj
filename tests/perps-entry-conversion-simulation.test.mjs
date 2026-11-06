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
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsBackupRegistry,PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL,PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL} from '../lib/perps-backup-registry.js';
import {deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {authorizeBotEntryConversionCustody,consumeBotSwapCustody} from '../lib/perps-bot-swap-signing.js';
import {createPerpsCustodyMasterKey,openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
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

for(const asset of ['BTC','ETH','SOL'])for(const mode of ['success','limits','backup','hold','controls','account'])test('reserved bot entry conversion one-use custody: '+asset+' '+mode,async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-entry-custody-'));chmodSync(root,0o700);
 const ownerAccountHash='f'.repeat(64),directory=join(root,'wallets'),keyDirectory=join(root,'keys'),keyFile=join(keyDirectory,'master.key');
 for(const path of [directory,keyDirectory])mkdirSync(path,{mode:0o700});
 const vaultOptions={allowNonPosixForTests:process.platform==='win32',now:()=>Date.parse('2026-10-20T20:00:00Z')};
 createPerpsCustodyMasterKey(keyFile,vaultOptions);const vault=openPerpsCustodyVault({directory,keyFile,...vaultOptions});
 const {walletAddress}=vault.createOrReadExclusiveWallet({ownerAccountHash,explicitCustodyApproval:true});
 const f=await fixture(asset,false,walletAddress),who={ownerAccountHash,walletAddress};
 const common={allowNonPosixForTests:process.platform==='win32',now:f.options.now,monotonicNow:()=>0};
 const controls=openPerpsAutomationControls(join(root,'controls.sqlite'),common),executionJournal=openPerpsExecutionJournal(join(root,'risk.sqlite'),common);
 const journal=openBotSwapJournal(join(root,'swaps.sqlite'),{...common,initialize:true,explicitOperatorApproval:true});
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
