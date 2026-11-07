// Two finalized swaps, no opening transaction. Explicit mocked transports only.
import {createPerpsEntryConversionUsdValuationReader} from '../../lib/perps-entry-conversion-usd-valuation.js';
import {createPerpsEntryRecoveryUsdValuationReader} from '../../lib/perps-entry-recovery-usd-valuation.js';
import {createPerpsNetworkFeeValuationReader} from '../../lib/perps-network-fee-valuation.js';
export function unsignedRecoveryAccountFixture(initial,returned,{journal,swapJournal,now}){
 const at=now+120000,start=Math.floor(initial.transaction.blockTime/60)*60;
 const fetchImpl=async url=>{
  const u=new URL(url),minutes=Array.from({length:5},(_,i)=>start+i*60);
  if(u.hostname==='api.exchange.coinbase.com')return Response.json(minutes.map(m=>[m,99,100,99.5,99.5,1]));
  if(u.hostname!=='api.kraken.com')throw Error('UNEXPECTED_TEST_FETCH');
  const usdc=u.searchParams.get('pair')==='USDCUSD',mid=usdc?'1':'100';
  return Response.json({error:[],result:{[usdc?'USDC/USD':initial.c.asset+'/USD']:minutes.map(m=>[m,mid,usdc?'1.01':'101',usdc?'0.99':'99',mid,mid,'1',1]),last:minutes.at(-1)}});
 };
 const request=async(method,params)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getMultipleAccounts')return {context:{slot:300},value:params[0].map(k=>returned.after.get(k)??returned.before.get(k)??initial.before.get(k)??null)};
  if(method==='getSlot')return 300;if(method==='getBlocks')return [1];if(method==='getFirstAvailableBlock')return 0;
  if(method==='getBlockTime')return params[0]===300?at/1000-5:at/1000-172800;
  if(method==='getSignaturesForAddress')return params[0]===initial.walletAddress?[returned,initial].map(f=>({signature:f.identity.signature,slot:f.transaction.slot,blockTime:f.transaction.blockTime,err:f.status?.err??null,confirmationStatus:'finalized'})):[];
  if(['getTransaction','getSignatureStatuses'].includes(method))return (method==='getTransaction'?params[0]:params[0][0])===initial.identity.signature?initial.request(method,params):returned.request(method,params);
  throw Error('WRITE_OR_UNEXPECTED_TEST_RPC');
 };
 const common={fetchImpl,now:()=>at,monotonicNow:()=>0};
 return {request,...common,journal,swapJournal,readEntryConversionLoss:createPerpsEntryConversionUsdValuationReader(common),
  readEntryRecoveryLoss:createPerpsEntryRecoveryUsdValuationReader(common),readNetworkFees:createPerpsNetworkFeeValuationReader(common)};
}
