import test from 'node:test';
import assert from 'node:assert/strict';
import {createBotManualPerpsClient} from '../lib/bot-manual-perps-client.js';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
import {perpsNavigationDraft} from '../lib/perps-navigation.js';
import {performanceFromTotals} from '../lib/closed-trade-performance.js';
const wallet='11111111111111111111111111111112',at=Date.now(),draft=perpsNavigationDraft({asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'});
const review=()=>({stage:'BOT_MANUAL_REVIEW',id:'11111111-1111-4111-8111-111111111111',walletAddress:wallet,draft,expiresAt:at+10000,submitted:false,
 marginUsdcUnits:'10000000',networkFeeLamports:'5000',rentLockedLamports:'1000000',fee:quotePerpsPlatformFee('10000000')});

test('closed history reads once without trading and refuses fabricated PnL or uncertain closes',async()=>{
 const item={id:'manual-close:11111111-1111-4111-8111-111111111111',positionAddress:wallet,asset:'BTC',side:'SHORT',openedAt:at-10000,closedAt:at-1000,state:'COMPLETED',receivedUsdcUnits:'9980000',netPnlUsdcUnits:null,firstLegNetworkFeeLamports:'5000',firstLegSignature:'2'.repeat(88),conversionSignature:null};
 let rows=[item],calls=0;
 const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=>'a'.repeat(64),fetchImpl:async(_url,options)=>{calls++;assert.deepEqual(JSON.parse(options.body),{action:'botManualHistory',walletAddress:wallet});return Response.json({ok:true,botManual:{stage:'BOT_MANUAL_CLOSED_HISTORY',walletAddress:wallet,items:rows,hasMore:false}});}});
 assert.equal((await client.history(wallet)).items[0].receivedUsdcUnits,'9980000');
 for(const mutation of [{state:'UNCERTAIN'},{netPnlUsdcUnits:'0'},{closedAt:at+99999},{firstLegSignature:'javascript:bad'},{receivedUsdcUnits:'-1'},{performance:{version:1,basisUsdcUnits:'10000000',openingPlatformFeeUsdcUnits:'20000',resultUsdcUnits:'9980000',returnBps:'9980',excludesSolNetworkCosts:true}}]){rows=[{...item,...mutation}];await assert.rejects(client.history(wallet));}
 assert.equal(calls,7);rows=[{...item,performance:performanceFromTotals('10000000','20000',item.receivedUsdcUnits)}];assert.equal((await client.history(wallet)).items[0].performance.resultUsdcUnits,'-40000');
});
const recoveryReview=()=>({stage:'BOT_MANUAL_ENTRY_RECOVERY_REVIEW',id:review().id,reservationId:review().id,walletAddress:wallet,
 asset:'BTC',amountUnits:'9970000',minimumUsdcUnits:'9920150',maxSlippageBps:50,networkFeeLamports:'5400',rentLockedLamports:'0',
 platformFeeUsdcUnits:'0',submitted:false,expiresAt:at+9000,requiresExplicitRecoveryConfirmation:true});

test('recovery requires its own session-bound one-use consent and never retries a lost response',async()=>{
 let token='a'.repeat(64),sends=0;
 const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=>token,fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(body.action==='botManualRecoveryPrepare')return Response.json({ok:true,botManual:recoveryReview()});
  assert.equal(body.action,'botManualRecoveryConfirm');assert.deepEqual(Object.keys(body).sort(),['action','explicitApproval','id','walletAddress']);sends++;throw Error('MOCK_RESPONSE_LOST');
 }});
 const r=await client.prepareRecovery(wallet,review().id);
 await assert.rejects(client.confirmRecovery({...r},true));await assert.rejects(client.confirmRecovery(r,false));
 await assert.rejects(client.confirm(r,true,true));assert.equal(sends,0);
 await assert.rejects(client.confirmRecovery(r,true));assert.equal(sends,1);
 await assert.rejects(client.confirmRecovery(r,true));assert.equal(sends,1);
 const second=await client.prepareRecovery(wallet,review().id);token='b'.repeat(64);
 await assert.rejects(client.confirmRecovery(second,true));assert.equal(sends,1);
});

