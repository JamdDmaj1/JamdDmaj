import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import bs58 from 'bs58';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
const wallet=bs58.encode(new Uint8Array(32).fill(1));
const time=Date.parse('2026-10-18T12:00:00Z');
function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'jamd-perps-journal-')),path=join(dir,'journal.sqlite');
  const journals=[];
  t.after(()=>{for(const journal of journals)try{journal.close();}catch{}rmSync(dir,{recursive:true,force:true});});
  return (options={})=>{const j=openPerpsExecutionJournal(path,{now:()=>time,...options});journals.push(j);return j;};
}
function request(id,changes={}){
  return {walletAddress:wallet,signalId:'signal-'+id,reservationId:id,marginUsd:'10',
    limits:{capitalUsd:'100',dailyLossUsd:'100',positions:10,dailyTrades:10},
    snapshot:{walletAddress:wallet,network:'solana-mainnet',balancesComplete:true,observedAt:time,day:'2026-10-18',
      availableUsdcUnits:'100000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0},...changes};
}
test('risk reservations persist across independent database connections and restart',t=>{
  const open=fixture(t),one=open(),two=open();
  one.reserve(request('a',{limits:{capitalUsd:'10',dailyLossUsd:'10',positions:1,dailyTrades:1}}));
  assert.throws(()=>two.reserve(request('b',{limits:{capitalUsd:'10',dailyLossUsd:'10',positions:1,dailyTrades:1}})),/CAPITAL_LIMIT/);
  assert.throws(()=>two.reserve(request('a')),/DUPLICATE_SIGNAL/);
  one.close();
  assert.equal(open().read('a').state,'RESERVED');
});
test('unknown broadcast stays reserved and cannot be released or signed again',t=>{
  const open=fixture(t),j=open();j.reserve(request('a'));j.beginSigning('a');
  assert.throws(()=>j.cancelUnsigned('a'),/RECONCILIATION_REQUIRED/);
  const signature=bs58.encode(new Uint8Array(64).fill(3));
  j.recordBroadcastIntent('a',{wireHash:'a'.repeat(64),signature});
  const restart=open();assert.equal(restart.pending(wallet)[0].signature,signature);
  assert.equal(restart.read('a').state,'UNCERTAIN');
  assert.throws(()=>restart.beginSigning('a'),/INVALID_TRANSITION/);
  assert.throws(()=>restart.cancelUnsigned('a'),/RECONCILIATION_REQUIRED/);
  assert.throws(()=>restart.reserve(request('b',{snapshot:{...request('b').snapshot,availableUsdcUnits:'15000000'}})),/INSUFFICIENT_UNRESERVED_BALANCE/);
});
test('unsigned cancellation frees risk but never replays the same Telegram signal',t=>{
  const j=fixture(t)();j.reserve(request('a'));j.cancelUnsigned('a');
  assert.equal(j.pending(wallet).length,0);
  assert.throws(()=>j.reserve(request('a')),/DUPLICATE_SIGNAL/);
  assert.equal(j.reserve(request('b')).state,'RESERVED');
});
test('reserves full collateral against daily loss and position/trade limits',t=>{
  const j=fixture(t)();j.reserve(request('a'));
  for(const [limits,error]of [
    [{dailyLossUsd:'15'},/DAILY_LOSS_LIMIT/],[{capitalUsd:'15',dailyLossUsd:'15'},/CAPITAL_LIMIT/],
    [{positions:1},/POSITION_LIMIT/],[{dailyTrades:1},/DAILY_TRADE_LIMIT/]
  ])assert.throws(()=>j.reserve(request('b',{limits:{...request('b').limits,...limits}})),error);
  assert.equal(j.pending(wallet).length,1);
});
test('rejects stale, foreign, partial, wrong-day and inexact account observations',t=>{
  const j=fixture(t)();
  for(const patch of [{observedAt:time-10001},{observedAt:time+2001},{walletAddress:'other'},
    {balancesComplete:false},{network:'solana-devnet'},{day:'2026-10-17'},
    {availableUsdcUnits:'10.5'},{openPositions:1.5}]){
    assert.throws(()=>j.reserve(request('a',{snapshot:{...request('a').snapshot,...patch}})));
  }
  assert.equal(j.pending(wallet).length,0);
});
test('invalid signed identity rolls back without releasing the signing reservation',t=>{
  const j=fixture(t)();j.reserve(request('a'));j.beginSigning('a');
  assert.throws(()=>j.recordBroadcastIntent('a',{wireHash:'not-a-hash',signature:wallet}),/INVALID_WIRE_HASH/);
  assert.equal(j.read('a').state,'SIGNING');
  assert.throws(()=>j.recordBroadcastIntent('a',{wireHash:'a'.repeat(64),signature:wallet}),/INVALID_PUBLIC_IDENTIFIER/);
  assert.equal(j.read('a').state,'SIGNING');
});
test('midnight never releases pending daily slots',t=>{
  const open=fixture(t),j=open();j.reserve(request('a'));j.beginSigning('a');
  const tomorrow=time+86400000,next=open({now:()=>tomorrow});
  assert.throws(()=>next.reserve(request('b',{
    limits:{...request('b').limits,dailyTrades:1},
    snapshot:{...request('b').snapshot,observedAt:tomorrow,day:'2026-10-19'}
  })),/DAILY_TRADE_LIMIT/);
});
test('eight competing processes cannot spend the same twenty USDC',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'jamd-perps-race-')),path=join(dir,'journal.sqlite');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const initial=openPerpsExecutionJournal(path);initial.close();
  const moduleUrl=new URL('../lib/perps-execution-journal.js',import.meta.url).href;
  const run=id=>new Promise((resolve,reject)=>{
    const input=request(id,{snapshot:{...request(id).snapshot,availableUsdcUnits:'20000000'}});
    const source=`import {openPerpsExecutionJournal} from ${JSON.stringify(moduleUrl)};
      const j=openPerpsExecutionJournal(process.argv[1],{now:()=>${time}});
      try {j.reserve(${JSON.stringify(input)});console.log('reserved');}
      catch(error){console.log(error.message);}
      finally{j.close();}`;
    const child=spawn(process.execPath,['--input-type=module','-e',source,path],{stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);
    child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));
  });
  const results=await Promise.all(Array.from({length:8},(_,i)=>run('race-'+i)));
  assert.equal(results.filter(r=>r==='reserved').length,2,JSON.stringify(results));
  assert.equal(results.filter(r=>r==='INSUFFICIENT_UNRESERVED_BALANCE').length,6,JSON.stringify(results));
  const check=openPerpsExecutionJournal(path);try{assert.equal(check.pending(wallet).length,2);}finally{check.close();}
});
