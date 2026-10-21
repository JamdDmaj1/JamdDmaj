// Read-only conservative post-close USD risk, not an execution price or a
// universal price guarantee. USDC is NOT assumed to equal one USD. Kraken's
// direct USDCUSD source has bounded 720-bar retention; old current-day trades
// use closed five-minute bars instead of requesting unavailable minute data.
import {requireVerifiedPerpsConversionHistory} from './perps-conversion-history.js';
const proofs=new WeakMap(),SCALE=100000000n;
function fail(){throw Error('PERPS_CONVERSION_USD_VALUATION_REQUIRED');}
function amount(v){if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(v)||BigInt(v)>18446744073709551615n)fail();return BigInt(v);}
function price(v){
 if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,6})(?:\.[0-9]{1,8})?$/.test(v))fail();
 const [a,b='']=v.split('.'),n=BigInt(a)*SCALE+BigInt(b.padEnd(8,'0'));if(n<=0n||n>1000000n*SCALE)fail();return n;
}
function binding(conversions,day){
 if(!Array.isArray(conversions)||conversions.length>2000)fail();const seen=new Set();
 return JSON.stringify(conversions.map(v=>{requireVerifiedPerpsConversionHistory(v);
  if(v.day!==day||seen.has(v.signature))fail();seen.add(v.signature);
  amount(v.inputValueUsdUnits);amount(v.receivedUsdcUnits);amount(v.swapFeeUsdcUnits);
  return [v.walletAddress,v.signature,v.firstLegSignature,v.slot,v.blockTime,v.inputValueUsdUnits,v.receivedUsdcUnits,v.swapFeeUsdcUnits];
 }).sort((a,b)=>a[1].localeCompare(b[1])));
}
export function requirePerpsConversionUsdValuation(value,{conversions,day}={}){
 const p=proofs.get(value);if(!p||p.binding!==binding(conversions,day)||value.day!==day)fail();
 const elapsed=p.monotonicNow()-p.started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000||new Date(p.now()).toISOString().slice(0,10)!==day)fail();return value;
}
export function createPerpsConversionUsdValuationReader({fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();let cachedDay;const cache=new Map();
 return async function read({conversions,day}){
  const bound=binding(conversions,day),started=monotonicNow(),clock=now();
  if(!Number.isSafeInteger(clock)||!Number.isFinite(started)||day!==new Date(clock).toISOString().slice(0,10))fail();
  const fresh=()=>{const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();};
  if(cachedDay!==day){cache.clear();cachedDay=day;}
  const minutes=new Set(conversions.map(v=>Math.floor(v.blockTime/60)*60));
  for(const m of minutes)if((m+65)*1000>clock)fail();
  const fetched=new Map(),requested=new Set(),currentMinute=Math.floor(clock/60000)*60;
  const get=(interval,m)=>fetched.get(interval+':'+Math.floor(m/(interval*60))*(interval*60))??cache.get(interval+':'+Math.floor(m/(interval*60))*(interval*60));
  async function window(interval,needed){
   if(!needed.length||requested.has(interval))return;requested.add(interval);
   const url=new URL('https://api.kraken.com/0/public/OHLC');url.searchParams.set('pair','USDCUSD');url.searchParams.set('interval',String(interval));url.searchParams.set('since',String(Math.min(...needed.map(m=>Math.floor(m/(interval*60))*(interval*60)))));
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);let reader;
   try{
    const response=await fetchImpl(url.href,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',headers:{Accept:'application/json'},signal:controller.signal});
    if(!response?.ok||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
    const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>262144))fail();
    reader=response.body.getReader();const parts=[];let size=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>262144)fail();parts.push(Buffer.from(chunk.value));}
    if(controller.signal.aborted)fail();const body=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
    if(!Array.isArray(body?.error)||body.error.length||!body.result||Object.keys(body.result).sort().join(',')!=='USDCUSD,last'||!Number.isSafeInteger(body.result.last)||body.result.last<0)fail();
    const rows=body.result.USDCUSD;if(!Array.isArray(rows)||!rows.length||rows.length>721)fail();let previous=-1;
    for(let i=0;i<rows.length;i++){
     const row=rows[i];if(!Array.isArray(row)||row.length!==8||!Number.isSafeInteger(row[0])||row[0]<0||row[0]%(interval*60)||row[0]<=previous||!Number.isSafeInteger(row[7])||row[7]<0
      ||typeof row[6]!=='string'||!/^(0|[1-9][0-9]{0,19})(?:\.[0-9]{1,20})?$/.test(row[6]))fail();previous=row[0];
     const open=price(row[1]),high=price(row[2]),low=price(row[3]),close=price(row[4]);if(low>high||open<low||open>high||close<low||close>high)fail();
     const noVolume=/^0(?:\.0+)?$/.test(row[6]),noTrades=row[7]===0;
     if(noVolume!==noTrades)fail();
     // Native zero-trade bars carry the previous OHLC and a zero VWAP. They
     // provide no observed USD trade price: do not value from the carry-forward
     // or reject unrelated valid bars merely because this gap is present.
     if(noTrades){if(!/^0(?:\.0+)?$/.test(row[5]))price(row[5]);continue;}
     price(row[5]);
     // The venue always includes a current uncommitted last row, regardless of
     // `since`. Never use it or a still-open bucket as a historical price.
     if(i<rows.length-1&&(row[0]+interval*60+5)*1000<=clock)fetched.set(interval+':'+row[0],Object.freeze({low,high,interval,start:row[0]}));
    }fresh();
   }catch{fail();}finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  }
  const recent=[...minutes].filter(m=>!get(1,m)&&m>=currentMinute-710*60),old=[...minutes].filter(m=>!get(1,m)&&m<currentMinute-710*60&&!get(5,m));
  await Promise.all([window(1,recent),window(5,old)]);
  const missing=[...minutes].filter(m=>!get(1,m)&&!get(5,m));if(missing.length)await window(5,missing);
  fresh();let total=0n;const items=[];
  for(const v of conversions){
   requireVerifiedPerpsConversionHistory(v);const minute=Math.floor(v.blockTime/60)*60;
   const bucket=get(1,minute)??get(5,minute);if(!bucket)fail();const lower=bucket.low,upper=bucket.high;
   const received=amount(v.receivedUsdcUnits)*lower/SCALE,fee=(amount(v.swapFeeUsdcUnits)*upper+SCALE-1n)/SCALE,basis=amount(v.inputValueUsdUnits);
   const gap=basis>received?basis-received:0n,loss=gap>fee?gap:fee;total+=loss;
   items.push(Object.freeze({signature:v.signature,firstLegSignature:v.firstLegSignature,firstLegDay:v.firstLegDay,minute,inputValueUsdUnits:v.inputValueUsdUnits,
    receivedUsdLowerUnits:received.toString(),swapFeeUsdUpperUnits:fee.toString(),lossUsdUnits:loss.toString(),usdcUsdLowerE8:lower.toString(),usdcUsdUpperE8:upper.toString(),bucketStart:bucket.start,timeframeSeconds:bucket.interval*60}));
  }
  if(binding(conversions,day)!==bound||new Date(now()).toISOString().slice(0,10)!==day)fail();fresh();
  for(const [key,value]of fetched){if(cache.size>=4096)cache.delete(cache.keys().next().value);cache.set(key,value);}
  const value=Object.freeze({stage:'VALUED_JOURNALED_CONVERSION_RISK',readyForSigning:false,day,conversionLossUsdUnits:total.toString(),
   basis:'FINALIZED_CLOSE_USD_BASIS_VS_CLOSED_USDC_USD_BOUNDS_WITH_FEE_FLOOR',items:Object.freeze(items)});
  proofs.set(value,{binding:bound,started,monotonicNow,now});return requirePerpsConversionUsdValuation(value,{conversions,day});
 };
}
