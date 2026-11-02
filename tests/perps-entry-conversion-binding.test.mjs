import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {readFinalizedPerpsEntryConversionReceipt} from '../lib/perps-close-conversion-receipt.js';
import {bindFinalizedPerpsEntryConversion,readBoundPerpsEntryCollateral} from '../lib/perps-entry-conversion-binding.js';
import {inspectServerPerpsEntryCollateralFunding} from '../lib/perps-server-funding.js';
import {planProtectedPerpsCollateralLong,prepareProtectedPerpsCollateralLong} from '../lib/perps-entry-collateral-preparation.js';

for(const asset of ['BTC','ETH','SOL'])test('entry collateral binds exact signed intent and opening debit: '+asset,async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-entry-binding-'));chmodSync(root,0o700);
 const f=await conversionReceiptFixture({entry:true,asset}),ownerAccountHash='f'.repeat(64),id='a'.repeat(64);
 const journal=openBotSwapJournal(join(root,'swaps.sqlite'),{initialize:true,explicitOperatorApproval:true,allowNonPosixForTests:process.platform==='win32',now:f.receiptOptions.now});
 t.after(()=>{journal.close();rmSync(root,{recursive:true,force:true});});
 const receipt=await readFinalizedPerpsEntryConversionReceipt(f.wire,f.identity,f.receiptOptions);
 const review={id,stage:'PROTECTED_ENTRY_CONVERSION_PREPARED',walletAddress:f.walletAddress,controlRevision:'1',maxSlippageBps:50,draft:{side:'LONG',asset:f.wire.asset},usdcUnits:f.wire.usdcUnits,minimumCollateralUnits:f.wire.minimumCollateralUnits,collateralMint:receipt.collateralMint,collateralDecimals:receipt.collateralDecimals,observedSlot:105,networkFeeLamports:'5400'};
 const claim=journal.claim({id,ownerAccountHash,walletAddress:f.walletAddress,revision:'1',review,message:Buffer.from(f.wire.messageBase64,'base64')});
 journal.signed(claim,f.transaction.transaction[0]);
 const input={journal,id,ownerAccountHash,wire:f.wire,receipt};
 assert.throws(()=>bindFinalizedPerpsEntryConversion(input));
 journal.beginBroadcast(claim,{address:f.walletAddress,signature:f.identity.signature,lastValidBlockHeight:f.wire.lastValidBlockHeight});
 const bound=bindFinalizedPerpsEntryConversion(input);assert.equal(bound.receivedCollateralUnits,String(f.received));assert.equal(bound.readyForSigning,false);
 const intent={walletAddress:f.walletAddress,asset,side:'LONG',marginUsd:'10',leverage:3,maxSlippageBps:50,referencePrice:'100'};
 const plan=planProtectedPerpsCollateralLong(bound,intent);assert.equal(plan.body.inputToken,asset);assert.equal(plan.body.inputTokenAmount,String(f.received));assert.equal(plan.body.maxSlippageBps,'25');
 for(const wrong of [{side:'SHORT'},{marginUsd:'11'},{maxSlippageBps:500},{asset:asset==='BTC'?'ETH':'BTC'}])assert.throws(()=>planProtectedPerpsCollateralLong(bound,{...intent,...wrong}));
 let builds=0;const packet=await prepareProtectedPerpsCollateralLong(bound,intent,async(url,options)=>{
  builds++;assert.equal(url,'https://perps-api.jup.ag/v1/positions/increase');assert.equal(options.headers['x-perps-api-version'],'v2');assert.deepEqual(JSON.parse(options.body),plan.body);
  return Response.json({serializedTxBase64:f.wire.serializedTxBase64,positionPubkey:f.c.address,quote:{side:'long'},txMetadata:{blockhash:f.wire.blockhash,lastValidBlockHeight:f.wire.lastValidBlockHeight}});
 });
 assert.equal(builds,1);assert.equal(packet.readyForSigning,false);assert.equal(packet.stage,'UNVERIFIED_PREPARATION');assert.equal(packet.requiresIndependentCollateralIntentInspection,true);
 assert.equal(readBoundPerpsEntryCollateral(bound),bound);assert.throws(()=>readBoundPerpsEntryCollateral({...bound}));
 assert.throws(()=>bindFinalizedPerpsEntryConversion({...input,ownerAccountHash:'e'.repeat(64)}));
 assert.throws(()=>bindFinalizedPerpsEntryConversion({...input,receipt:{...receipt}}));
 journal.settle(id,f.identity.signature,'FINALIZED');assert.equal(readBoundPerpsEntryCollateral(bound),bound);
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
 f.expire();assert.throws(()=>readBoundPerpsEntryCollateral(bound));
});
