import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateKey,createPublicKey,createHash,createCipheriv,sign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import bs58 from 'bs58';
import {PERPS_PLATFORM_FEE,quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
import {openPerpsPlatformFeeJournal} from '../lib/perps-platform-fee-journal.js';
import {planPerpsPlatformFeeTransfer} from '../lib/perps-platform-fee-transfer.js';
import {preparePerpsPlatformFeePayment} from '../lib/perps-platform-fee-payment.js';
import {openPerpsPlatformFeePaymentJournal} from '../lib/perps-platform-fee-payment-journal.js';
import {collectReviewedPerpsPlatformFee,reconcilePerpsPlatformFeePayment} from '../lib/perps-platform-fee-collection.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {readPerpsBroadcastReceipt} from '../lib/perps-broadcast-receipt.js';
import {readServerPerpsTradeTransaction} from '../lib/perps-server-trade-transaction.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {authorizePerpsPlatformFeeCustody} from '../lib/perps-platform-fee-signing.js';
import {openPerpsCustodyVault} from '../lib/perps-custody-vault.js';
import {openPerpsBackupRegistry,PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL} from '../lib/perps-backup-registry.js';
import {createPerpsAutomationFees} from '../lib/perps-automation-fees.js';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {initializePerpsOperatorRecovery,createPerpsCustodyRecoveryArchive,restorePerpsCustodyRecoveryArchive} from '../lib/perps-custody-recovery.js';
import {readJournalledPerpsPlatformFee} from '../lib/perps-platform-fee-history.js';
import {readServerPerpsDailyAccount,requireFreshServerPerpsDailyAccount} from '../lib/perps-server-daily-account.js';
import {createPerpsPlatformFeeRpc} from '../lib/perps-platform-fee-rpc.js';
import layout from '../lib/perps-event-layout.json' with {type:'json'};
const time=Date.parse('2026-10-25T12:00:00Z'),genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
test('20 bps are exact USDC margin units, never leveraged size; no close fee or claimed sponsorship',()=>{
 for(const [margin,fee] of [['10000000','20000'],['40000000','80000'],['100000000','200000'],['1000000000','2000000'],['10000499','20000']]){
  const q=quotePerpsPlatformFee(margin);assert.equal(q.feeUnits,fee);
  assert.equal(q.totalMarginAndPlatformFeeUnits,String(BigInt(margin)+BigInt(fee)));assert.ok(Object.isFrozen(q));
  assert.equal(q.closeFeeUnits,'0');assert.equal(q.networkSponsorshipAvailable,false);assert.equal(q.readyForSigning,false);
  assert.equal(q.networkFeePayer,'TRADER');assert.equal(q.networkFeeToken,'SOL');assert.equal(q.requiresTraderSol,true);
 }
 for(const bad of [10,'10','0','-1','1.5','010000000','1e7','1000000000000000',null])assert.throws(()=>quotePerpsPlatformFee(bad));
 assert.equal(bs58.decode(PERPS_PLATFORM_FEE.recipient).length,32);
});
async function fixture(t,{platformFeeUnits='0'}={}){
 const dir=mkdtempSync(join(tmpdir(),'jamd-platform-fee-')),journals=[];
 t.after(()=>{for(const j of journals)j.close();rmSync(dir,{recursive:true,force:true});});
 const keys=[81,82,83].map(n=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,n)]),format:'der',type:'pkcs8'}));
 const addresses=keys.map(k=>bs58.encode(createPublicKey(k).export({format:'der',type:'spki'}).subarray(-32)));
 const wallet=addresses[0],ids=await deriveServerPerpsIdentities({walletAddress:wallet,asset:'SOL',side:'LONG'});
 const schema=layout.events.find(e=>e.name==='InstantIncreasePositionEvent'),fields={};
 for(const [name,type]of schema.fields)fields[name]=typeof type==='object'?null:type==='publicKey'?wallet:type==='bool'?false:type==='u8'?0:'0';
 Object.assign(fields,{owner:wallet,pool:PERPS_POOL,positionKey:ids.position,positionSide:1,positionMint:PERPS_CUSTODIES.SOL.mint,positionCustody:PERPS_CUSTODIES.SOL.address,positionCollateralCustody:PERPS_CUSTODIES.SOL.address,sizeUsdDelta:'120000000'});
 if('positionCollateralMint' in fields)fields.positionCollateralMint=PERPS_CUSTODIES.SOL.mint;
 const encode=(type,value)=>{if(typeof type==='object')return Buffer.from([0]);if(type==='publicKey')return Buffer.from(bs58.decode(value));if(type==='bool'||type==='u8')return Buffer.from([Number(value)]);const b=Buffer.alloc(8);if(type==='i64')b.writeBigInt64LE(BigInt(value));else b.writeBigUInt64LE(BigInt(value));return b;};
 const event=Buffer.concat([createHash('sha256').update('event:'+schema.name).digest().subarray(0,8),...schema.fields.map(([name,type])=>encode(type,fields[name]))]);
 const all=[...addresses,PERPS_PROGRAM,ids.eventAuthority];
 const message=Buffer.concat([Buffer.from([3,1,2,all.length]),...all.map(a=>Buffer.from(bs58.decode(a))),Buffer.alloc(32,9),Buffer.from([1,3,1,0,1,42])]);
 const signatures=keys.map(k=>sign(null,message,k)),wire=Buffer.concat([Buffer.from([3]),...signatures,message]),partial=Buffer.from(wire);partial.fill(0,65,129);
 const signature=bs58.encode(signatures[0]),wireHash=createHash('sha256').update(partial).digest('hex');
 const tx={slot:400,blockTime:time/1000+1,transaction:[wire.toString('base64'),'base64'],meta:{err:null,fee:5000,loadedAddresses:{writable:[],readonly:[]},innerInstructions:[{index:0,instructions:[{programIdIndex:3,accounts:[4],data:bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),event])),stackHeight:2}]}]}};
 const rpc=async method=>{if(method==='getGenesisHash')return genesis;if(method==='getTransaction')return tx;if(method==='getSignatureStatuses')return {context:{slot:400},value:[{slot:400,err:tx.meta.err,confirmationStatus:'finalized'}]};throw Error('UNEXPECTED_RPC');};
 let clock=time;const now=()=>clock,entry=openPerpsExecutionJournal(join(dir,'entries.sqlite'),{now});journals.push(entry);
 const snapshot={walletAddress:wallet,network:'solana-mainnet',balancesComplete:true,observedAt:time,day:'2026-10-25',availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0};
 entry.reserve({walletAddress:wallet,reservationId:'entry',signalId:'signal',marginUsd:'40',positionAddress:ids.position,limits:{capitalUsd:'100',dailyLossUsd:'100',positions:1,dailyTrades:5},snapshot,platformFeeUnits});
 const open=(options={})=>{const j=openPerpsPlatformFeeJournal(join(dir,'fees.sqlite'),{entryJournal:entry,now,...options});journals.push(j);return j;};
 const consent={reservationId:'entry',walletAddress:wallet,termsVersion:PERPS_PLATFORM_FEE.version,explicitConsent:true};
 return {entry,open,consent,tx,rpc,now,dir,journals,signFee(review){const m=Buffer.from(review.messageBase64,'base64');return Buffer.concat([Buffer.from([1]),sign(null,m,keys[0]),m]).toString('base64');},advance(ms){clock+=ms;},async finalize(){entry.beginSigning('entry',snapshot);entry.recordBroadcastIntent('entry',{signature,wireHash});clock=time+2000;const r=await readPerpsBroadcastReceipt({walletAddress:wallet,signature,wireHash},rpc,{now,requireFinalized:true});entry.reconcileBroadcast('entry',r);return readServerPerpsTradeTransaction({walletAddress:wallet,signature,day:'2026-10-25'},{request:rpc,now});}};
}
test('finalized opening creates one durable assessment after prior consent, never a payment',async t=>{
 const f=await fixture(t),one=f.open();one.recordConsent(f.consent);const receipt=await f.finalize();
 const first=one.assessFinalizedOpen('entry',receipt);assert.equal(first.fee,'80000');assert.equal(first.state,'AWAITING_PAYMENT_REVIEW');
 const two=f.open();assert.deepEqual(two.assessFinalizedOpen('entry',receipt),first);assert.deepEqual(two.read('entry'),first);
 assert.equal(two.sign,undefined);assert.equal(two.markPaid,undefined);assert.equal(two.send,undefined);
});
test('absent consent, retroactive consent, forged proof and unaccepted terms cannot create charges',async t=>{
 const f=await fixture(t),j=f.open();
 for(const change of [{explicitConsent:false},{termsVersion:'other'},{walletAddress:PERPS_PLATFORM_FEE.recipient}])assert.throws(()=>j.recordConsent({...f.consent,...change}));
 const receipt=await f.finalize();assert.throws(()=>j.recordConsent(f.consent));assert.throws(()=>j.assessFinalizedOpen('entry',receipt));assert.equal(j.read('entry'),null);
});
test('cloned proof, changed events and changed margin facts cannot pass proof binding',async t=>{
 const f=await fixture(t),j=f.open();j.recordConsent(f.consent);const receipt=await f.finalize();
 assert.throws(()=>j.assessFinalizedOpen('entry',structuredClone(receipt)));assert.throws(()=>j.assessFinalizedOpen('missing',receipt));assert.equal(j.read('entry'),null);
});
test('stale chain evidence cannot generate a collectible assessment',async t=>{
 const f=await fixture(t),j=f.open();j.recordConsent(f.consent);const receipt=await f.finalize();f.advance(10001);
 assert.throws(()=>j.assessFinalizedOpen('entry',receipt));assert.equal(j.read('entry'),null);
});
test('failed opens never generate a fee, and recording terms is idempotent',async t=>{
 const f=await fixture(t),j=f.open();assert.deepEqual(j.recordConsent(f.consent),j.recordConsent(f.consent));
 f.tx.meta.err={InstructionError:[0,'Custom']};await assert.rejects(f.finalize());assert.equal(j.read('entry'),null);
});
test('separate transfer plan pins USDC, amount, recipient and owner; it cannot authorize payment',async t=>{
 const f=await fixture(t),j=f.open();j.recordConsent(f.consent);const receipt=await f.finalize();
 const assessment=j.assessFinalizedOpen('entry',receipt),plan=await planPerpsPlatformFeeTransfer(assessment);
 assert.equal(plan.recipient,PERPS_PLATFORM_FEE.recipient);assert.equal(plan.feeUnits,'80000');assert.equal(plan.mint,PERPS_PLATFORM_FEE.mint);
 const bytes=Buffer.from(plan.instruction.dataBase64,'base64');assert.equal(bytes.length,10);assert.equal(bytes[0],12);assert.equal(bytes.readBigUInt64LE(1),80000n);assert.equal(bytes[9],6);
 assert.equal(plan.instruction.accounts[3].address,f.consent.walletAddress);assert.equal(plan.readyForSigning,false);
 assert.equal(plan.requiresSimulation,true);assert.equal(plan.requiresDurablePaymentJournal,true);assert.equal(plan.requiresSeparateOwnerApproval,true);
 await assert.rejects(planPerpsPlatformFeeTransfer({...assessment,fee:'1'}));
 await assert.rejects(planPerpsPlatformFeeTransfer(structuredClone(assessment)));
});
async function paymentFixture(t,changes={}){
 const f=await fixture(t,{platformFeeUnits:changes.automation?'80000':'0'}),owner='a'.repeat(64),who={ownerAccountHash:owner,walletAddress:f.consent.walletAddress};
 let state={walletAddress:who.walletAddress,revision:'review',settings:{margin:40,capital:100,loss:100,positions:2,leverage:3,dailyTrades:5},enabled:false,paused:true};
 const controls={read:identity=>{if(identity.ownerAccountHash!==owner||identity.walletAddress!==who.walletAddress)throw Error('FOREIGN_OWNER');return state;}};
 const fees=f.open(changes.automation?{controls}:{});
 if(changes.automation){
  fees.recordAutomationConsent({...who,expectedRevision:'review',termsVersion:PERPS_PLATFORM_FEE.version,explicitFeeApproval:true});
  state={...state,revision:'active',enabled:true,paused:false};fees.recordAutomationEntryConsent({...who,controlRevision:'active',reservationId:'entry'});
 }else fees.recordConsent(f.consent);
 const opening=await f.finalize(),assessment=fees.assessFinalizedOpen('entry',opening);
 const plan=await planPerpsPlatformFeeTransfer(assessment),calls=[];let wire=null;
 const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',mint=PERPS_PLATFORM_FEE.mint;
 const account=(owner,data,lamports=2039280)=>({owner,executable:false,lamports,data:[data.toString('base64'),'base64']});
 const payer=after=>account('11111111111111111111111111111111',Buffer.alloc(0),10000000-(after?5000:0));
 const mintData=Buffer.alloc(82);mintData[44]=6;mintData[45]=1;
 const token=(owner,amount)=>{const b=Buffer.alloc(165);Buffer.from(bs58.decode(mint)).copy(b,0);Buffer.from(bs58.decode(owner)).copy(b,32);b.writeBigUInt64LE(BigInt(amount),64);b[108]=1;return account(TOKEN,b);};
 const source=after=>token(f.consent.walletAddress,5000000-(after?80000:0)),dest=after=>token(PERPS_PLATFORM_FEE.recipient,3000000+(after?80000:0));
 const request=async(method,params)=>{calls.push({method,params});
  if(method==='getGenesisHash')return changes.genesis??genesis;
  if(method==='getLatestBlockhash')return {context:{slot:500},value:{blockhash:bs58.encode(Buffer.alloc(32,8)),lastValidBlockHeight:1000}};
  if(method==='getMultipleAccounts'&&params[0].length===1)return {context:{slot:500},value:[changes.destinationMissing?null:dest(false)]};
  if(method==='getMultipleAccounts')return {context:{slot:500},value:[changes.noSol?account('11111111111111111111111111111111',Buffer.alloc(0),0):payer(false),account(TOKEN,mintData),changes.noFunds?token(f.consent.walletAddress,0):source(false),changes.destinationMissing?null:dest(false)]};
  if(method==='getFeeForMessage')return {context:{slot:500},value:5000};
  if(method==='getBlockHeight')return changes.expired?1001:600;
  if(method==='simulateTransaction')return {context:{slot:500},value:{err:changes.simulationError??null,accounts:[payer(true),source(true),changes.changedEffects?dest(false):dest(true)]}};
  if(method==='sendTransaction'){wire=params[0];if(changes.timeout)throw Error('TIMED_OUT');return bs58.encode(Buffer.from(wire,'base64').subarray(1,65));}
  if(method==='getSignatureStatuses')return {context:{slot:changes.paymentSlot??501},value:[changes.pending?null:{slot:changes.paymentSlot??501,confirmationStatus:'finalized',err:changes.failed?{InstructionError:[0,'Custom']}:null}]};
  if(method==='getTransaction'){
   if(wire===null)return null;const failed=!!changes.failed;
   const tokens=after=>[1,2].map(index=>({accountIndex:index,mint,owner:index===1?f.consent.walletAddress:PERPS_PLATFORM_FEE.recipient,
    uiTokenAmount:{decimals:6,amount:String(index===1?5000000-(after&&!failed?80000:0):3000000+(after&&!failed?80000:0))}}));
   const result={slot:changes.paymentSlot??501,blockTime:f.now()/1000,transaction:[wire,'base64'],meta:{err:failed?{InstructionError:[0,'Custom']}:null,fee:5000,
    preBalances:[10000000,2039280,2039280,1461600,1,1],postBalances:[9995000,2039280,2039280,1461600,1,1],preTokenBalances:tokens(false),postTokenBalances:tokens(true)}};
   if(changes.tamperReceipt)changes.tamperReceipt(result);return result;
  }
  throw Error('UNEXPECTED_RPC_'+method);
 };
 const openPayments=()=>{const j=openPerpsPlatformFeePaymentJournal(join(f.dir,'payments.sqlite'),{now:f.now});f.journals.push(j);return j;};
 return {...f,assessment,plan,calls,request,changes,openPayments,fees,who,controls,changeControls:patch=>{state={...state,...patch};}};
}
test('full isolated fee payment review, signature, one send and finalized receipt survive restart',async t=>{
 const f=await paymentFixture(t),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 assert.equal(review.feeUnits,'80000');assert.equal(review.networkFeeLamports,'5000');assert.equal(review.readyForSigning,false);
 assert.ok(Buffer.from(review.messageBase64,'base64').includes(Buffer.from('jamddmaj-fee:'+f.assessment.id)));
 const result=await collectReviewedPerpsPlatformFee(review,{journal,request:f.request,signReviewed:r=>f.signFee(r),explicitApproval:true});
 assert.equal(result.stage,'PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED');assert.equal(result.paid,false);assert.equal(journal.read(review.assessmentId).state,'UNKNOWN');
 const reopened=f.openPayments(),settled=await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:reopened,request:f.request,now:f.now});
 assert.equal(settled.state,'PAID');assert.equal(settled.paid,true);assert.equal(f.calls.filter(c=>c.method==='sendTransaction').length,1);
 await assert.rejects(collectReviewedPerpsPlatformFee(review,{journal:reopened,request:f.request,signReviewed:r=>f.signFee(r),explicitApproval:true}));
 assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:reopened,request:f.request,now:f.now})).paid,true);
});
test('fee preparation rejects absent funds, network mismatch and incorrect simulated payout',async t=>{
 for(const patch of [{noFunds:true},{noSol:true},{genesis:'wrong'},{changedEffects:true},{simulationError:{InstructionError:[0,'Custom']}}]){
  const f=await paymentFixture(t,patch);await assert.rejects(preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now}));
  assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
 }
});
test('fee timeout never becomes paid or a second dispatch, even after reopening its database',async t=>{
 const f=await paymentFixture(t,{timeout:true,pending:true}),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 const r=await collectReviewedPerpsPlatformFee(review,{journal,request:f.request,signReviewed:v=>f.signFee(v),explicitApproval:true});assert.equal(r.stage,'PLATFORM_FEE_SUBMISSION_UNKNOWN');
 const two=f.openPayments();assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:two,request:f.request,now:f.now})).state,'UNKNOWN');
 await assert.rejects(collectReviewedPerpsPlatformFee(review,{journal:two,request:f.request,signReviewed:v=>f.signFee(v),explicitApproval:true}));
 assert.equal(f.calls.filter(c=>c.method==='sendTransaction').length,1);
 f.changes.pending=false;assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:two,request:f.request,now:f.now})).state,'PAID');
});
test('expired blockhash, declined prompt and altered owner signature cannot send money',async t=>{
 for(const mode of ['expired','declined','altered']){
  const f=await paymentFixture(t),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});if(mode==='expired')f.changes.expired=true;
  await collectReviewedPerpsPlatformFee(review,{journal,request:f.request,explicitApproval:true,signReviewed:r=>{if(mode==='declined')throw Error('DECLINED');const wire=f.signFee(r);if(mode==='altered'){const bytes=Buffer.from(wire,'base64');bytes[20]^=1;return bytes.toString('base64');}return wire;}});
  assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);assert.equal(journal.read(review.assessmentId).state,mode==='expired'?'UNKNOWN':'SIGNING');
 }
});
test('no explicit owner approval means no signing prompt or journal entry',async t=>{
 const f=await paymentFixture(t),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 await assert.rejects(collectReviewedPerpsPlatformFee(review,{journal,request:f.request,explicitApproval:false,signReviewed:()=>assert.fail('must not prompt')}));assert.equal(journal.read(review.assessmentId),null);
});
test('finalized failed payment keeps its fee unpaid; tampered receipt effects cannot settle',async t=>{
 for(const change of [{failed:true},{tamperReceipt:tx=>{tx.meta.postTokenBalances[1].uiTokenAmount.amount='3000000';}}]){
  const f=await paymentFixture(t,change),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
  await collectReviewedPerpsPlatformFee(review,{journal,request:f.request,explicitApproval:true,signReviewed:r=>f.signFee(r)});
  if(change.failed){assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal,request:f.request,now:f.now})).state,'FAILED');}
  else {await assert.rejects(reconcilePerpsPlatformFeePayment(review.assessmentId,{journal,request:f.request,now:f.now}));assert.equal(journal.read(review.assessmentId).state,'UNKNOWN');}
 }
});
test('independent payment journals cannot prompt or dispatch the same fee twice',async t=>{
 const f=await paymentFixture(t),one=f.openPayments(),two=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});let prompts=0;
 const results=await Promise.allSettled([one,two].map(journal=>collectReviewedPerpsPlatformFee(review,{journal,request:f.request,explicitApproval:true,signReviewed:async r=>{prompts++;await new Promise(resolve=>setTimeout(resolve,10));return f.signFee(r);}})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(prompts,1);assert.equal(f.calls.filter(c=>c.method==='sendTransaction').length,1);
});
test('late owner signature is durably retained but cannot be sent after review expiry',async t=>{
 const f=await paymentFixture(t),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 await collectReviewedPerpsPlatformFee(review,{journal,request:f.request,explicitApproval:true,signReviewed:r=>{f.advance(60001);return f.signFee(r);}});
 const row=journal.read(review.assessmentId);assert.equal(row.state,'UNKNOWN');assert.ok(row.signature);assert.equal(row.dispatch_attempted,0);assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});
