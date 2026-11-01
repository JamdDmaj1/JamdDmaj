import test from 'node:test';
import assert from 'node:assert/strict';
import {createBotManualPerpsClient} from '../lib/bot-manual-perps-client.js';
import {quotePerpsPlatformFee} from '../lib/perps-platform-fee.js';
import {perpsNavigationDraft} from '../lib/perps-navigation.js';
const wallet='11111111111111111111111111111112',at=Date.now(),draft=perpsNavigationDraft({asset:'BTC',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'});
const review=()=>({stage:'BOT_MANUAL_REVIEW',id:'11111111-1111-4111-8111-111111111111',walletAddress:wallet,draft,expiresAt:at+10000,submitted:false,
 marginUsdcUnits:'10000000',networkFeeLamports:'5000',rentLockedLamports:'1000000',fee:quotePerpsPlatformFee('10000000')});
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
 for(const change of [{walletAddress:'11111111111111111111111111111113'},{expiresAt:at-1},{draft:{...draft,referencePrice:'101'}},{fee:{...quotePerpsPlatformFee('10000000'),recipient:wallet}}]){
  const client=createBotManualPerpsClient({now:()=>at,readSessionToken:()=> 'a'.repeat(64),fetchImpl:async()=>Response.json({ok:true,botManual:{...review(),...change}})});
  await assert.rejects(client.prepare(wallet,draft));
 }
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
