import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {readFinalizedPerpsEntryConversionReceipt} from '../lib/perps-close-conversion-receipt.js';
import {bindFinalizedPerpsEntryConversion,readBoundPerpsEntryCollateral} from '../lib/perps-entry-conversion-binding.js';

test('entry collateral is bound to the exact durable owner-signed intent, never merely a balance',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jamd-entry-binding-'));chmodSync(root,0o700);
 const f=await conversionReceiptFixture({entry:true}),ownerAccountHash='f'.repeat(64),id='a'.repeat(64);
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
 assert.equal(readBoundPerpsEntryCollateral(bound),bound);assert.throws(()=>readBoundPerpsEntryCollateral({...bound}));
 assert.throws(()=>bindFinalizedPerpsEntryConversion({...input,ownerAccountHash:'e'.repeat(64)}));
 assert.throws(()=>bindFinalizedPerpsEntryConversion({...input,receipt:{...receipt}}));
 journal.settle(id,f.identity.signature,'FINALIZED');assert.equal(readBoundPerpsEntryCollateral(bound),bound);
 f.expire();assert.throws(()=>readBoundPerpsEntryCollateral(bound));
});
