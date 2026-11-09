import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {buildPlaceMarketOrderIx,OrderFlags} from '@ellipsis-labs/rise';
import {decodePhoenixCatalog,planPhoenixOrder,phoenixUsd,PHOENIX_IDENTITIES,requirePhoenixUnsignedPlan,clampPhoenixClosePlan,clampPhoenixEntryPlan} from '../lib/phoenix-market-plan.js';
import {buildPhoenixUnsignedInstructions} from '../lib/phoenix-unsigned-instructions.js';
import {createPhoenixPublicClient} from '../lib/phoenix-public-client.js';
const now=1800000000000,key=n=>bs58.encode(Uint8Array.from({length:32},(_,i)=>i===31?n:0)),wallet=key(12);
const row={symbol:'DOGE',assetId:7,marketStatus:'active',metadata:{assetClass:'crypto'},marketPubkey:key(20),splinePubkey:key(21),tickSize:1,baseLotsDecimals:0,takerFee:0.00035,leverageTiers:[{maxLeverage:10,maxSizeBaseLots:1000000}]};
const catalog=decodePhoenixCatalog([row],{observedAt:now});
const plan=(overrides={})=>planPhoenixOrder({catalog,walletAddress:wallet,symbol:'DOGE',side:'LONG',marginUsdcUnits:'10000000',leverageTenths:30,referencePrice:'0.123456',observedSlot:1000,clientOrderId:'12345',isolatedSubaccountIndex:1,now,...overrides});

test('entry refresh keeps original FOK size, collateral, exposure cap and stricter absolute ticks',()=>{
 for(const side of ['LONG','SHORT']){
  const original=plan({side});
  for(const referencePrice of ['0.12','0.13']){
   const fresh=plan({side,referencePrice,observedSlot:1001}),p=clampPhoenixEntryPlan(fresh,original);
   assert.equal(p.baseLots,original.baseLots);assert.equal(p.packet.numBaseLots,original.packet.numBaseLots);
   assert.equal(p.packet.minBaseLotsToFill,original.packet.minBaseLotsToFill);assert.equal(p.packet.numQuoteLots,original.packet.numQuoteLots);
   assert.equal(p.maxNotionalUsdcUnits,original.maxNotionalUsdcUnits);assert.equal(p.marginUsdcUnits,original.marginUsdcUnits);
   assert.equal(p.packet.lastValidSlot,1031n);
   assert.ok(side==='LONG'?p.packet.priceInTicks<=original.packet.priceInTicks:p.packet.priceInTicks>=original.packet.priceInTicks);
  }
 }
 const original=plan();
 for(const changed of [{side:'SHORT'},{marginUsdcUnits:'11000000'},{leverageTenths:40},{isolatedSubaccountIndex:2},{closeBaseLots:'240'}])
  assert.throws(()=>clampPhoenixEntryPlan(plan(changed),original));
 assert.throws(()=>clampPhoenixEntryPlan({...original},original));
 const higher=decodePhoenixCatalog([{...row,takerFee:0.0004}],{observedAt:now});assert.throws(()=>clampPhoenixEntryPlan(plan({catalog:higher}),original));
});
test('crypto catalog uses native asset identity; inactive assets are not executable and DTO never grants signing',()=>{
 assert.equal(catalog.readyForSigning,false);assert.equal(catalog.markets[0].assetId,7);assert.equal(catalog.markets[0].symbol,'DOGE');assert.throws(()=>decodePhoenixCatalog([row,row]),/MARKET/);
 assert.throws(()=>plan({symbol:'kDOGE'}),/INTENT/);assert.throws(()=>plan({catalog:{...catalog}}),/EXPIRED/);assert.throws(()=>plan({now:now+16000}),/EXPIRED/);
 assert.throws(()=>plan({catalog:decodePhoenixCatalog([{...row,marketStatus:'close_only'}],{observedAt:now})}),/INTENT/);
});
test('official SDK packet retains exact tighter 0.5% ticks, FOK size, isolated account and bounded quote spend',()=>{
 for(const side of ['LONG','SHORT']){const p=plan({side}),ref=phoenixUsd(p.referencePrice),px=phoenixUsd(p.priceLimitUsd);assert.equal(p.readyForSigning,false);assert.equal(p.packet.minBaseLotsToFill,p.packet.numBaseLots);assert.notEqual(p.packet.priceInTicks,null);assert.equal(p.packet.cancelExisting,false);assert.equal(p.packet.lastValidSlot,1030n);assert.equal(p.packet.numQuoteLots,BigInt(p.maxNotionalUsdcUnits));assert.ok(side==='LONG'?px*10000n<=ref*10050n:px*10000n>=ref*9950n);}
 assert.throws(()=>plan({isolatedSubaccountIndex:0}),/INTENT/);assert.throws(()=>plan({marginUsdcUnits:'999999'}),/MARGIN/);assert.throws(()=>plan({leverageTenths:110}),/SIZE_TIER/);assert.throws(()=>requirePhoenixUnsignedPlan({...plan()}),/UNVERIFIED_PLAN/);
});
test('full close is reduce-only FOK and has no deposit or notional-growth instructions',()=>{
 const p=plan({closeBaseLots:'240',side:'SHORT'});assert.equal(p.packet.orderFlags,OrderFlags.ReduceOnly);assert.equal(p.marginUsdcUnits,'0');assert.equal(p.packet.numQuoteLots,null);assert.equal(p.packet.numBaseLots,240n);assert.equal(p.packet.minBaseLotsToFill,240n);
});