test('a modified message, even freshly signed by the owner, cannot replace the reviewed fee',async t=>{
 const f=await paymentFixture(t),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 await collectReviewedPerpsPlatformFee(review,{journal,request:f.request,explicitApproval:true,signReviewed:r=>{const m=Buffer.from(r.messageBase64,'base64');m[m.length-2]^=1;return f.signFee({...r,messageBase64:m.toString('base64')});}});
 assert.equal(journal.read(review.assessmentId).state,'SIGNING');assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});
test('foreign mint, recipient, SOL effects, network fee or serialized receipt never settles as paid',async t=>{
 for(const tamperReceipt of [tx=>{tx.meta.postTokenBalances[1].owner=bs58.encode(Buffer.alloc(32,3));},
  tx=>{tx.meta.preTokenBalances[0].mint=bs58.encode(Buffer.alloc(32,4));},tx=>{tx.meta.postBalances[1]-=1;},tx=>{tx.meta.fee=5001;},
  tx=>{tx.transaction[0]=tx.transaction[0].slice(0,-4)+'AAAA';}]){
  const f=await paymentFixture(t,{tamperReceipt}),journal=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
  await collectReviewedPerpsPlatformFee(review,{journal,request:f.request,explicitApproval:true,signReviewed:r=>f.signFee(r)});
  await assert.rejects(reconcilePerpsPlatformFeePayment(review.assessmentId,{journal,request:f.request,now:f.now}));assert.equal(journal.read(review.assessmentId).state,'UNKNOWN');
 }
});
test('automation fees require prior owner-bound consent under the exact reviewed settings',async t=>{
 const f=await fixture(t,{platformFeeUnits:'80000'}),owner='a'.repeat(64);
 let state={walletAddress:f.consent.walletAddress,revision:'paused-review',settings:{margin:40,capital:100,loss:100,leverage:3,positions:1,dailyTrades:5},enabled:false,paused:true};
 const controls={read:who=>{if(who.ownerAccountHash!==owner||who.walletAddress!==state.walletAddress)throw Error('NOT_OWNED');return state;}};
 const j=f.open({controls}),who={ownerAccountHash:owner,walletAddress:state.walletAddress};
 assert.equal(j.automationDisclosure(state).feeUnits,'80000');
 assert.throws(()=>j.recordAutomationEntryConsent({...who,controlRevision:state.revision,reservationId:'entry'}));
 const consent={...who,expectedRevision:state.revision,termsVersion:PERPS_PLATFORM_FEE.version,explicitFeeApproval:true};
 for(const patch of [{explicitFeeApproval:false},{termsVersion:'old'},{expectedRevision:'stale'},{ownerAccountHash:'b'.repeat(64)}])assert.throws(()=>j.recordAutomationConsent({...consent,...patch}));
 j.recordAutomationConsent(consent);state={...state,revision:'active-revision',enabled:true,paused:false};
 const saved=j.recordAutomationEntryConsent({...who,controlRevision:state.revision,reservationId:'entry'});assert.equal(saved.margin,'40000000');
 const receipt=await f.finalize();assert.equal(j.assessFinalizedOpen('entry',receipt).fee,'80000');
});
test('a missing operator USDC token account blocks collection with a specific setup error, never customer-funded creation',async t=>{
 const f=await paymentFixture(t,{destinationMissing:true});
 await assert.rejects(preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now}),/PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING/);
 assert.equal(f.calls.some(c=>['sendTransaction','simulateTransaction'].includes(c.method)),false);
});
test('changing settings or pausing invalidates automation fee authorization before signing',async t=>{
 for(const change of [{settings:{margin:41,capital:100,loss:100}},{enabled:false,paused:true},{revision:'different'}]){
  const f=await fixture(t),owner='a'.repeat(64);let state={walletAddress:f.consent.walletAddress,revision:'review',settings:{margin:40,capital:100,loss:100},enabled:false,paused:true};
  const j=f.open({controls:{read:()=>state}}),who={ownerAccountHash:owner,walletAddress:state.walletAddress};
  j.recordAutomationConsent({...who,expectedRevision:'review',termsVersion:PERPS_PLATFORM_FEE.version,explicitFeeApproval:true});
  state={...state,revision:'active',enabled:true,paused:false,...change};
  assert.throws(()=>j.recordAutomationEntryConsent({...who,controlRevision:'active',reservationId:'entry'}));
 }
});

