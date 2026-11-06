// Read-only historical market reference bounds. Not a wrapped-token executable
// quote, a depeg guarantee or signing authority. Never use a current/open bar.
const PAIRS={USDC:'USDCUSD',BTC:'XBTUSD',ETH:'ETHUSD',SOL:'SOLUSD'},SCALE=100000000n;
function fail(){throw Error('PERPS_CLOSED_USD_BOUNDS_REQUIRED');}
function price(value){
 if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,8})(?:\.[0-9]{1,8})?$/.test(value))fail();
 const [whole,fraction='']=value.split('.'),n=BigInt(whole)*SCALE+BigInt(fraction.padEnd(8,'0'));if(n<=0n)fail();return n;
}
export function createClosedPerpsUsdBoundsReader({fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if([fetchImpl,now,monotonicNow].some(fn=>typeof fn!=='function'))fail();let cachedDay;const cache=new Map();
 return async function read({requests,day}){
  const at=now(),started=monotonicNow();
  if(!Number.isSafeInteger(at)||!Number.isFinite(started)||day!==new Date(at).toISOString().slice(0,10)||!Array.isArray(requests)||requests.length>4000)fail();
  const fresh=()=>{const age=monotonicNow()-started;if(!Number.isFinite(age)||age<0||age>10000||now()<at||new Date(now()).toISOString().slice(0,10)!==day)fail();};
  if(cachedDay!==day){cache.clear();cachedDay=day;}
  const needed=new Map();
  for(const item of requests){
   if(!item||!Object.hasOwn(PAIRS,item.asset)||!Number.isSafeInteger(item.blockTime)||item.blockTime<0||new Date(item.blockTime*1000).toISOString().slice(0,10)!==day)fail();
   const minute=Math.floor(item.blockTime/60)*60;if((minute+65)*1000>at)fail();
   if(!needed.has(item.asset))needed.set(item.asset,new Set());needed.get(item.asset).add(minute);
  }
  const fetched=new Map(),requested=new Set(),currentMinute=Math.floor(at/60000)*60;
  const key=(asset,interval,time)=>asset+':'+interval+':'+Math.floor(time/(interval*60))*(interval*60);
  const get=(asset,time)=>fetched.get(key(asset,1,time))??cache.get(key(asset,1,time))??fetched.get(key(asset,5,time))??cache.get(key(asset,5,time));
  async function window(asset,interval,minutes){
   if(!minutes.length||requested.has(asset+':'+interval))return;requested.add(asset+':'+interval);
   const url=new URL('https://api.kraken.com/0/public/OHLC');url.searchParams.set('pair',PAIRS[asset]);url.searchParams.set('assetVersion','1');
   url.searchParams.set('interval',String(interval));url.searchParams.set('since',String(Math.min(...minutes.map(m=>Math.floor(m/(interval*60))*(interval*60)))));
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);let reader;
   try{
    const response=await fetchImpl(url.href,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
    if(!response?.ok||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
    const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>262144))fail();
    reader=response.body.getReader();let size=0;const parts=[];
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>262144)fail();parts.push(Buffer.from(part.value));}
    if(controller.signal.aborted)fail();const body=JSON.parse(Buffer.concat(parts,size).toString('utf8')),pair=asset+'/USD';
    if(!Array.isArray(body?.error)||body.error.length||!body.result||Object.keys(body.result).sort().join(',')!==[pair,'last'].sort().join(',')||!Number.isSafeInteger(body.result.last)||body.result.last<0)fail();
    const rows=body.result[pair];if(!Array.isArray(rows)||!rows.length||rows.length>721)fail();let previous=-1;
    for(let i=0;i<rows.length;i++){
     const row=rows[i];if(!Array.isArray(row)||row.length!==8||!Number.isSafeInteger(row[0])||row[0]<0||row[0]%(interval*60)||row[0]<=previous
       ||!Number.isSafeInteger(row[7])||row[7]<0||typeof row[6]!=='string'||!/^(0|[1-9][0-9]{0,19})(?:\.[0-9]{1,20})?$/.test(row[6]))fail();previous=row[0];
     const open=price(row[1]),high=price(row[2]),low=price(row[3]),close=price(row[4]);if(low>high||open<low||open>high||close<low||close>high)fail();
     const noTrades=row[7]===0,noVolume=/^0(?:\.0+)?$/.test(row[6]);if(noTrades!==noVolume)fail();
     if(noTrades){if(!/^0(?:\.0+)?$/.test(row[5]))price(row[5]);continue;}price(row[5]);
     if(i<rows.length-1&&(row[0]+interval*60+5)*1000<=at&&new Date(row[0]*1000).toISOString().slice(0,10)===day)
      fetched.set(key(asset,interval,row[0]),Object.freeze({asset,lowE8:low.toString(),highE8:high.toString(),start:row[0],timeframeSeconds:interval*60}));
    }fresh();
   }catch{fail();}finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  }
  await Promise.all([...needed].map(async([asset,times])=>{
   const recent=[...times].filter(m=>!get(asset,m)&&m>=currentMinute-710*60),old=[...times].filter(m=>!get(asset,m)&&m<currentMinute-710*60);
   await Promise.all([window(asset,1,recent),window(asset,5,old)]);
   const missing=[...times].filter(m=>!get(asset,m));if(missing.length&&recent.length)await window(asset,5,missing);
  }));
  fresh();const result=new Map();
  for(const [asset,times]of needed)for(const minute of times){const value=get(asset,minute);if(!value)fail();result.set(asset+':'+minute,value);}
  for(const [k,v]of fetched){if(cache.size>=8192)cache.delete(cache.keys().next().value);cache.set(k,v);}return result;
 };
}
