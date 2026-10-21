import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import bs58 from 'bs58';
import {getProgramDerivedAddress} from '@solana/kit';
import layout from '../lib/perps-event-layout.json' with {type:'json'};
import {canonicalPerpsCloseSettlement} from '../lib/perps-close-settlement.js';
import {readFinalizedPerpsClosePayout,requireVerifiedPerpsClosePayout,perpsClosePayoutRecordBinding} from '../lib/perps-close-payout-receipt.js';
import {PERPS_PROGRAM,PERPS_POOL,PERPS_CUSTODIES,deriveServerPerpsIdentities} from '../lib/perps-server-custody.js';
import {readServerPerpsAccount} from '../lib/perps-server-account.js';
import {prepareFinalizedPerpsCloseConversion,readPreparedPerpsCloseConversion} from '../lib/perps-close-conversion-preparation.js';
import {readSimulatedPerpsCloseConversion} from '../lib/perps-close-conversion-simulation.js';
import {conversionFixture} from './helpers/perps-conversion-fixture.mjs';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',now=Date.parse('2026-10-20T20:00:00Z'),rent=2039280n,payout=7000000n;
const hash=b=>createHash('sha256').update(b).digest('hex');
const associated=async(owner,mint)=>(await getProgramDerivedAddress({programAddress:ATA,seeds:[bs58.decode(owner),bs58.decode(TOKEN),bs58.decode(mint)]}))[0];
// Public deterministic, unfunded fixture identities. Signatures never reach an
// RPC or broadcaster; the request function below rejects every write method.
const privateKeys=[51,52,53].map(n=>createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,n)]),format:'der',type:'pkcs8'}));
const signers=privateKeys.map(k=>bs58.encode(createPublicKey(k).export({format:'der',type:'spki'}).subarray(-32)));
import {closePayoutFixture as fixture} from './helpers/perps-close-payout-fixture.mjs';

test('finalized six-path payout receipt binds signed wire, exact event/transfer/vault/wallet and native closure, not quote estimates',async()=>{
 for(const asset of ['SOL','ETH','BTC'])for(const side of ['LONG','SHORT'])for(const version of [1,2]){
  const f=await fixture({asset,side,version,versioned:version===2}),r=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);
  assert.equal(r.receivedTokenUnits,String(payout));assert.equal(r.receiveAsset,side==='LONG'?asset:'USDC');
  assert.equal(r.requiresConversion,side==='LONG');assert.equal(r.requiresSignedCloseJournalBinding,true);assert.equal(r.readyForSigning,false);
  assert.equal(r.recordBinding,perpsClosePayoutRecordBinding(f.row));assert.equal(requireVerifiedPerpsClosePayout(r),r);
  assert.throws(()=>requireVerifiedPerpsClosePayout({...r}));f.expire();assert.throws(()=>requireVerifiedPerpsClosePayout(r));
  assert(f.calls.every(c=>!/^send|sign|requestAirdrop/.test(c.method)));
 }
});

test('new collateral ATA and retained v2 request ATA rent are distinguished from actual returned collateral',async()=>{
 for(const asset of ['SOL','ETH'])for(const newAta of [false,true]){
  const f=await fixture({asset,version:2,newAta,retainedRequest:true});
  assert.equal((await readFinalizedPerpsClosePayout(f.row,f.identity,f.options)).receivedTokenUnits,String(payout));
 }
});

test('a retained zero-sized native position is closed, while a valid reopened position cannot finalize this close workflow',async()=>{
 const f=await fixture({retainedPosition:true});
 assert.equal((await readFinalizedPerpsClosePayout(f.row,f.identity,f.options)).receivedTokenUnits,String(payout));
 f.reopen();
 const account=await readServerPerpsAccount({walletAddress:f.row.wallet},{request:f.request,now:()=>now,commitment:'finalized'});
 assert.equal(account.positions.length,1);assert.equal(account.positions[0].openTimeSeconds,'2000');
 await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
});