test('shared risk journal holds fee signing across independent connections and refuses cloned reviews',async t=>{
 const f=await paymentFixture(t),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 const other=openPerpsExecutionJournal(join(f.dir,'entries.sqlite'),{now:f.now});f.journals.push(other);
 assert.throws(()=>f.entry.claimPlatformFeePayment(structuredClone(review)));
 f.entry.claimPlatformFeePayment(review);
 assert.equal(other.pendingPlatformFeePayments(review.walletAddress).length,1);
 assert.throws(()=>other.claimPlatformFeePayment(review));
 assert.equal(other.revalidatePlatformFeeLock(review).review_hash,review.messageHash);
 const reserve=()=>other.reserve({walletAddress:review.walletAddress,reservationId:'another-entry',signalId:'another-signal',marginUsd:10,
  limits:{capitalUsd:100,dailyLossUsd:100,positions:2,dailyTrades:5},snapshot:{walletAddress:review.walletAddress,network:'solana-mainnet',balancesComplete:true,
   observedAt:f.now(),day:'2026-10-25',availableUsdcUnits:'100000000',allocatedUsdcUnits:'40000000',lossTodayUsdcUnits:'0',openPositions:1,tradesToday:1}});
 assert.throws(reserve,/PLATFORM_FEE_RECONCILIATION_REQUIRED/);
 assert.throws(()=>other.settlePlatformFeePayment(review.assessmentId,{assessmentId:review.assessmentId,state:'PAID'}));
});

