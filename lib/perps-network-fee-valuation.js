// Read-only USD risk valuation of real finalized SOL fees. Closed SOL/USD
// minute highs, rounded up; not an execution quote or a universal price bound.
import {requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
const proofs=new WeakMap(),ENDPOINT='https://api.exchange.coinbase.com/products/SOL-USD/candles';
function fail(){throw Error('PERPS_NETWORK_FEE_VALUATION_REQUIRED');}
function micro(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1000000||!/^[0-9]+(?:\.[0-9]{1,8})?$/.test(String(value)))fail();
 const [whole,fraction='']=String(value).split('.'),digits=fraction.padEnd(8,'0');
 return (BigInt(whole)*100000000n+BigInt(digits)+99n)/100n;
}
function binding(transactions){
 if(!Array.isArray(transactions)||transactions.length>2000)fail();const seen=new Set();
 return transactions.map(tx=>{requireVerifiedServerPerpsTradeTransaction(tx);
  if(seen.has(tx.signature))fail();seen.add(tx.signature);
  return [tx.walletAddress,tx.signature,tx.blockTime,tx.walletFeeLamports];
 }).sort((a,b)=>a[1].localeCompare(b[1]));
}
export function requirePerpsNetworkFeeValuation(value,{transactions}={}){
 const p=proofs.get(value);if(!p||JSON.stringify(binding(transactions))!==p.binding)fail();
 const elapsed=p.clock()-p.started;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||new Date(p.now()).toISOString().slice(0,10)!==value.day)fail();return value;
}
export function createPerpsNetworkFeeValuationReader({fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const cache=new Map();let cachedDay;
 return async function read({transactions,day}){
  const bound=binding(transactions),started=monotonicNow(),at=now();
  if(!Number.isFinite(started)||!Number.isSafeInteger(at)||day!==new Date(at).toISOString().slice(0,10))fail();
  if(day!==cachedDay){cache.clear();cachedDay=day;}
  const required=new Set(),windows=new Set(),highs=new Map();
  for(const [, ,time,fee] of bound){
   if(!/^(0|[1-9][0-9]{0,19})$/.test(fee)||BigInt(fee)>18446744073709551615n||new Date(time*1000).toISOString().slice(0,10)!==day)fail();
   if(BigInt(fee)===0n)continue;
   const minute=Math.floor(time/60)*60;
   // Never value a partial candle, or assume an absent price is zero.
   if((minute+65)*1000>at)fail();required.add(minute);
   if(cache.has(minute))highs.set(minute,cache.get(minute));else windows.add(Math.floor(minute/18000)*18000);
  }
  const queue=[...windows];let next=0;
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
   while(next<queue.length){
    const start=queue[next++],url=new URL(ENDPOINT);url.searchParams.set('granularity','60');
    url.searchParams.set('start',new Date(start*1000).toISOString());url.searchParams.set('end',new Date((start+17940)*1000).toISOString());
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);let reader;
    try{
     const response=await fetchImpl(url.href,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',headers:{Accept:'application/json'},signal:controller.signal});
     if(!response?.ok||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
     const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>131072))fail();
     reader=response.body.getReader();const parts=[];let size=0;
     while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>131072)fail();parts.push(Buffer.from(chunk.value));}
     if(controller.signal.aborted)fail();const rows=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
     if(!Array.isArray(rows)||rows.length>300)fail();const seen=new Set();
     for(const row of rows){
      if(!Array.isArray(row)||row.length!==6||!Number.isSafeInteger(row[0])||row[0]<0||row[0]%60||seen.has(row[0])
       ||row.slice(1).some(value=>typeof value!=='number'||!Number.isFinite(value))||row[5]<0)fail();seen.add(row[0]);
      const [time,low,high,open,close]=row;micro(low);const price=micro(high);micro(open);micro(close);
      if(low>high||open<low||open>high||close<low||close>high)fail();
      // Coinbase may return earlier buckets. Never use them as substitutes.
      if(time>=start&&time<start+18000&&required.has(time))highs.set(time,price);
     }
    }catch{fail();}finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
   }
  }));
  let total=0n,lamports=0n;
  for(const [, ,time,fee] of bound){const amount=BigInt(fee);lamports+=amount;if(amount===0n)continue;
   const price=highs.get(Math.floor(time/60)*60);if(price===undefined)fail();total+=(amount*price+999999999n)/1000000000n;
  }
  const result=Object.freeze({stage:'NETWORK_FEES_USD_RISK_VALUATION',day,networkFeeUsdUnits:total.toString(),walletNetworkFeesLamports:lamports.toString(),
   basis:'COINBASE_SOL_USD_CLOSED_MINUTE_HIGH_CEILING',readyForSigning:false});
  proofs.set(result,{binding:JSON.stringify(bound),started,clock:monotonicNow,now});requirePerpsNetworkFeeValuation(result,{transactions});
  // Only fully validated, closed historical buckets survive this request.
  // Receipts, today's totals and freshness proofs are always rebuilt.
  if(cachedDay===day)for(const [minute,price]of highs)cache.set(minute,price);
  return result;
 };
}