test('even valid signatures and an exact record hash cannot turn a partial or multi-Perps wire into a whole-position receipt',async()=>{
 for(const options of [{entire:false},{extraPerps:true}]){
  const f=await fixture(options);await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
 }
});

test('unfinalized, missing, failed and wrong-network results cannot start a conversion',async()=>{
 for(const state of ['confirmed','missing','failed','network']){
  const f=await fixture();
  if(state==='confirmed')f.status.confirmationStatus='confirmed';
  if(state==='missing'){const request=f.options.request;f.options.request=(m,p)=>m==='getSignatureStatuses'?{context:{slot:301},value:[null]}:request(m,p);}
  if(state==='failed'){f.status.err={InstructionError:[0,'InvalidArgument']};f.tx.meta.err=f.status.err;}
  if(state==='network')f.network('devnet');
  if(['confirmed','missing'].includes(state))assert.equal(await readFinalizedPerpsClosePayout(f.row,f.identity,f.options),null);
  else await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
 }
});

test('a complete loss is a zero finalized return, never permission to convert pre-existing wallet tokens',async()=>{
 for(const asset of ['SOL','ETH']){
  const f=await fixture({asset,amount:0n});f.fields.pnlDelta='10000000';f.refreshEvent();
  const r=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);
  assert.equal(r.receivedTokenUnits,'0');assert.equal(r.requiresConversion,false);assert.equal(r.requiresProtectedConversion,false);
 }
});

test('record state is bound and caller mutations during RPC do not replace captured settlement evidence',async()=>{
 const f=await fixture(),original=perpsClosePayoutRecordBinding(f.row),request=f.options.request;
 f.options.request=async(m,p)=>{const value=await request(m,p);f.row.state='CANCELLED';return value;};
 const r=await readFinalizedPerpsClosePayout(f.row,f.identity,f.options);assert.equal(r.recordBinding,original);
 assert.throws(()=>perpsClosePayoutRecordBinding(f.row));
 await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options));
});

test('receipt rejects wrong wire/generation/payout, invented native gains, vault authority and malformed metadata',async()=>{
 for(const mode of ['wire','position','size','generation','eventPayout','transfer','ownerGain','vaultAmount','vaultAuthority','decimals','duplicateBalance','fee','reopened','legacy','expired']){
  const f=await fixture();
  if(mode==='wire')f.row.unsigned_wire_hash='a'.repeat(64);
  if(mode==='position')f.row.position=f.row.wallet;
  if(mode==='size'){f.fields.sizeUsdDelta='29999999';f.refreshEvent();}
  if(mode==='generation'){f.fields.positionOpenTime='1001';f.refreshEvent();}
  if(mode==='eventPayout'){f.fields.transferToken='7000001';f.refreshEvent();}
  if(mode==='transfer'){const b=Buffer.from(bs58.decode(f.inner[0].data));b.writeBigUInt64LE(payout+1n,1);f.inner[0].data=bs58.encode(b);}
  if(mode==='ownerGain')f.tx.meta.postBalances[0]++;
  if(mode==='vaultAmount')f.tx.meta.postTokenBalances[0].uiTokenAmount.amount='92999999';
  if(mode==='vaultAuthority')f.tx.meta.preTokenBalances[0].owner=f.row.wallet;
  if(mode==='decimals')f.tx.meta.postTokenBalances[0].uiTokenAmount.decimals=6;
  if(mode==='duplicateBalance')f.tx.meta.preTokenBalances.push(f.tx.meta.preTokenBalances[0]);
  if(mode==='fee')f.tx.meta.fee++;
  if(mode==='reopened')f.reopen();
  if(mode==='expired'){const request=f.options.request;f.options.request=async(m,p)=>{const x=await request(m,p);f.expire();return x;};}
  if(mode==='legacy'){const v=JSON.parse(f.row.settlement);v.version=1;delete v.sizeUsdUnits;delete v.collateralUsdUnits;delete v.positionOpenTimeSeconds;f.row.settlement=canonicalPerpsCloseSettlement(v,{walletAddress:f.row.wallet,positionAddress:f.row.position});}
  await assert.rejects(readFinalizedPerpsClosePayout(f.row,f.identity,f.options),mode);
 }
});