test('fee timeout retains the shared wallet lock until an exact finalized receipt releases it',async t=>{
 const f=await paymentFixture(t,{timeout:true,pending:true}),payments=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 const result=await collectReviewedPerpsPlatformFee(review,{journal:payments,riskJournal:f.entry,request:f.request,explicitApproval:true,signReviewed:r=>f.signFee(r)});
 assert.equal(result.stage,'PLATFORM_FEE_SUBMISSION_UNKNOWN');assert.equal(f.entry.pendingPlatformFeePayments(review.walletAddress).length,1);
 assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:payments,riskJournal:f.entry,request:f.request,now:f.now})).state,'UNKNOWN');
 assert.equal(f.entry.pendingPlatformFeePayments(review.walletAddress).length,1);
 f.changes.pending=false;
 assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:payments,riskJournal:f.entry,request:f.request,now:f.now})).state,'PAID');
 assert.equal(f.entry.pendingPlatformFeePayments(review.walletAddress).length,0);
 assert.equal(f.entry.readPlatformFeeLock(review.assessmentId).state,'PAID');
 assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:payments,riskJournal:f.entry,request:f.request,now:f.now})).state,'PAID');
 assert.equal(f.calls.filter(c=>c.method==='sendTransaction').length,1);
});

function custodyFixture(t,f){
 // Synthetic, unfunded test keys only. No production paths or network.
 const directory=join(f.dir,'wallets'),keys=join(f.dir,'keys'),keyFile=join(keys,'master.key');
 mkdirSync(directory,{mode:0o700});mkdirSync(keys,{mode:0o700});const master=Buffer.alloc(32,99),iv=Buffer.alloc(12,4);
 writeFileSync(keyFile,master,{mode:0o600});
 const binding={version:1,purpose:'jamddmaj-perps-automation',...f.who},cipher=createCipheriv('aes-256-gcm',master,iv);
 cipher.setAAD(Buffer.from(JSON.stringify(binding)));const ciphertext=Buffer.concat([cipher.update(Buffer.alloc(32,81)),cipher.final()]);
 writeFileSync(join(directory,f.who.walletAddress+'.json'),JSON.stringify({...binding,iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')}),{mode:0o600});
 const registryPath=join(f.dir,'backup.sqlite'),registry=openPerpsBackupRegistry(registryPath,{now:f.now,allowNonPosixForTests:process.platform==='win32'});f.journals.push(registry);
 const db=new DatabaseSync(registryPath);try{
  db.prepare('INSERT INTO perps_backup_challenges(archive,token_hash,created,expires,bindings,status) VALUES(?,?,?,?,?,?)')
   .run('b'.repeat(64),'c'.repeat(64),f.now(),f.now()+86400000,JSON.stringify([f.who]),'ACCEPTED');
  db.prepare('INSERT INTO perps_verified_backups VALUES(?,?,?,?,?)').run(f.who.ownerAccountHash,f.who.walletAddress,'b'.repeat(64),'11111111-1111-1111-1111-111111111111',f.now());
  db.exec(PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL);db.prepare('INSERT INTO perps_backup_fee_scope VALUES(?,1)').run('b'.repeat(64));
 }finally{db.close();}
 const vault=openPerpsCustodyVault({directory,keyFile,allowNonPosixForTests:process.platform==='win32'});
 return {vault,registry,registryPath,directory,keyFile};
}

test('bot custody signs only an exact claimed fee with live mandate, shared lock and verified backup',async t=>{
 const f=await paymentFixture(t,{automation:true}),{vault,registry}=custodyFixture(t,f),payments=f.openPayments();
 const review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});let used;
 const result=await collectReviewedPerpsPlatformFee(review,{journal:payments,riskJournal:f.entry,request:f.request,explicitApproval:true,
  signReviewed:(r,claim)=>{used=authorizePerpsPlatformFeeCustody(r,claim,{...f.who,feeJournal:f.fees,paymentJournal:payments,riskJournal:f.entry,backupRegistry:registry,isExecutionRunning:()=>true});return vault.signPlatformFee(used);}});
 assert.equal(result.stage,'PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED');assert.throws(()=>vault.signPlatformFee(used));assert.throws(()=>vault.signPlatformFee({...used}));
 assert.equal((await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:payments,riskJournal:f.entry,request:f.request,now:f.now})).state,'PAID');
 assert.equal(f.calls.filter(c=>c.method==='sendTransaction').length,1);
});

