import test from 'node:test';
import assert from 'node:assert/strict';
import {conversionReceiptFixture} from './helpers/perps-conversion-receipt-fixture.mjs';
import {readFinalizedPerpsEntryConversionReceipt,requireVerifiedPerpsEntryConversionReceipt,requireVerifiedPerpsCloseConversionReceipt} from '../lib/perps-close-conversion-receipt.js';

test('finalized entry receipt measures only new collateral for every market and ATA state',async()=>{
 for(const asset of ['BTC','ETH','SOL'])for(const newEntryDestination of [false,true]){
  const f=await conversionReceiptFixture({entry:true,asset,newEntryDestination});
  const r=await readFinalizedPerpsEntryConversionReceipt(f.wire,f.identity,f.receiptOptions);
  assert.equal(r.receivedCollateralUnits,String(f.received));assert.equal(r.spentUsdcUnits,'10000000');
  assert.equal(r.stage,'FINALIZED_PROTECTED_ENTRY_COLLATERAL_ONLY');assert.equal(r.readyForSigning,false);
  assert.equal(requireVerifiedPerpsEntryConversionReceipt(r),r);
  assert.throws(()=>requireVerifiedPerpsEntryConversionReceipt({...r}));
  assert.throws(()=>requireVerifiedPerpsCloseConversionReceipt(r));
  f.expire();assert.throws(()=>requireVerifiedPerpsEntryConversionReceipt(r));
 }
});

test('entry receipt rejects altered received balance, vault, event, identity and nonfinal status',async()=>{
 for(const mode of ['balance','vault','event','hash','status']){
  const f=await conversionReceiptFixture({entry:true});
  if(mode==='balance')f.transaction.meta.postTokenBalances.find(x=>x.accountIndex===f.index(f.wire.destination)).uiTokenAmount.amount='17';
  if(mode==='vault')f.transaction.meta.postTokenBalances.find(x=>x.accountIndex===f.index(f.c.tokenAccount)).uiTokenAmount.amount='1';
  if(mode==='event')f.transaction.meta.innerInstructions[0].instructions.pop();
  if(mode==='hash')f.identity.wireHash='0'.repeat(64);
  if(mode==='status')f.status.confirmationStatus='confirmed';
  if(mode==='status')assert.equal(await readFinalizedPerpsEntryConversionReceipt(f.wire,f.identity,f.receiptOptions),null);
  else await assert.rejects(readFinalizedPerpsEntryConversionReceipt(f.wire,f.identity,f.receiptOptions),mode);
 }
});