test('joined finalized-payout conversion uses actual proceeds rather than quote or wallet capital across all collateral tokens',async()=>{
 for(const [asset,unwrapSol]of [['SOL',true],['SOL',false],['ETH',false],['BTC',false]]){
  const close=await fixture({asset,unwrapSol}),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options);
  const swap=await conversionFixture({asset,walletAddress:close.row.wallet,amountUnits:payout.receivedTokenUnits,nativeSolInput:payout.delivery==='NATIVE_SOL'});
  const result=await prepareFinalizedPerpsCloseConversion(payout,close.row,swap.options);
  assert.equal(result.stage,'FINALIZED_PAYOUT_CONVERSION_PREPARED');assert.equal(result.amountUnits,'7000000');
  assert.notEqual(result.amountUnits,JSON.parse(close.row.settlement).estimatedCollateralUnits);
  assert.equal(result.wire.amountUnits,payout.receivedTokenUnits);assert.equal(result.wire.walletAddress,payout.walletAddress);
  assert.equal(result.simulation.receivedUsdcUnits,String(swap.received));assert.equal(result.readyForSigning,false);
  assert.equal(result.requiresSignedCloseJournalBinding,true);assert(Object.isFrozen(readPreparedPerpsCloseConversion(result,close.row)));
  assert.throws(()=>readPreparedPerpsCloseConversion({...result},close.row));
  const snapshots=readSimulatedPerpsCloseConversion(result.simulation);
  if(payout.delivery!=='NATIVE_SOL')assert.equal(Buffer.from(snapshots.after[result.wire.source].data[0],'base64').readBigUInt64LE(64),17n);
  assert(swap.calls.every(c=>!/^send|sign|requestAirdrop/.test(c.method)));
  assert.throws(()=>readPreparedPerpsCloseConversion(result,{...close.row,state:'CANCELLED'}));
 }
});

test('USDC collateral and a zero total-loss return never build a swap or touch pre-existing wallet funds',async()=>{
 for(const options of [{side:'SHORT'},{amount:0n}]){
  const close=await fixture(options),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options);let calls=0;
  const result=await prepareFinalizedPerpsCloseConversion(payout,close.row,{maxSlippageBps:100,request:()=>{calls++;throw Error('UNEXPECTED_NETWORK');}});
  assert.equal(result.stage,'NO_CLOSE_CONVERSION_REQUIRED');assert.equal(calls,0);assert.equal(result.readyForSigning,false);
  assert.equal(result.receivedUsdcUnits,options.side==='SHORT'?'7000000':'0');
 }
});

test('joined conversion rejects stale/forged receipts, foreign or changed records and invalid limits before any RPC',async()=>{
 const close=await fixture(),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options);let calls=0;
 const options={maxSlippageBps:100,request:()=>{calls++;throw Error('UNEXPECTED_NETWORK');}};
 for(const row of [{...close.row,wallet:PERPS_PROGRAM},{...close.row,state:'CANCELLED'},{...close.row,entries:'[]'}])await assert.rejects(prepareFinalizedPerpsCloseConversion(payout,row,options));
 for(const value of [{...payout},{...payout,receivedTokenUnits:'1'},null])await assert.rejects(prepareFinalizedPerpsCloseConversion(value,close.row,options));
 for(const patch of [{maxSlippageBps:101},{maxSlippageBps:0},{minimumUsdcUnits:'0'},{minimumUsdcUnits:'1e6'},{computeUnitPriceMicroLamports:10001}])await assert.rejects(prepareFinalizedPerpsCloseConversion(payout,close.row,{...options,...patch}));
 close.expire();await assert.rejects(prepareFinalizedPerpsCloseConversion(payout,close.row,options));assert.equal(calls,0);
});