test('pausing after fee authorization prevents custody signing and leaves the shared reservation held',async t=>{
 const f=await paymentFixture(t,{automation:true}),{vault,registry}=custodyFixture(t,f),payments=f.openPayments();
 const review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});f.entry.claimPlatformFeePayment(review);
 const claim=payments.beginSigning(review,{explicitApproval:true});
 const grant=authorizePerpsPlatformFeeCustody(review,claim,{...f.who,feeJournal:f.fees,paymentJournal:payments,riskJournal:f.entry,backupRegistry:registry,isExecutionRunning:()=>true});
 f.changeControls({enabled:false,paused:true,revision:'paused'});assert.throws(()=>vault.signPlatformFee(grant));
 assert.equal(f.entry.pendingPlatformFeePayments(review.walletAddress).length,1);assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});

test('automated commission pipeline assesses the finalized opening then signs once and reconciles',async t=>{
 const f=await paymentFixture(t,{automation:true}),{vault,registry}=custodyFixture(t,f),payments=f.openPayments();
 const db=new DatabaseSync(join(f.dir,'fees.sqlite'));try{db.exec('DELETE FROM perps_platform_fee_assessments');}finally{db.close();}
 const entry=f.entry.read('entry'),request=(method,params)=>method==='getTransaction'&&params[0]===entry.signature?f.rpc(method,params):f.request(method,params);
 const service=createPerpsAutomationFees({feeJournal:f.fees,paymentJournal:payments,riskJournal:f.entry,controls:f.controls,vault,backupRegistry:registry,request,isExecutionRunning:()=>true,now:f.now});
 const ready=await service.reconcileWallet(f.who);assert.equal(ready.due,true);assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
 const first=await service.reconcileWallet(f.who,{allowCollection:true});assert.equal(first.stage,'PLATFORM_FEE_SUBMISSION_ACKNOWLEDGED');
 assert.equal(service.status(f.who).paidUnits,'0');assert.equal(service.status(f.who).dueUnits,'80000');assert.equal(service.status(f.who).pendingCount,1);
 assert.equal(f.entry.riskState(f.who.walletAddress).activeMarginUsdcUnits,'40080000');
 assert.equal((await service.reconcileWallet(f.who,{allowCollection:true})).stage,'PLATFORM_FEES_RECONCILED');
 assert.equal((await service.reconcileWallet(f.who,{allowCollection:true})).stage,'PLATFORM_FEES_RECONCILED');
 assert.equal(f.calls.filter(c=>c.method==='sendTransaction').length,1);assert.equal(f.entry.readPlatformFeeLock(f.assessment.id).state,'PAID');
 assert.equal(service.status(f.who).paidUnits,'80000');assert.equal(service.status(f.who).dueUnits,'0');
 assert.equal(f.entry.riskState(f.who.walletAddress).activeMarginUsdcUnits,'40000000');
});

