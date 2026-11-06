// Complete one-entry finalized-history model, never a live price or transaction.
import assert from 'node:assert/strict';
import {createPerpsEntryConversionUsdValuationReader} from '../../lib/perps-entry-conversion-usd-valuation.js';
import {createPerpsNetworkFeeValuationReader} from '../../lib/perps-network-fee-valuation.js';
export function entryDailyAccountFixture(f,{journal,swapJournal,inputHigh='1.01',collateralLow='99',collateralHigh='101'}){
 let now=f.receiptOptions.now()+120000,historyVisible=true;const minute=Math.floor(f.transaction.blockTime/60)*60,calls=[];
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);calls.push(u.href);assert.equal(options.method,'GET');
  if(u.hostname==='api.exchange.coinbase.com')return Response.json([[minute,99,100,99.5,99.5,1]]);
  assert.equal(u.hostname,'api.kraken.com');assert.equal(u.searchParams.get('assetVersion'),'1');
  const input=u.searchParams.get('pair')==='USDCUSD',pair=input?'USDC/USD':f.c.asset+'/USD';
  const low=input?'0.99':collateralLow,high=input?inputHigh:collateralHigh,mid=input?'1':collateralLow;
  return Response.json({error:[],result:{[pair]:[[minute,mid,high,low,mid,mid,'1',1],[minute+120,mid,high,low,mid,mid,'1',1]],last:minute+120}});
 };
 const request=async(method,params)=>{
  if(method==='getMultipleAccounts')return {context:{slot:200},value:params[0].map(key=>f.after.get(key)??f.before.get(key)??null)};
  if(method==='getSlot')return 200;if(method==='getBlocks')return [1];if(method==='getFirstAvailableBlock')return 0;
  if(method==='getBlockTime')return now/1000-(params[0]===200?5:172800);
  if(method==='getSignaturesForAddress')return historyVisible&&params[0]===f.walletAddress?[{signature:f.identity.signature,slot:f.transaction.slot,blockTime:f.transaction.blockTime,err:null,confirmationStatus:'finalized'}]:[];
  return f.request(method,params);
 };
 const common={now:()=>now,monotonicNow:()=>0,fetchImpl};
 return {fetchImpl,calls,common,setHistoryVisible:value=>{historyVisible=value;},setNow:value=>{now=value;},options:{...common,request,journal,swapJournal,
  readEntryConversionLoss:createPerpsEntryConversionUsdValuationReader(common),readNetworkFees:createPerpsNetworkFeeValuationReader(common)}};
}
