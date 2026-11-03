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
import {inspectServerPerpsPreSwapPlan} from '../lib/perps-server-preswap.js';
import {PERPS_PROGRAM,PERPS_POOL,deriveServerPerpsIdentities,decodeServerPerpsCustody} from '../lib/perps-server-custody.js';
import bs58 from 'bs58';
import {entryOpeningFixture} from './helpers/perps-entry-opening-fixture.mjs';
import {simulateServerPerpsPositionEffects} from '../lib/perps-server-simulation.js';
import {checkServerPerpsFundingSimulation} from '../lib/perps-server-funding-simulation.js';
import {prepareInspectedPerpsManualOrder,readInspectedPerpsManualReview} from '../lib/perps-manual-preparation.js';

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
 const ids=await deriveServerPerpsIdentities(intent),key=n=>bs58.encode(Buffer.alloc(32,n)),TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
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
