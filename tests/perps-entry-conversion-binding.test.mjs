import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {readFinalizedPerpsEntryConversionReceipt} from '../lib/perps-close-conversion-receipt.js';
import {bindFinalizedPerpsEntryConversion,readBoundPerpsEntryCollateral} from '../lib/perps-entry-conversion-binding.js';
import {inspectServerPerpsEntryCollateralFunding} from '../lib/perps-server-funding.js';
import {planProtectedPerpsCollateralLong,prepareProtectedPerpsCollateralLong} from '../lib/perps-entry-collateral-preparation.js';
import {inspectServerPerpsPreSwapPlan} from '../lib/perps-server-preswap.js';
import {PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities,decodeServerPerpsCustody} from '../lib/perps-server-custody.js';
import bs58 from 'bs58';
import {entryOpeningFixture} from './helpers/perps-entry-opening-fixture.mjs';
import {simulateServerPerpsPositionEffects} from '../lib/perps-server-simulation.js';
import {checkServerPerpsFundingSimulation} from '../lib/perps-server-funding-simulation.js';
import {prepareInspectedPerpsManualOrder,readInspectedPerpsManualReview} from '../lib/perps-manual-preparation.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {recoverRecordedPerpsEntryCollateral,recoverHeldPerpsEntryCollateral} from '../lib/perps-entry-conversion-recovery.js';
import {entryServiceReviewHarness} from './helpers/perps-entry-service-review.mjs';
import {readServerPerpsTradeTransaction} from '../lib/perps-server-trade-transaction.js';
import {readJournalledPerpsEntryConversion,requireVerifiedPerpsEntryConversionHistory} from '../lib/perps-entry-conversion-history.js';

