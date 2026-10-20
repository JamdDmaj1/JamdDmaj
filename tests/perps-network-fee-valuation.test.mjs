import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureNow,fixtureWallet,historyTransaction} from './helpers/perps-history-fixture.mjs';
import {readServerPerpsTradeTransaction} from '../lib/perps-server-trade-transaction.js';
import {createPerpsNetworkFeeValuationReader,requirePerpsNetworkFeeValuation} from '../lib/perps-network-fee-valuation.js';
async function fixture(){
 const source=await historyTransaction({nonce:7}),time=source.tx.blockTime,now=(Math.floor(time/60)*60+70)*1000;
 const transaction=await readServerPerpsTradeTransaction({walletAddress:fixtureWallet,signature:source.signature,day:'2026-10-18'},
  {now:()=>now,request:async method=>method==='getGenesisHash'?'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':structuredClone(source.tx)});
 const minute=Math.floor(time/60)*60,rows=[[minute,100,105.12345678,102,103,20]],calls=[],clock={now,mono:0};
 const fetchImpl=async(url,options)=>{calls.push({url,options});return Response.json(rows);};
 const options={fetchImpl,now:()=>clock.now,monotonicNow:()=>clock.mono};
 return {source,transaction,transactions:[transaction],minute,rows,calls,clock,options,input:{transactions:[transaction],day:'2026-10-18'}};
}
test('historical SOL fee valuation pins public read-only source, closed minute high, integer ceilings and receipt identity',async()=>{
 const f=await fixture(),read=createPerpsNetworkFeeValuationReader(f.options),proof=await read(f.input);
 assert.equal(proof.networkFeeUsdUnits,'526');assert.equal(proof.walletNetworkFeesLamports,'5000');assert.equal(proof.readyForSigning,false);
 assert.equal(requirePerpsNetworkFeeValuation(proof,{transactions:f.transactions}),proof);
 assert.throws(()=>requirePerpsNetworkFeeValuation({...proof},{transactions:f.transactions}));
 assert.throws(()=>requirePerpsNetworkFeeValuation(proof,{transactions:[]}));
 assert.throws(()=>requirePerpsNetworkFeeValuation(proof,{transactions:[{...f.transaction}]}));
 const url=new URL(f.calls[0].url),options=f.calls[0].options;
 assert.equal(url.origin,'https://api.exchange.coinbase.com');assert.equal(url.pathname,'/products/SOL-USD/candles');assert.equal(url.searchParams.get('granularity'),'60');
 assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.body,undefined);
 assert.equal((await read(f.input)).networkFeeUsdUnits,'526');assert.equal(f.calls.length,1);
 f.clock.mono=10001;assert.throws(()=>requirePerpsNetworkFeeValuation(proof,{transactions:f.transactions}));
});
test('missing, partial, invalid, duplicate and substituted historical prices cannot become zero fees',async()=>{
 for(const mode of ['missing','partial','nan','negative','inverted','outside','duplicate','body','http','redirect','content','large','throw']){
  const f=await fixture();let fetchImpl=f.options.fetchImpl;
  if(mode==='missing')f.rows.length=0;
  if(mode==='partial')f.clock.now=(f.minute+64)*1000;
  if(mode==='nan')f.rows[0][2]=null;
  if(mode==='negative')f.rows[0][2]=-1;
  if(mode==='inverted')f.rows[0][1]=110;
  if(mode==='outside')f.rows[0][0]-=60;
  if(mode==='duplicate')f.rows.push([...f.rows[0]]);
  if(mode==='body')fetchImpl=async()=>Response.json({price:105});
  if(mode==='http')fetchImpl=async()=>new Response('unavailable',{status:503});
  if(mode==='redirect')fetchImpl=async()=>({ok:true,redirected:true});
  if(mode==='content')fetchImpl=async()=>new Response('[]');
  if(mode==='large')fetchImpl=async()=>new Response(' '.repeat(131073),{headers:{'Content-Type':'application/json'}});
  if(mode==='throw')fetchImpl=async()=>{throw Error('provider unavailable');};
  await assert.rejects(()=>createPerpsNetworkFeeValuationReader({...f.options,fetchImpl})(f.input),/PERPS_NETWORK_FEE_VALUATION_REQUIRED/);
 }
});
test('empty history needs no price service, duplicate receipts fail, and midnight invalidates proof',async()=>{
 const f=await fixture(),read=createPerpsNetworkFeeValuationReader(f.options);
 const proof=await read({transactions:[],day:'2026-10-18'});assert.equal(proof.networkFeeUsdUnits,'0');assert.equal(f.calls.length,0);
 await assert.rejects(()=>read({...f.input,transactions:[f.transaction,f.transaction]}));
 f.clock.now=fixtureNow+86400000;assert.throws(()=>requirePerpsNetworkFeeValuation(proof,{transactions:[]}));
});