test('recovery client refuses widened tolerance, changed original reservation, fees and unsafe minima',async()=>{
 for(const change of [{maxSlippageBps:500},{reservationId:'22222222-2222-4222-8222-222222222222'},
  {platformFeeUsdcUnits:'1'},{minimumUsdcUnits:'0'},{amountUnits:'18446744073709551616'},{expiresAt:at-1},{requiresExplicitRecoveryConfirmation:false}]){
  const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=> 'a'.repeat(64),fetchImpl:async()=>Response.json({ok:true,botManual:{...recoveryReview(),...change}})});
  await assert.rejects(client.prepareRecovery(wallet,review().id));
 }
});
test('bot manual client requires a session and two consents, bound to the original one-use review',async()=>{
 let token='a'.repeat(64),sends=0;
 const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=>token,fetchImpl:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer '+token);const b=JSON.parse(options.body);
  assert.equal(b.walletAddress,wallet);
  if(b.action==='botManualPrepare')return Response.json({ok:true,botManual:review()});
  assert.equal(b.action,'botManualConfirm');sends++;return Response.json({ok:true,botManual:{walletAddress:wallet,id:b.id,state:'UNCERTAIN'}});
 }});
 const r=await client.prepare(wallet,draft);
 for(const approvals of [[false,true],[true,false]])await assert.rejects(client.confirm(r,...approvals));
 await assert.rejects(client.confirm({...r},true,true));assert.equal(sends,0);
 await client.confirm(r,true,true);assert.equal(sends,1);await assert.rejects(client.confirm(r,true,true));assert.equal(sends,1);
 const second=await client.prepare(wallet,draft);token='b'.repeat(64);await assert.rejects(client.confirm(second,true,true));assert.equal(sends,1);
 token=null;await assert.rejects(client.status(wallet));
});
test('wrong-wallet, expired, modified price and modified fee reviews are refused before confirmation',async()=>{
 for(const change of [{walletAddress:'11111111111111111111111111111113'},{expiresAt:at-1},{draft:{...draft,referencePrice:'101'}},{fee:{...quotePerpsPlatformFee('10000000'),basisPoints:21}}]){
  const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=> 'a'.repeat(64),fetchImpl:async()=>Response.json({ok:true,botManual:{...review(),...change}})});
  await assert.rejects(client.prepare(wallet,draft));
 }
});

test('conversion and continuation reviews retain separate one-use consents and exact reservation identity',async()=>{
 const id=review().id,conversion={...review(),stage:'BOT_MANUAL_ENTRY_CONVERSION_REVIEW',maxSlippageBps:50,
  minimumCollateralUnits:'9950000',collateralMint:wallet,requiresSeparateOpeningConfirmation:true};
 let reply=conversion,sends=0;
 const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=> 'a'.repeat(64),fetchImpl:async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(body.action==='botManualPrepare'){
   if(reply.entryReservationId)assert.equal(body.entryReservationId,id);else assert.equal(body.entryReservationId,undefined);
   return Response.json({ok:true,botManual:reply});
  }
  assert.equal(body.action,'botManualConfirm');sends++;return Response.json({ok:true,botManual:{walletAddress:wallet,id,state:'RESERVED'}});
 }});
 const first=await client.prepare(wallet,draft);await assert.rejects(client.confirm(first,true,false));assert.equal(sends,0);
 await client.confirm(first,true,true);await assert.rejects(client.confirm(first,true,true));assert.equal(sends,1);
 reply={...review(),entryReservationId:id};const second=await client.prepare(wallet,draft,{entryReservationId:id});
 await assert.rejects(client.confirm(second,false,true));assert.equal(sends,1);
 await client.confirm(second,true,true);assert.equal(sends,2);
 for(const change of [{maxSlippageBps:500},{requiresSeparateOpeningConfirmation:false},{minimumCollateralUnits:'0'},{collateralMint:''}]){
  reply={...conversion,...change};await assert.rejects(client.prepare(wallet,draft));
 }
 reply={...review(),entryReservationId:'22222222-2222-4222-8222-222222222222'};
 await assert.rejects(client.prepare(wallet,draft,{entryReservationId:id}));
 await assert.rejects(client.prepare(wallet,draft));assert.equal(sends,2);
});

test('manual close requires its original price-protected review and separate consent, with no automatic resubmission',async()=>{
 let sends=0;
 const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=> 'a'.repeat(64),fetchImpl:async(_url,options)=>{
  const b=JSON.parse(options.body);
  if(b.action==='botManualClosePrepare')return Response.json({ok:true,botManual:{stage:'BOT_MANUAL_CLOSE_REVIEW',id:'manual-close:11111111-1111-4111-8111-111111111111',walletAddress:wallet,positionAddress:wallet,referencePrice:'100',submitted:false,expiresAt:at+10000,protection:{settlementProtection:'NATIVE_PRICE_THEN_USDC_MINIMUM',firstLegAbsoluteMinimum:null,estimatesAreGuaranteed:false}}});
  assert.equal(b.action,'botManualCloseConfirm');sends++;throw Error('connection lost');
 }});
 const r=await client.prepareClose(wallet,wallet,'100');
 await assert.rejects(client.confirmClose({...r},true));await assert.rejects(client.confirmClose(r,false));assert.equal(sends,0);
 await assert.rejects(client.confirmClose(r,true));assert.equal(sends,1);
 await assert.rejects(client.confirmClose(r,true));assert.equal(sends,1);
});