for(const asset of ['BTC','ETH','SOL'])test('entry collateral binds exact signed intent and opening debit: '+asset,async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-entry-binding-'));chmodSync(root,0o700);
 const f=await conversionReceiptFixture({entry:true,asset}),ownerAccountHash='f'.repeat(64),id='a'.repeat(64);
 const journal=openBotSwapJournal(join(root,'swaps.sqlite'),{initialize:true,explicitOperatorApproval:true,allowNonPosixForTests:process.platform==='win32',now:f.receiptOptions.now});
 let risk;t.after(()=>{risk?.close();journal.close();rmSync(root,{recursive:true,force:true});});
 const receipt=await readFinalizedPerpsEntryConversionReceipt(f.wire,f.identity,f.receiptOptions);
 const review={id,stage:'PROTECTED_ENTRY_CONVERSION_PREPARED',walletAddress:f.walletAddress,controlRevision:'1',reservationId:'entry-'+asset,maxSlippageBps:50,draft:{asset,side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},usdcUnits:f.wire.usdcUnits,minimumCollateralUnits:f.wire.minimumCollateralUnits,collateralMint:receipt.collateralMint,collateralDecimals:receipt.collateralDecimals,observedSlot:105,networkFeeLamports:'5400'};
 const claim=journal.claim({id,ownerAccountHash,walletAddress:f.walletAddress,revision:'1',review,message:Buffer.from(f.wire.messageBase64,'base64')});
 journal.signed(claim,f.transaction.transaction[0]);
 const input={journal,id,ownerAccountHash,wire:f.wire,receipt};
 assert.throws(()=>bindFinalizedPerpsEntryConversion(input));
 journal.beginBroadcast(claim,{address:f.walletAddress,signature:f.identity.signature,lastValidBlockHeight:f.wire.lastValidBlockHeight});
 const bound=bindFinalizedPerpsEntryConversion(input);assert.equal(bound.receivedCollateralUnits,String(f.received));assert.equal(bound.readyForSigning,false);
 const recoveredJournal=openBotSwapJournal(join(root,'swaps.sqlite'),{allowNonPosixForTests:process.platform==='win32',now:f.receiptOptions.now});
 const recoveryRequest=async(method,params)=>{
  if(method==='getMultipleAccounts')return {context:{slot:130},value:params[0].map(address=>f.before.get(address))};
  return f.request(method,params);
 };
 const recoveryOptions={...f.receiptOptions,request:recoveryRequest};
 const recover=()=>recoverRecordedPerpsEntryCollateral({journal:recoveredJournal,id,ownerAccountHash},recoveryOptions);
 try{
 assert.deepEqual(await recover(),bound);
 await assert.rejects(()=>recoverRecordedPerpsEntryCollateral({journal,id,ownerAccountHash:'e'.repeat(64)},f.receiptOptions));
 f.status.confirmationStatus='confirmed';assert.equal((await recover()).stage,'RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY');f.status.confirmationStatus='finalized';
 for(const fault of ['network','slot','custody'])await assert.rejects(()=>recoverRecordedPerpsEntryCollateral({journal:recoveredJournal,id,ownerAccountHash},{...recoveryOptions,request:async(method,params)=>{
  if(method==='getGenesisHash'&&fault==='network')return 'wrong-network';
  const result=await recoveryRequest(method,params);
  if(method==='getMultipleAccounts'){
   if(fault==='slot')return {...result,context:{slot:104}};
   if(fault==='custody')return {...result,value:[result.value[1],result.value[0]]};
  }return result;
 }}));
 // A valid owner signature over the old wire must not authorize a modified
 // durable review minimum. Reconstruction must match the signed message.
 const raw=new DatabaseSync(join(root,'swaps.sqlite'));
 try{
  raw.prepare('UPDATE bot_wallet_swaps SET review=? WHERE id=?').run(JSON.stringify({...review,minimumCollateralUnits:String(BigInt(review.minimumCollateralUnits)+1n)}),id);
  await assert.rejects(recover);
 }finally{
  raw.prepare('UPDATE bot_wallet_swaps SET review=? WHERE id=?').run(JSON.stringify(review),id);raw.close();
 }
 }finally{recoveredJournal.close();}
 const intent={walletAddress:f.walletAddress,asset,side:'LONG',marginUsd:'10',leverage:3,maxSlippageBps:50,referencePrice:'100'};
 const plan=planProtectedPerpsCollateralLong(bound,intent);assert.equal(plan.body.inputToken,asset);assert.equal(plan.body.inputTokenAmount,String(f.received));assert.equal(plan.body.maxSlippageBps,'25');
 for(const wrong of [{side:'SHORT'},{marginUsd:'11'},{maxSlippageBps:500},{asset:asset==='BTC'?'ETH':'BTC'}])assert.throws(()=>planProtectedPerpsCollateralLong(bound,{...intent,...wrong}));
 let builds=0;const packet=await prepareProtectedPerpsCollateralLong(bound,intent,async(url,options)=>{
  builds++;assert.equal(url,'https://perps-api.jup.ag/v1/positions/increase');assert.equal(options.headers['x-perps-api-version'],'v2');assert.deepEqual(JSON.parse(options.body),plan.body);
  return Response.json({serializedTxBase64:f.wire.serializedTxBase64,positionPubkey:f.c.address,quote:{side:'long'},txMetadata:{blockhash:f.wire.blockhash,lastValidBlockHeight:f.wire.lastValidBlockHeight}});
 });
 assert.equal(builds,1);assert.equal(packet.readyForSigning,false);assert.equal(packet.stage,'UNVERIFIED_PREPARATION');assert.equal(packet.requiresIndependentCollateralIntentInspection,true);
 const ids=await deriveServerPerpsIdentities(intent),key=n=>bs58.encode(Buffer.alloc(32,n)),TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
 const riskPath=join(root,'risk.sqlite'),riskNow=f.receiptOptions.now(),reservationId='entry-'+asset;
 risk=openPerpsExecutionJournal(riskPath,{now:()=>riskNow});
 const limits={capitalUsd:'20',dailyLossUsd:'20',positions:1,dailyTrades:1};
 const riskSnapshot={walletAddress:f.walletAddress,network:'solana-mainnet',balancesComplete:true,observedAt:riskNow,day:new Date(riskNow).toISOString().slice(0,10),availableUsdcUnits:'13000000',allocatedUsdcUnits:'0',lossTodayUsdcUnits:'0',openPositions:0,tradesToday:0};
 risk.reserve({walletAddress:f.walletAddress,signalId:'manual:'+reservationId,reservationId,marginUsd:'10',limits,snapshot:riskSnapshot,positionAddress:ids.position,platformFeeUnits:'20000'});
 risk.holdEntryConversion({reservationId,conversionId:id,wire:f.wire,draft:{asset,side:'LONG',margin:'10',leverage:'3',referencePrice:'100'}});
 risk.close();risk=openPerpsExecutionJournal(riskPath,{now:()=>riskNow});
 assert.equal(risk.entryConversionHold(reservationId).state,'HELD');
 const firstLeg={limits,snapshot:riskSnapshot,wire:f.wire,draft:{asset,side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},conversionId:id};
 assert.equal(risk.revalidateEntryConversion(reservationId,firstLeg).state,'RESERVED');
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,conversionId:'b'.repeat(64)}));
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,draft:{...firstLeg.draft,leverage:'4'}}));
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,snapshot:{...riskSnapshot,availableUsdcUnits:'10019999'}}),/INSUFFICIENT_UNRESERVED_BALANCE/);
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,limits:{...limits,capitalUsd:'9',dailyLossUsd:'9'}}),/CAPITAL_LIMIT/);
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,snapshot:{...riskSnapshot,observedAt:riskNow-10001}}),/STALE_OR_UNRECONCILED_ACCOUNT/);
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,snapshot:{...riskSnapshot,lossTodayUsdcUnits:'10000000'}}),/DAILY_LOSS_LIMIT/);
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,snapshot:{...riskSnapshot,openPositions:1}}),/POSITION_LIMIT/);
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,{...firstLeg,snapshot:{...riskSnapshot,tradesToday:1}}),/DAILY_TRADE_LIMIT/);
 assert.equal(risk.read(reservationId).state,'RESERVED');
 assert.throws(()=>risk.cancelUnsigned(reservationId));assert.throws(()=>risk.beginSigning(reservationId));
 const recoverHeld=()=>recoverHeldPerpsEntryCollateral({executionJournal:risk,journal,reservationId,ownerAccountHash},recoveryOptions);
 await assert.rejects(()=>recoverHeldPerpsEntryCollateral({executionJournal:risk,journal,reservationId,ownerAccountHash:'e'.repeat(64)},recoveryOptions));
 f.status.confirmationStatus='confirmed';
 assert.equal((await recoverHeld()).stage,'RECORDED_ENTRY_CONVERSION_AWAITING_FINALITY');
 assert.equal(risk.entryConversionHold(reservationId).state,'HELD');f.status.confirmationStatus='finalized';
 assert.deepEqual(await recoverHeld(),bound);
 assert.equal(risk.entryConversionHold(reservationId).state,'FINALIZED');
 assert.equal(journal.read(id).state,'FINALIZED');assert.equal(journal.pending(f.walletAddress).length,0);
 assert.throws(()=>risk.revalidateEntryConversion(reservationId,firstLeg));
 assert.deepEqual(await recoverHeld(),bound);
 assert.equal(risk.read(reservationId).state,'RESERVED');
 assert.throws(()=>risk.beginSigning(reservationId));risk.beginSigning(reservationId,{entryBinding:bound});
 const convertedSnapshot={...riskSnapshot,availableUsdcUnits:'3000000'};
 assert.throws(()=>risk.revalidateSigning(reservationId,{limits,snapshot:convertedSnapshot}));
 assert.equal(risk.revalidateSigning(reservationId,{limits,snapshot:convertedSnapshot,entryBinding:bound}).state,'SIGNING');
 assert.throws(()=>risk.revalidateSigning(reservationId,{limits:{...limits,capitalUsd:'9',dailyLossUsd:'9'},snapshot:convertedSnapshot,entryBinding:bound}),/CAPITAL_LIMIT/);
 assert.throws(()=>risk.revalidateSigning(reservationId,{limits,snapshot:{...convertedSnapshot,availableUsdcUnits:'19999'},entryBinding:bound}),/INSUFFICIENT_UNRESERVED_BALANCE/);
 assert.throws(()=>risk.cancelUnsigned(reservationId));
 const readTransaction=()=>readServerPerpsTradeTransaction({walletAddress:f.walletAddress,signature:f.identity.signature,day:new Date(riskNow).toISOString().slice(0,10)},
  {...f.receiptOptions,requireTradeEvent:false});
 const transaction=await readTransaction(),historyOptions={journal:risk,swapJournal:journal,...recoveryOptions};
 const history=await readJournalledPerpsEntryConversion(transaction,historyOptions);
 assert.equal(history.stage,'FINALIZED_JOURNALED_ENTRY_CONVERSION');assert.equal(history.reservationId,reservationId);
 assert.equal(history.spentUsdcUnits,'10000000');assert.equal(history.receivedCollateralUnits,String(f.received));
 assert.equal(history.swapFeeCollateralUnits,'50');assert.equal(history.nativeSwapUsdUnits,'10000000');
 assert.equal(history.requiresIndependentUsdValuation,true);assert.equal(history.readyForSigning,false);
 assert.equal(requireVerifiedPerpsEntryConversionHistory(history,{transaction,journal:risk,swapJournal:journal}),history);
 assert.equal(await readJournalledPerpsEntryConversion(transaction,historyOptions),history);
 assert.throws(()=>requireVerifiedPerpsEntryConversionHistory({...history}));
 const emptyJournal=openPerpsExecutionJournal(join(root,'unrelated-history.sqlite'),{now:()=>riskNow});
 try{
  assert.equal(await readJournalledPerpsEntryConversion(transaction,{...historyOptions,journal:emptyJournal}),null);
  assert.throws(()=>requireVerifiedPerpsEntryConversionHistory(history,{journal:emptyJournal}));
 }finally{emptyJournal.close();}
 await assert.rejects(()=>readJournalledPerpsEntryConversion({...transaction},historyOptions));
 const beforeMeta=structuredClone(f.transaction.meta);
 try{
  const balance=f.transaction.meta.postTokenBalances.find(row=>row.accountIndex===f.index(f.wire.destination));
  balance.uiTokenAmount.amount=String(BigInt(balance.uiTokenAmount.amount)+1n);
  await assert.rejects(async()=>readJournalledPerpsEntryConversion(await readTransaction(),historyOptions));
 }finally{f.transaction.meta=beforeMeta;}
 const roles=[key(2),key(3),f.walletAddress,f.wire.destination,ids.perpetuals,PERPS_POOL,ids.position,f.c.address,f.c.dovesAgOracle,f.c.oracle,f.c.address,f.c.dovesAgOracle,f.c.oracle,f.c.tokenAccount,PERPS_PROGRAM,PERPS_PROGRAM,TOKEN,'11111111111111111111111111111111',ids.eventAuthority,PERPS_PROGRAM];
 const signers=[f.walletAddress,key(2),key(3)],readonly=[ids.perpetuals,TOKEN,'11111111111111111111111111111111',ids.eventAuthority,PERPS_PROGRAM];
 const keys=[...signers,...new Set(roles.filter(k=>!signers.includes(k)&&!readonly.includes(k))),...readonly];
 const data=Buffer.alloc(42);Buffer.from('a47e44b6dfa640b7','hex').copy(data);data.writeBigUInt64LE(30000000n,8);data[16]=1;data.writeBigUInt64LE(f.received,17);data[25]=1;data.writeBigUInt64LE(100500000n,26);data.writeBigUInt64LE(1000n,34);
 const ix={program:keys.indexOf(PERPS_PROGRAM),accounts:roles.map(k=>keys.indexOf(k)),dataBase64:data.toString('base64')};
 const inspection={stage:'INSPECTED_NOT_AUTHORIZED',observedSlot:receipt.slot,resolvedKeys:keys,envelope:{stage:'STRUCTURE_ONLY',staticKeys:keys,accountCount:keys.length,readonlySigned:1,readonlyUnsigned:readonly.length,lookups:[],instructions:[ix]}};
 const openingAccount=structuredClone(f.before.get(f.c.address)),openingBytes=Buffer.from(openingAccount.data[0],'base64');openingBytes[202]=1;openingAccount.data[0]=openingBytes.toString('base64');
 const openingMarket=decodeServerPerpsCustody(asset,f.c.address,openingAccount);
 const inspect=()=>inspectServerPerpsPreSwapPlan(inspection,intent,f.u,openingMarket,{entryBinding:bound});
 assert.equal((await inspect()).collateralUnits,String(f.received));
 await assert.rejects(inspectServerPerpsPreSwapPlan(inspection,intent,f.u,f.c));
 data.writeBigUInt64LE(f.received+1n,17);ix.dataBase64=data.toString('base64');await assert.rejects(inspect());data.writeBigUInt64LE(f.received,17);ix.dataBase64=data.toString('base64');
 inspection.observedSlot--;await assert.rejects(inspect());inspection.observedSlot++;
 const savedSource=ix.accounts[3];ix.accounts[3]=0;await assert.rejects(inspect());ix.accounts[3]=savedSource;
 const opening=await entryOpeningFixture(f,intent,bound,openingMarket);
 const simulation=await simulateServerPerpsPositionEffects(opening.prepared,{request:opening.request,monotonicNow:()=>0,entryBinding:bound});
 const checkedFunding=await checkServerPerpsFundingSimulation(opening.prepared,simulation,{request:opening.request,monotonicNow:()=>0});
 assert.equal(checkedFunding.collateralDebitUnits,String(f.received));assert.equal(checkedFunding.usdcDebitUnits,'0');assert.equal(checkedFunding.readyForSigning,false);
 // Leave less USDC than the original margin: the conversion already spent it.
 for(const map of [opening.before,opening.after])map.set(f.wire.source,f.token(f.walletAddress,f.u.mint,3000000n));
 const joined=await prepareInspectedPerpsManualOrder({asset,side:'LONG',margin:'10',leverage:'3',referencePrice:'100'},f.walletAddress,{rpcRequest:opening.request,builderRequest:opening.builderRequest,now:f.receiptOptions.now,monotonicNow:()=>0,entryBinding:bound});
 assert.equal(joined.availableUsdcUnits,'3000000');assert.equal(joined.fundingMode,'FINALIZED_ENTRY_COLLATERAL');assert.equal(joined.collateralDebitUnits,String(f.received));assert.equal(joined.readyForSigning,false);
 assert.equal(readInspectedPerpsManualReview(joined).entryBinding,bound);
 const openingRisk=openPerpsExecutionJournal(join(root,'opening-risk.sqlite'),{now:()=>riskNow});
 try{
  openingRisk.reserve({walletAddress:f.walletAddress,signalId:'manual:'+reservationId,reservationId,marginUsd:'10',limits,snapshot:riskSnapshot,positionAddress:ids.position,platformFeeUnits:'20000'});
  openingRisk.holdEntryConversion({reservationId,conversionId:id,wire:f.wire,draft:joined.draft});
  assert.throws(()=>openingRisk.bindEntryOpeningReview(reservationId,joined));
  openingRisk.finalizeEntryConversionHold(reservationId,bound);
  assert.throws(()=>openingRisk.bindEntryOpeningReview(reservationId,{...joined}));
  const boundRow=openingRisk.bindEntryOpeningReview(reservationId,joined);
  assert.equal(boundRow.entry_exit_plan,JSON.stringify(readInspectedPerpsManualReview(joined).entryExitPlan));
  assert.equal(boundRow.state,'RESERVED');assert.equal(boundRow.signature,null);
  assert.deepEqual(openingRisk.bindEntryOpeningReview(reservationId,joined),boundRow);
  const harness=entryServiceReviewHarness(root,f,opening,{risk:openingRisk,journal,ownerAccountHash,limits});
  try{
   const request={...harness.who,draft:joined.draft,entryReservationId:reservationId};
   await assert.rejects(()=>harness.service.prepare({...request,ownerAccountHash:'e'.repeat(64)}));
   await assert.rejects(()=>harness.service.prepare({...request,draft:{...joined.draft,leverage:'4'}}));
   const serviceReview=await harness.service.prepare(request);
   assert.equal(serviceReview.entryReservationId,reservationId);assert.equal(serviceReview.fundingMode,'FINALIZED_ENTRY_COLLATERAL');
   assert.equal(serviceReview.submitted,false);assert.equal(openingRisk.pending(f.walletAddress).length,1);
   assert.equal(openingRisk.read(reservationId).state,'RESERVED');
   await assert.rejects(()=>harness.service.confirm({...harness.who,id:serviceReview.id,explicitApproval:false}));
   assert.equal(openingRisk.read(reservationId).signature,null);
  }finally{harness.close();}
  openingRisk.beginSigning(reservationId,{entryBinding:bound});
  assert.throws(()=>openingRisk.bindEntryOpeningReview(reservationId,joined));
 }finally{openingRisk.close();}
 assert.equal(readBoundPerpsEntryCollateral(bound),bound);assert.throws(()=>readBoundPerpsEntryCollateral({...bound}));
 assert.throws(()=>bindFinalizedPerpsEntryConversion({...input,ownerAccountHash:'e'.repeat(64)}));
 assert.throws(()=>bindFinalizedPerpsEntryConversion({...input,receipt:{...receipt}}));
 assert.equal(journal.read(id).state,'FINALIZED');assert.equal(readBoundPerpsEntryCollateral(bound),bound);
 // Simulated opening spends only this conversion's delta, preserving the
 // seventeen pre-existing collateral units and the remaining USDC unchanged.
 const payer=f.walletAddress,source=f.wire.destination,usdc=f.wire.source;
 const before={[payer]:structuredClone(f.after.get(payer)),[source]:structuredClone(f.after.get(source)),[usdc]:structuredClone(f.after.get(usdc))};
 const after=structuredClone(before);after[payer].lamports-=5400;
 after[source]=f.token(payer,f.c.mint,17n);
 const funding={binding:bound,payer,source,feeLamports:'5400',before,after};
 const result=inspectServerPerpsEntryCollateralFunding(funding);
 assert.equal(result.collateralDebitUnits,String(f.received));assert.equal(result.usdcDebitUnits,'0');assert.equal(result.spentUsdcUnits,'10000000');
 for(const delta of [-1n,1n]){
  const altered=structuredClone(after);altered[source]=f.token(payer,f.c.mint,17n+delta);
  assert.throws(()=>inspectServerPerpsEntryCollateralFunding({...funding,after:altered}));
 }
 const stolen=structuredClone(after);stolen[usdc]=f.token(payer,f.u.mint,9999999n);
 assert.throws(()=>inspectServerPerpsEntryCollateralFunding({...funding,after:stolen}));
 assert.throws(()=>inspectServerPerpsEntryCollateralFunding({...funding,binding:{...bound}}));
 // Full collateral consumption may close its ATA. For WSOL, only the
 // residual rent returns to the payer, not the spent wrapped SOL principal.
 const closeBefore=structuredClone(before),closeAfter=structuredClone(after);
 closeBefore[source]=f.token(payer,f.c.mint,f.received);closeAfter[source]=null;
 const refundable=BigInt(closeBefore[source].lamports)-(asset==='SOL'?f.received:0n);
 closeAfter[payer].lamports=Number(BigInt(closeBefore[payer].lamports)-5400n+refundable);
 const closed=inspectServerPerpsEntryCollateralFunding({...funding,before:closeBefore,after:closeAfter});
 assert.equal(closed.rentRefundedLamports,String(refundable));
 if(asset==='SOL'){
  const invented=structuredClone(closeAfter);invented[payer].lamports+=Number(f.received);
  assert.throws(()=>inspectServerPerpsEntryCollateralFunding({...funding,before:closeBefore,after:invented}));
 }
 // Even a legitimate journal transition while RPC is in flight invalidates
 // that recovery attempt; the caller must request a new coherent snapshot.
 await assert.rejects(()=>recoverRecordedPerpsEntryCollateral({journal,id,ownerAccountHash},{...recoveryOptions,request:async(method,params)=>{
  const result=await recoveryRequest(method,params);
  if(method==='getGenesisHash'){const db=new DatabaseSync(join(root,'swaps.sqlite'));try{db.prepare('UPDATE bot_wallet_swaps SET updated=updated+1 WHERE id=?').run(id);}finally{db.close();}}
  return result;
 }}));
 assert.deepEqual(await recoverHeld(),bound);
 assert.throws(()=>requireVerifiedPerpsEntryConversionHistory(history));
 const refreshedHistory=await readJournalledPerpsEntryConversion(transaction,historyOptions);
 assert.notEqual(refreshedHistory,history);
 f.expire();assert.throws(()=>readBoundPerpsEntryCollateral(bound));
 assert.equal(requireVerifiedPerpsEntryConversionHistory(refreshedHistory),refreshedHistory);
});
