import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
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
async function fixture(t){
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
 entry.reserve({walletAddress:wallet,reservationId:'entry',signalId:'signal',marginUsd:'40',positionAddress:ids.position,limits:{capitalUsd:'100',dailyLossUsd:'100',positions:1,dailyTrades:5},snapshot});
 const open=()=>{const j=openPerpsPlatformFeeJournal(join(dir,'fees.sqlite'),{entryJournal:entry,now});journals.push(j);return j;};
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
 const f=await fixture(t),fees=f.open();fees.recordConsent(f.consent);const opening=await f.finalize(),assessment=fees.assessFinalizedOpen('entry',opening);
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
  if(method==='getMultipleAccounts')return {context:{slot:500},value:[changes.noSol?account('11111111111111111111111111111111',Buffer.alloc(0),0):payer(false),account(TOKEN,mintData),changes.noFunds?token(f.consent.walletAddress,0):source(false),dest(false)]};
  if(method==='getFeeForMessage')return {context:{slot:500},value:5000};
  if(method==='getBlockHeight')return changes.expired?1001:600;
  if(method==='simulateTransaction')return {context:{slot:500},value:{err:changes.simulationError??null,accounts:[payer(true),source(true),changes.changedEffects?dest(false):dest(true)]}};
  if(method==='sendTransaction'){wire=params[0];if(changes.timeout)throw Error('TIMED_OUT');return bs58.encode(Buffer.from(wire,'base64').subarray(1,65));}
  if(method==='getSignatureStatuses')return {context:{slot:501},value:[changes.pending?null:{slot:501,confirmationStatus:'finalized',err:changes.failed?{InstructionError:[0,'Custom']}:null}]};
  if(method==='getTransaction'){
   if(wire===null)return null;const failed=!!changes.failed;
   const tokens=after=>[1,2].map(index=>({accountIndex:index,mint,owner:index===1?f.consent.walletAddress:PERPS_PLATFORM_FEE.recipient,
    uiTokenAmount:{decimals:6,amount:String(index===1?5000000-(after&&!failed?80000:0):3000000+(after&&!failed?80000:0))}}));
   const result={slot:501,blockTime:f.now()/1000,transaction:[wire,'base64'],meta:{err:failed?{InstructionError:[0,'Custom']}:null,fee:5000,
    preBalances:[10000000,2039280,2039280,1461600,1,1],postBalances:[9995000,2039280,2039280,1461600,1,1],preTokenBalances:tokens(false),postTokenBalances:tokens(true)}};
   if(changes.tamperReceipt)changes.tamperReceipt(result);return result;
  }
  throw Error('UNEXPECTED_RPC_'+method);
 };
 const openPayments=()=>{const j=openPerpsPlatformFeePaymentJournal(join(f.dir,'payments.sqlite'),{now:f.now});f.journals.push(j);return j;};
 return {...f,assessment,plan,calls,request,changes,openPayments};
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