test('margin reserves include the exact commission and cannot consume an unreserved customer balance',async t=>{
 const f=await fixture(t,{platformFeeUnits:'80000'});
 assert.equal(f.entry.riskState(f.consent.walletAddress).pendingMarginUsdcUnits,'40080000');f.entry.cancelUnsigned('entry');
 const base={walletAddress:f.consent.walletAddress,reservationId:'sized',signalId:'sized',marginUsd:40,platformFeeUnits:'80000',
  limits:{capitalUsd:100,dailyLossUsd:100,positions:2,dailyTrades:5},snapshot:{walletAddress:f.consent.walletAddress,network:'solana-mainnet',balancesComplete:true,
   observedAt:f.now(),day:'2026-10-25',availableUsdcUnits:'40000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0}};
 assert.throws(()=>f.entry.reserve(base),/INSUFFICIENT_UNRESERVED_BALANCE/);
 assert.throws(()=>f.entry.reserve({...base,platformFeeUnits:'1'}),/INVALID_PLATFORM_FEE/);
 assert.throws(()=>f.entry.reserve({...base,snapshot:{...base.snapshot,availableUsdcUnits:'100000000'},limits:{...base.limits,capitalUsd:40,dailyLossUsd:40}}),/CAPITAL_LIMIT/);
});

test('commission expense is exact verified USDC and does not turn the payment into a second trade',async t=>{
 const f=await paymentFixture(t),payments=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 const result=await collectReviewedPerpsPlatformFee(review,{journal:payments,riskJournal:f.entry,request:f.request,explicitApproval:true,signReviewed:r=>f.signFee(r)});
 const baseRequest=async(method,params)=>{
  const value=await f.request(method,params);if(method==='getTransaction'&&value)value.meta.innerInstructions=[];return value;
 };
 const tx=await readServerPerpsTradeTransaction({walletAddress:review.walletAddress,signature:result.signature,day:'2026-10-25'},{request:baseRequest,now:f.now,requireTradeEvent:false});
 const fee=await readJournalledPerpsPlatformFee(tx,{paymentJournal:payments,request:f.request,now:f.now});
 assert.equal(fee.platformFeeUsdcUnits,'80000');assert.equal(tx.events.length,0);assert.equal(tx.walletFeeLamports,'5000');
 assert.equal(await readJournalledPerpsPlatformFee(tx,{paymentJournal:null,request:f.request,now:f.now}),null);
 await assert.rejects(readJournalledPerpsPlatformFee({...tx},{paymentJournal:payments,request:f.request,now:f.now}));
});

test('full encrypted backup retains fee consent, assessment, uncertain signature and shared lock; omission is rejected',async t=>{
 const f=await paymentFixture(t,{automation:true,timeout:true,pending:true}),custody=custodyFixture(t,f),payments=f.openPayments();
 const review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 await collectReviewedPerpsPlatformFee(review,{journal:payments,riskJournal:f.entry,request:f.request,explicitApproval:true,signReviewed:r=>f.signFee(r)});
 const common={now:f.now,allowNonPosixForTests:process.platform==='win32'},controlsPath=join(f.dir,'controls.sqlite'),journalPath=join(f.dir,'entries.sqlite');
 const controls=openPerpsAutomationControls(controlsPath,common);f.journals.push(controls);controls.provision({...f.who,settings:{capital:100,loss:100,positions:2,margin:40,leverage:3,dailyTrades:5}});
 for(const path of [controlsPath,journalPath,join(f.dir,'fees.sqlite'),join(f.dir,'payments.sqlite')])chmodSync(path,0o600);
 const operatorDirectory=join(f.dir,'operator'),operator=await initializePerpsOperatorRecovery({directory:operatorDirectory,...common});
 const options={directory:custody.directory,keyFile:custody.keyFile,recipient:operator.recipient,explicitOperatorApproval:true,requireRestoreProof:true,...common,
  runtimePaths:{controlsPath,journalPath,temporaryDirectory:f.dir}};
 await assert.rejects(createPerpsCustodyRecoveryArchive(options));
 const archive=await createPerpsCustodyRecoveryArchive({...options,runtimePaths:{...options.runtimePaths,feesPath:join(f.dir,'fees.sqlite'),paymentsPath:join(f.dir,'payments.sqlite')}});
 await custody.registry.registerArchive(archive,{explicitOperatorApproval:true});
 const restored=await restorePerpsCustodyRecoveryArchive({ciphertext:archive.ciphertext,operatorDirectory,destinationDirectory:join(f.dir,'restored-fee-backup'),explicitOperatorApproval:true,...common});
 custody.registry.acceptRestoreProof({proofFile:restored.proofFile,expectedArchiveSha256:archive.sha256,explicitOperatorApproval:true});
 assert.equal(custody.registry.readVerified(f.who).platformFeeStateIncluded,true);assert.equal(custody.registry.readVerified(f.who).archiveSha256,archive.sha256);
 const risk=openPerpsExecutionJournal(join(restored.runtimeDirectory,'journal.sqlite'),{now:f.now});f.journals.push(risk);
 const restoredPayments=openPerpsPlatformFeePaymentJournal(join(restored.runtimeDirectory,'payments.sqlite'),{now:f.now});f.journals.push(restoredPayments);
 const restoredFees=openPerpsPlatformFeeJournal(join(restored.runtimeDirectory,'fees.sqlite'),{entryJournal:risk,now:f.now});f.journals.push(restoredFees);
 assert.equal(restoredFees.read('entry').id,f.assessment.id);assert.deepEqual(restoredPayments.read(f.assessment.id),payments.read(f.assessment.id));
 assert.equal(risk.pendingPlatformFeePayments(f.who.walletAddress).length,1);assert.equal(restoredPayments.read(f.assessment.id).state,'UNKNOWN');
 assert.equal(restored.requiresPausedReconciliation,true);
});

test('daily risk includes a finalized commission and invalidates the account lease when its payment journal changes',async t=>{
 const f=await paymentFixture(t,{paymentSlot:499999}),payments=f.openPayments(),review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});
 const sent=await collectReviewedPerpsPlatformFee(review,{journal:payments,riskJournal:f.entry,request:f.request,explicitApproval:true,signReviewed:r=>f.signFee(r)});
 const token=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_PLATFORM_FEE.mint)).copy(token);Buffer.from(bs58.decode(review.walletAddress)).copy(token,32);token.writeBigUInt64LE(4920000n,64);token[108]=1;
 const request=async(method,params)=>{
  if(method==='getMultipleAccounts')return {context:{slot:500000},value:[{owner:'11111111111111111111111111111111',executable:false,lamports:9995000,data:['','base64']},
   {owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:2039280,data:[token.toString('base64'),'base64']},...Array(6).fill(null)]};
  if(method==='getSlot')return 500000;if(method==='getBlocks')return [68000];if(method==='getFirstAvailableBlock')return 100;
  if(method==='getBlockTime')return params[0]===500000?Math.floor(f.now()/1000):Math.floor(f.now()/1000)-172800;
  if(method==='getSignaturesForAddress')return params[0]===review.walletAddress?[{signature:sent.signature,slot:499999,blockTime:Math.floor(f.now()/1000),err:null,confirmationStatus:'finalized'}]:[];
  const value=await f.request(method,params);if(method==='getTransaction'&&value)value.meta.innerInstructions=[];return value;
 };
 const proof=await readServerPerpsDailyAccount({walletAddress:review.walletAddress},{request,now:f.now,paymentJournal:payments});
 assert.equal(proof.lossTodayUsdcUnits,'80000');assert.equal(proof.platformFeeUsdcUnits,'80000');assert.equal(proof.tradesToday,0);assert.equal(proof.walletNetworkFeesLamports,'5000');
 assert.equal(requireFreshServerPerpsDailyAccount(proof,{walletAddress:review.walletAddress}),proof);
 await reconcilePerpsPlatformFeePayment(review.assessmentId,{journal:payments,riskJournal:f.entry,request:f.request,now:f.now});
 assert.throws(()=>requireFreshServerPerpsDailyAccount(proof,{walletAddress:review.walletAddress}));
});

