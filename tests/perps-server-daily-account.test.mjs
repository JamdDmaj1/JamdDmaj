import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {readServerPerpsDailyAccount,requireFreshServerPerpsDailyAccount,createServerPerpsDailyAccountReader,createServerPerpsCustodyRiskReader} from '../lib/perps-server-daily-account.js';
import {PERPS_CUSTODIES,PERPS_POOL,PERPS_PROGRAM,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {fixtureNow as now,fixtureWallet as walletAddress,historyTransaction} from './helpers/perps-history-fixture.mjs';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',day='2026-10-18';
async function fixture(){
 const entry=await historyTransaction({name:'InstantIncreasePositionEvent',nonce:4}),exit=await historyTransaction({nonce:5}),failed=await historyTransaction({nonce:6});
 failed.tx.meta.err={InstructionError:[0,{Custom:42}]};failed.tx.meta.innerInstructions=[];
 const transactions=new Map([entry,exit,failed].map(t=>[t.signature,t]));
 const input=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(input);Buffer.from(bs58.decode(walletAddress)).copy(input,32);input.writeBigUInt64LE(150000000n,64);input[108]=1;
 const accounts={context:{slot:500000},value:[{owner:'11111111111111111111111111111111',executable:false,lamports:100000000,data:['','base64']},
  {owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:2039280,data:[input.toString('base64'),'base64']},...Array(6).fill(null)]};
 const calls=[],request=async(method,params)=>{
  calls.push({method,params});
  if(method==='getGenesisHash')return genesis;
  if(method==='getMultipleAccounts')return accounts;
  if(method==='getSlot')return 500000;
  if(method==='getBlocks')return [68000];
  if(method==='getBlockTime')return params[0]===500000?now/1000-5:now/1000-172800;
  if(method==='getFirstAvailableBlock')return 100;
  if(method==='getTransaction')return structuredClone(transactions.get(params[0])?.tx??null);
  if(method==='getSignaturesForAddress')return params[0]===walletAddress||params[0]===entry.position?[...transactions.values()].sort((a,b)=>b.tx.slot-a.tx.slot).map(t=>({signature:t.signature,slot:t.tx.slot,blockTime:t.tx.blockTime,err:t.tx.meta.err,confirmationStatus:'finalized'})):[];
  throw Error('unexpected read');
 };
 return {transactions,accounts,calls,request,entry,exit,failed,options:{request,now:()=>now}};
}
test('finalized balance, all-address coverage and authenticated CPI events produce exact daily risk accounting',async()=>{
 const f=await fixture(),proof=await readServerPerpsDailyAccount({walletAddress,minimumSlot:499999},f.options);
 assert.equal(proof.balancesComplete,true);assert.equal(proof.availableUsdcUnits,'150000000');assert.equal(proof.lossTodayUsdcUnits,'1294567');
 assert.equal(proof.tradesToday,1);assert.equal(proof.failedTransactions,1);assert.equal(proof.walletNetworkFeesLamports,'15000');assert.equal(proof.networkFeesIncludedInUsdLoss,false);
 assert.equal(proof.requiresReconciledDailyAccounting,false);assert.equal(proof.readyForSigning,false);assert.equal(proof.transactions.length,3);
 assert.equal(requireFreshServerPerpsDailyAccount(proof,{walletAddress,minimumSlot:500000}),proof);
 assert.throws(()=>requireFreshServerPerpsDailyAccount({...proof},{walletAddress}));
 assert.ok(f.calls.filter(c=>c.method==='getMultipleAccounts').every(c=>c.params[1].commitment==='finalized'));
 assert.equal(f.calls.filter(c=>c.method==='getTransaction').length,3);
});
test('an actually exhausted retained history proves zero trades, but failed history reads never become zero',async()=>{
 const f=await fixture();f.transactions.clear();const proof=await readServerPerpsDailyAccount({walletAddress},f.options);
 assert.equal(proof.lossTodayUsdcUnits,'0');assert.equal(proof.tradesToday,0);assert.equal(proof.transactions.length,0);
 await assert.rejects(readServerPerpsDailyAccount({walletAddress},{...f.options,request:async(m,p)=>m==='getSignaturesForAddress'?null:f.request(m,p)}));
});
test('missing or mismatched receipts and newer account activity prevent an apparently reconciled snapshot',async()=>{
 for(const mutate of [
  f=>f.entry.tx.slot--,f=>f.entry.tx.blockTime--,
  f=>f.entry.tx.meta.innerInstructions=[],
  f=>f.entry.tx.meta.innerInstructions[0].instructions[0].data=bs58.encode(Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),Buffer.alloc(8)])),
  f=>f.entry.tx.slot=500001,
 ]){
  const f=await fixture();
  // Capture an independent signature index before tampering with tx metadata.
  const original=await f.request('getSignaturesForAddress',[walletAddress,{}]);mutate(f);
  await assert.rejects(readServerPerpsDailyAccount({walletAddress},{...f.options,request:async(m,p)=>m==='getSignaturesForAddress'&&(p[0]===walletAddress||p[0]===f.entry.position)?original:f.request(m,p)}));
 }
 const f=await fixture();await assert.rejects(readServerPerpsDailyAccount({walletAddress},{...f.options,request:async(m,p)=>m==='getTransaction'?null:f.request(m,p)}));
 const g=await fixture();g.accounts.context.slot=499995;await assert.rejects(readServerPerpsDailyAccount({walletAddress},g.options));
});
test('non-Perps funding transfers are signature-verified but not counted as futures entries or losses',async()=>{
 const f=await fixture(),funding=await historyTransaction({nonce:7,program:'11111111111111111111111111111111'});f.transactions.clear();f.transactions.set(funding.signature,funding);
 const proof=await readServerPerpsDailyAccount({walletAddress},f.options);assert.equal(proof.lossTodayUsdcUnits,'0');assert.equal(proof.tradesToday,0);assert.equal(proof.walletNetworkFeesLamports,'5000');
});
test('reconciled daily account expires with its oldest chain read and cannot cross UTC midnight',async()=>{
 const f=await fixture();let elapsed=0,clock=now;
 const proof=await readServerPerpsDailyAccount({walletAddress},{...f.options,monotonicNow:()=>elapsed,now:()=>clock});
 elapsed=10001;assert.throws(()=>requireFreshServerPerpsDailyAccount(proof,{walletAddress}));elapsed=0;clock=now+86400000;
 assert.throws(()=>requireFreshServerPerpsDailyAccount(proof,{walletAddress}));
});
test('long-lived reader caches finalized receipts only, rechecks every balance/history and cannot cache away a mismatch',async()=>{
 const f=await fixture(),read=createServerPerpsDailyAccountReader(f.options);
 const first=await read({walletAddress}),second=await read({walletAddress});
 assert.equal(first.lossTodayUsdcUnits,second.lossTodayUsdcUnits);
 assert.equal(f.calls.filter(c=>c.method==='getTransaction').length,3);
 assert.equal(f.calls.filter(c=>c.method==='getMultipleAccounts').length,2);
 assert.equal(f.calls.filter(c=>c.method==='getSignaturesForAddress').length,14);
 f.entry.tx.slot--;await assert.rejects(read({walletAddress}));
});
test('failed finalized transactions with no recorded CPI do not invent committed position losses',async()=>{
 const f=await fixture();f.transactions.clear();f.failed.tx.meta.innerInstructions=null;f.transactions.set(f.failed.signature,f.failed);
 const proof=await readServerPerpsDailyAccount({walletAddress},f.options);
 assert.equal(proof.failedTransactions,1);assert.equal(proof.tradesToday,0);assert.equal(proof.lossTodayUsdcUnits,'0');assert.equal(proof.walletNetworkFeesLamports,'5000');
});
test('durable journal enforces the actual reconciled loss and daily trade count rather than an API claim',async t=>{
 const f=await fixture(),snapshot=await readServerPerpsDailyAccount({walletAddress},f.options);
 const directory=mkdtempSync(join(tmpdir(),'jamd-daily-risk-')),journal=openPerpsExecutionJournal(join(directory,'risk.sqlite'),{now:()=>now});
 t.after(()=>{journal.close();rmSync(directory,{recursive:true,force:true});});
 const reservation={walletAddress,signalId:'published-signal-1',reservationId:'r1',marginUsd:'10',snapshot,
  limits:{capitalUsd:'100',dailyLossUsd:'20',positions:2,dailyTrades:2}};
 assert.throws(()=>journal.reserve({...reservation,limits:{...reservation.limits,dailyLossUsd:'10'}}),/DAILY_LOSS_LIMIT/);
 assert.throws(()=>journal.reserve({...reservation,limits:{...reservation.limits,dailyTrades:1}}),/DAILY_TRADE_LIMIT/);
 assert.equal(journal.reserve(reservation).state,'RESERVED');
 assert.throws(()=>journal.reserve({...reservation,signalId:'published-signal-2',reservationId:'r2'}),/DAILY_LOSS_LIMIT/);
 assert.equal(journal.pending(walletAddress).length,1);
});
async function custodyRiskFixture(t){
 const f=await fixture();f.transactions.clear();let elapsed=0;
 const directory=mkdtempSync(join(tmpdir(),'jamd-custody-risk-')),journal=openPerpsExecutionJournal(join(directory,'risk.sqlite'),{now:()=>now});
 t.after(()=>{journal.close();rmSync(directory,{recursive:true,force:true});});
 const current=structuredClone(f.accounts);current.context.slot=500050;
 const request=async(method,params)=>method==='getMultipleAccounts'&&params[1].commitment==='confirmed'?structuredClone(current):f.request(method,params);
 const verifyExclusiveCustody=async identity=>({...identity,exclusive:true,purpose:'jamddmaj-perps-automation'});
 const read=createServerPerpsCustodyRiskReader({request,journal,verifyExclusiveCustody,now:()=>now,monotonicNow:()=>elapsed});
 return {...f,current,journal,read,request,verifyExclusiveCustody,setClock(value){elapsed=value;}};
}
async function positionAccount(asset,side,collateral){
 const ids=await deriveServerPerpsIdentities({walletAddress,asset,side}),data=Buffer.alloc(210),collateralAsset=side==='LONG'?asset:'USDC';
 Buffer.from('aabc8fe47a40f7d0','hex').copy(data);
 for(const [offset,key]of [[8,walletAddress],[40,PERPS_POOL],[72,PERPS_CUSTODIES[asset].address],[104,PERPS_CUSTODIES[collateralAsset].address]])Buffer.from(bs58.decode(key)).copy(data,offset);
 data.writeBigUInt64LE(1000n,136);data.writeBigUInt64LE(1001n,144);data[152]=side==='LONG'?1:2;data.writeBigUInt64LE(100000000n,153);data.writeBigUInt64LE(30000000n,161);data.writeBigUInt64LE(BigInt(collateral),169);data[209]=ids.positionBump;
 return {owner:PERPS_PROGRAM,executable:false,lamports:2000000,data:[data.toString('base64'),'base64']};
}
test('exclusive custody reader uses a fresh confirmed bank without waiting for finality and retains journal collateral',async t=>{
 const f=await custodyRiskFixture(t),identity={walletAddress,ownerAccountHash:'a'.repeat(64),minimumSlot:500040};
 const first=await f.read(identity);assert.equal(first.observedSlot,500050);assert.equal(first.historyThroughSlot,500000);assert.equal(first.requiresExclusiveCustodyJournal,true);
 assert.equal(requireFreshServerPerpsDailyAccount(first,{walletAddress,minimumSlot:500040,journal:f.journal}),first);
 assert.throws(()=>requireFreshServerPerpsDailyAccount(first,{walletAddress,journal:{...f.journal}}));
 const limits={capitalUsd:'20',dailyLossUsd:'20',positions:2,dailyTrades:2};
 f.journal.reserve({walletAddress,signalId:'one',reservationId:'one',marginUsd:'10',limits,snapshot:first});
 f.journal.beginSigning('one');const second=await f.read(identity);
 assert.equal(second.pendingMarginUsdcUnits,'10000000');assert.equal(second.pendingCount,1);
 f.journal.revalidateSigning('one',{limits,snapshot:second});
 f.journal.reserve({walletAddress,signalId:'two',reservationId:'two',marginUsd:'10',limits,snapshot:second});
 assert.throws(()=>f.journal.reserve({walletAddress,signalId:'three',reservationId:'three',marginUsd:'10',limits,snapshot:second}),/CAPITAL_LIMIT/);
 assert.equal(f.calls.filter(c=>c.method==='getSignaturesForAddress').length,7);
 f.setClock(5001);await f.read(identity);assert.equal(f.calls.filter(c=>c.method==='getSignaturesForAddress').length,14);
});
test('confirmed closures cannot release finalized collateral, and different markets keep both risk allocations',async t=>{
 const f=await custodyRiskFixture(t);f.accounts.value[2]=await positionAccount('BTC','LONG','10000000');
 f.current.value[5]=await positionAccount('ETH','SHORT','12000000');
 const value=await f.read({walletAddress,ownerAccountHash:'a'.repeat(64)});
 assert.equal(value.allocatedUsdcUnits,'22000000');assert.equal(value.openPositions,2);assert.equal(value.observedOpenPositions,1);assert.equal(value.finalizedOpenPositions,1);
});
test('imported/unverified identities, unavailable confirmed banks and stale baseline facts never grant current risk evidence',async t=>{
 const f=await custodyRiskFixture(t),identity={walletAddress,ownerAccountHash:'a'.repeat(64)};
 const denied=createServerPerpsCustodyRiskReader({request:f.request,journal:f.journal,verifyExclusiveCustody:async i=>({...i,exclusive:false}),now:()=>now});
 await assert.rejects(denied(identity));await assert.rejects(f.read({...identity,ownerAccountHash:undefined}));
 f.current.context.slot=499999;await assert.rejects(f.read({...identity,minimumSlot:500040}));
});