test('joined conversion refuses depleted proceeds before preparing a wire and respects a stronger absolute USDC floor',async()=>{
 for(const asset of ['SOL','ETH']){
  const close=await fixture({asset}),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options);
  const swap=await conversionFixture({asset,walletAddress:close.row.wallet,amountUnits:payout.receivedTokenUnits});
  if(asset==='SOL')swap.before.get(close.row.wallet).lamports=6999999;
  else swap.before.set(swap.wire.source,swap.token(close.row.wallet,swap.c.mint,6999999n));
  await assert.rejects(prepareFinalizedPerpsCloseConversion(payout,close.row,swap.options));
  assert(!swap.calls.some(c=>c.method==='simulateTransaction'||c.method==='getLatestBlockhash'));
 }
 const close=await fixture(),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options);
 const swap=await conversionFixture({walletAddress:close.row.wallet,amountUnits:payout.receivedTokenUnits,strictWire:false});
 const absolute=(swap.received-1n).toString(),result=await prepareFinalizedPerpsCloseConversion(payout,close.row,{...swap.options,minimumUsdcUnits:absolute});
 assert.equal(result.minimumUsdcUnits,absolute);
});

test('joined native conversion retains pre-existing WSOL and native excess instead of closing or spending it',async()=>{
 for(const oldWrapped of [0n,17n]){
  const close=await fixture(),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options);
  const swap=await conversionFixture({walletAddress:close.row.wallet,amountUnits:payout.receivedTokenUnits,closeWrappedAccount:false,oldWrapped,unsynced:7n});
  const result=await prepareFinalizedPerpsCloseConversion(payout,close.row,swap.options),state=readSimulatedPerpsCloseConversion(result.simulation);
  assert.equal(result.wire.closeWrappedAccount,false);
  assert.equal(state.before[result.wire.source].lamports,state.after[result.wire.source].lamports);
  assert.equal(Buffer.from(state.after[result.wire.source].data[0],'base64').readBigUInt64LE(64),oldWrapped+7n);
 }
});

test('joined proof captures its record but must match a live record at use, and an expired payout stops before simulation',async()=>{
 const close=await fixture(),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options),original={...close.row};
 const swap=await conversionFixture({walletAddress:close.row.wallet,amountUnits:payout.receivedTokenUnits}),request=swap.options.request;
 swap.options.request=async(m,p)=>{const r=await request(m,p);close.row.state='CANCELLED';return r;};
 const result=await prepareFinalizedPerpsCloseConversion(payout,close.row,swap.options);
 assert.equal(readPreparedPerpsCloseConversion(result,original).payout,payout);
 assert.throws(()=>readPreparedPerpsCloseConversion(result,close.row));
 const other=await fixture(),payout2=await readFinalizedPerpsClosePayout(other.row,other.identity,other.options);
 const swap2=await conversionFixture({walletAddress:other.row.wallet,amountUnits:payout2.receivedTokenUnits}),request2=swap2.options.request;
 swap2.options.request=async(m,p)=>{const r=await request2(m,p);other.expire();return r;};
 await assert.rejects(prepareFinalizedPerpsCloseConversion(payout2,other.row,swap2.options));
 assert(!swap2.calls.some(c=>c.method==='simulateTransaction'));
});

test('joined conversion rejects unsafe or fractional native block-height metadata before simulation',async()=>{
 for(const height of [9007199254740992,1.5,'1000']){
  const close=await fixture(),payout=await readFinalizedPerpsClosePayout(close.row,close.identity,close.options);
  const swap=await conversionFixture({walletAddress:close.row.wallet,amountUnits:payout.receivedTokenUnits}),request=swap.options.request;
  swap.options.request=async(m,p)=>{const r=await request(m,p);if(m==='getLatestBlockhash')r.value.lastValidBlockHeight=height;return r;};
  await assert.rejects(prepareFinalizedPerpsCloseConversion(payout,close.row,swap.options));
  assert(!swap.calls.some(c=>c.method==='simulateTransaction'));
 }
});