test('a custody-only backup cannot authorize commercial fees even if its original restore proof is valid',async t=>{
 const f=await paymentFixture(t,{automation:true}),custody=custodyFixture(t,f),payments=f.openPayments();
 const db=new DatabaseSync(custody.registryPath);try{db.exec('DELETE FROM perps_backup_fee_scope');}finally{db.close();}
 const review=await preparePerpsPlatformFeePayment(f.assessment,{request:f.request,now:f.now});f.entry.claimPlatformFeePayment(review);const claim=payments.beginSigning(review,{explicitApproval:true});
 assert.equal(custody.registry.readVerified(f.who).backupVerified,true);assert.equal(custody.registry.readVerified(f.who).platformFeeStateIncluded,false);
 assert.throws(()=>authorizePerpsPlatformFeeCustody(review,claim,{...f.who,feeJournal:f.fees,paymentJournal:payments,riskJournal:f.entry,backupRegistry:custody.registry,isExecutionRunning:()=>true}));
 assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
});

test('fee RPC uses one fixed mainnet send, never falls back, and rejects retry options',async()=>{
 let sends=0;const request=createPerpsPlatformFeeRpc({readRequest:async()=>42,fetchImpl:async(url,options)=>{sends++;assert.equal(url,'https://api.mainnet-beta.solana.com');assert.equal(options.redirect,'error');throw Error('LOST_REPLY');}});
 assert.equal(await request('getSlot',[]),42);
 const options={encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0};
 await assert.rejects(request('sendTransaction',['fixture',options]));assert.equal(sends,1);
 await assert.rejects(request('sendTransaction',['fixture',{...options,maxRetries:1}]));assert.equal(sends,1);
});

test('new entries require the current mandate, full backup and an existing operator USDC account',async t=>{
 const f=await paymentFixture(t,{automation:true}),custody=custodyFixture(t,f),payments=f.openPayments();
 const service=createPerpsAutomationFees({feeJournal:f.fees,paymentJournal:payments,riskJournal:f.entry,controls:f.controls,vault:custody.vault,backupRegistry:custody.registry,request:f.request,isExecutionRunning:()=>true,now:f.now});
 await service.assertEntryReadiness(f.who);f.changes.destinationMissing=true;
 await assert.rejects(service.assertEntryReadiness(f.who),/PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING/);
 assert.equal((await service.reconcileWallet(f.who,{allowCollection:false})).due,true);
 assert.equal(f.entry.pendingPlatformFeePayments(f.who.walletAddress).length,0);assert.equal(f.calls.some(c=>c.method==='sendTransaction'),false);
 f.changes.destinationMissing=false;f.changeControls({enabled:false,paused:true});await assert.rejects(service.assertEntryReadiness(f.who));
});
