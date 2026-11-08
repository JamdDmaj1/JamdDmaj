// Read-only feasibility check. Fixed fake authority: no user's wallet, private
// key, signature, account activation, deposit or send endpoint is used.
import assert from 'node:assert/strict';
import {createPhoenixClient} from '@ellipsis-labs/rise';
import {createPhoenixPublicClient} from '../lib/phoenix-public-client.js';
import {preparePhoenixOrderReview,buildPhoenixReviewedInstructions} from '../lib/phoenix-order-review.js';
import {decodePhoenixMarketQuote} from '../lib/phoenix-market-quote.js';
const underlying=globalThis.fetch,reads=[];
globalThis.fetch=async(input,init)=>{const req=input instanceof Request?input:null,url=new URL(req?.url??String(input)),method=init?.method??req?.method??'GET';
 if(url.origin==='https://perp-api.phoenix.trade'){if(method!=='GET')throw Error('NO_MUTATING_PHOENIX_API');}
 else if(url.origin==='https://solana-rpc.publicnode.com'){const body=typeof init?.body==='string'?JSON.parse(init.body):req?await req.clone().json():null;if(method!=='POST'||!['getAccountInfo','getMultipleAccounts','getSlot','getGenesisHash','getMinimumBalanceForRentExemption','getLatestBlockhash'].includes(body?.method))throw Error('NO_SIGN_OR_SEND_RPC');reads.push(body.method);}
 else throw Error('UNEXPECTED_ORIGIN');return underlying(input,{...init,signal:AbortSignal.timeout(12000)});
};
const client=createPhoenixClient({apiUrl:'https://perp-api.phoenix.trade',rpcUrl:'https://solana-rpc.publicnode.com',ws:false,exchangeMetadata:{stream:false}});
try{
 await client.exchange.ready();
 const readSlot=async()=>{const response=await fetch('https://solana-rpc.publicnode.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSlot',params:[{commitment:'confirmed'}]})});const slot=(await response.json()).result;assert.ok(Number.isSafeInteger(slot));return slot;};
 if(process.argv.includes('--all-markets')){
  const publicClient=createPhoenixPublicClient(),catalog=await publicClient.catalog();
  const [allStats,exchangeKeys,observedSlot]=await Promise.all([client.api.markets().getLatestMarketsStats(),client.api.exchange().getKeys(),readSlot()]);
  const results=[];
  for(const market of catalog.markets.filter(m=>m.active)){
   try{
    const raw=allStats.markets.find(q=>q.symbol===market.symbol);
    if(!raw)throw Error('PHOENIX_QUOTE_MISSING');
    const quote=decodePhoenixMarketQuote({...raw,timestamp_ms:String(raw.timestamp_ms)},{symbol:market.symbol});
    const leverageTenths=Math.min(30,Math.max(...market.tiers.map(t=>t.leverageTenths)));
    for(const side of ['LONG','SHORT']){
     const review=await preparePhoenixOrderReview({walletAddress:'11111111111111111111111111111112',symbol:market.symbol,side,marginUsdcUnits:'10000000',leverageTenths,clientOrderId:'12345',isolatedSubaccountIndex:1},{publicClient:{catalog:async()=>catalog,quote:async()=>quote},readSlot:async()=>observedSlot});
     await buildPhoenixReviewedInstructions(review,{client,exchangeKeys});
    }
    results.push({symbol:market.symbol,prepared:true});
   }catch(error){results.push({symbol:market.symbol,prepared:false,code:error.message});if(/UNAVAILABLE|STALE|EXPIRED/.test(error.message))break;}
  }
  console.log(JSON.stringify({stage:'PHOENIX_CATALOG_UNSIGNED_CHECK',total:results.length,prepared:results.filter(r=>r.prepared).length,notPrepared:results.filter(r=>!r.prepared),signed:false,submitted:false,readyForTrading:false}));
  if(results.some(r=>!r.prepared))process.exitCode=1;
 }else{
 const review=await preparePhoenixOrderReview({walletAddress:'11111111111111111111111111111112',symbol:'DOGE',side:'LONG',marginUsdcUnits:'10000000',leverageTenths:30,clientOrderId:'12345',isolatedSubaccountIndex:1},{publicClient:createPhoenixPublicClient(),readSlot});
 const {plan}=review;
 const checked=await buildPhoenixReviewedInstructions(review,{client,exchangeKeys:await client.api.exchange().getKeys()});
 assert.equal(checked.readyForSigning,false);assert.equal(checked.instructions.length,4);
 console.log(JSON.stringify({stage:checked.stage,unsignedInstructions:checked.instructions.length,fullSizeMinimum:plan.packet.minBaseLotsToFill===plan.packet.numBaseLots,maxSlippageBps:plan.maxSlippageBps,readMethods:[...new Set(reads)],signed:false,submitted:false,livePriceQuote:true,quoteAgeMs:Date.now()-review.quote.timestamp}));
 }
}finally{client.dispose();globalThis.fetch=underlying;}