test('refreshed full close keeps the stricter of the original and current 0.5% bounds',()=>{
 for(const side of ['LONG','SHORT']){
  const original=plan({closeBaseLots:'240',side});
  for(const referencePrice of ['0.12','0.13']){
   const current=plan({closeBaseLots:'240',side,referencePrice}),clamped=clampPhoenixClosePlan(current,original);
   assert.equal(requirePhoenixUnsignedPlan(clamped),clamped);
   assert.ok(side==='LONG'?clamped.packet.priceInTicks<=original.packet.priceInTicks&&clamped.packet.priceInTicks<=current.packet.priceInTicks:
    clamped.packet.priceInTicks>=original.packet.priceInTicks&&clamped.packet.priceInTicks>=current.packet.priceInTicks);
   assert.equal(clamped.packet.orderFlags,OrderFlags.ReduceOnly);assert.equal(clamped.packet.numBaseLots,240n);
  }
  assert.throws(()=>clampPhoenixClosePlan(plan({closeBaseLots:'241',side}),original),/CLOSE_CHANGED/);
  const raised=decodePhoenixCatalog([{...row,takerFee:0.001}],{observedAt:now});
  assert.throws(()=>clampPhoenixClosePlan(plan({catalog:raised,closeBaseLots:'240',side}),original),/CLOSE_CHANGED/);
  assert.throws(()=>clampPhoenixClosePlan({...original},original),/UNVERIFIED_PLAN/);
 }
});
test('negative native lot decimals represent 100-token lots, never a 100x symbol substitution',()=>{
 const c=decodePhoenixCatalog([{...row,symbol:'PUMP',tickSize:10,baseLotsDecimals:-2}],{observedAt:now});
 const p=plan({catalog:c,symbol:'PUMP',referencePrice:'0.002'});assert.equal(p.market.symbol,'PUMP');assert.equal(p.packet.numBaseLots,BigInt(p.baseLots));assert.equal(p.packet.minBaseLotsToFill,p.packet.numBaseLots);assert.ok(phoenixUsd(p.priceLimitUsd)*10000n<=phoenixUsd('0.002')*10050n);
});
test('sub-micro price references keep the exact 0.5% ceiling without rounding first',()=>{
 const c=decodePhoenixCatalog([{...row,symbol:'SMALL',tickSize:1,baseLotsDecimals:-2}],{observedAt:now});
 for(const side of ['LONG','SHORT']){
  const p=plan({catalog:c,symbol:'SMALL',referencePrice:'0.000001234567',side});
  // Price-limit decimals are at most eight for this market. Compare rationals
  // directly to the original 12-place reference, not rounded display numbers.
  const px=BigInt(p.priceLimitUsd.replace('.','').padEnd(13,'0'));
  const ref=1234567n;
  assert.ok(side==='LONG'?px*10000n<=ref*10050n:px*10000n>=ref*9950n);
 }
 assert.throws(()=>plan({observedSlot:Number.MAX_SAFE_INTEGER}),/INTENT/);
});
function sdkClient({badData=false}={}){let deposited=false;return {get deposited(){return deposited;},ixs:{async buildPlaceMarketOrder({authority,orderPacket}){const instruction=buildPlaceMarketOrderIx({trader:authority,traderAccount:key(30),perpAssetMap:key(31),orderbook:row.marketPubkey,splineCollection:row.splinePubkey,activeTraderBuffer:[key(32)],globalTraderIndex:[key(33)],orderPacket});if(badData){instruction.data=new Uint8Array(instruction.data);instruction.data[instruction.data.length-1]^=1;}return instruction;},async buildDepositIxs(){deposited=true;const emberDeposit={programAddress:PHOENIX_IDENTITIES.ember},depositFunds={programAddress:PHOENIX_IDENTITIES.program};return {instructions:[{programAddress:key(40)},emberDeposit,depositFunds],named:{emberDeposit,depositFunds}};}}};}
test('actual SDK instruction bytes round trip; altered data rejects and close stays independent from withdrawal',async()=>{
 const client=sdkClient();const result=await buildPhoenixUnsignedInstructions(plan(),{client,now:()=>now});assert.equal(result.readyForSigning,false);assert.equal(result.instructions.length,4);assert.equal(result.requiresIndependentAccountAndTokenPolicy,true);
 const closingClient=sdkClient();const close=await buildPhoenixUnsignedInstructions(plan({closeBaseLots:'240',side:'SHORT'}),{client:closingClient,now:()=>now});assert.equal(close.instructions.length,1);assert.equal(closingClient.deposited,false);
 await assert.rejects(()=>buildPhoenixUnsignedInstructions(plan(),{client:sdkClient({badData:true}),now:()=>now}));
});
test('public client has one fixed read-only route and sends no session, onboarding or trade action',async()=>{
 const calls=[],client=createPhoenixPublicClient({now:()=>now,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,redirected:false,text:async()=>JSON.stringify([row])};}});await client.catalog();assert.equal(calls.length,1);assert.equal(calls[0].url,'https://perp-api.phoenix.trade/v1/view/exchange/markets');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.body,undefined);
});
