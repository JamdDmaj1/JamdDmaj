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
 return {entry,open,consent,tx,rpc,advance(ms){clock+=ms;},async finalize(){entry.beginSigning('entry',snapshot);entry.recordBroadcastIntent('entry',{signature,wireHash});clock=time+2000;const r=await readPerpsBroadcastReceipt({walletAddress:wallet,signature,wireHash},rpc,{now,requireFinalized:true});entry.reconcileBroadcast('entry',r);return readServerPerpsTradeTransaction({walletAddress:wallet,signature,day:'2026-10-25'},{request:rpc,now});}};
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
