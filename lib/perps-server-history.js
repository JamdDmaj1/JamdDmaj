// Official /trades index, read-only. Indexed rows are NOT chain-verified daily
// accounting and must never authorize new capital or release reservations.
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {PERPS_CUSTODIES,deriveServerPerpsIdentities} from './perps-server-custody.js';
function fail(){throw Error('INCOMPLETE_SERVER_PERPS_HISTORY');}
function key(value,length){try{if(typeof value!=='string'||bs58.decode(value).length!==length)fail();return value;}catch{fail();}}
function usd(value,signed=false){
 if(typeof value!=='string'||!(signed?/^-?(0|[1-9][0-9]{0,12})(\.[0-9]{1,6})?$/:/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,6})?$/).test(value))fail();
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');const amount=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));return (negative?-amount:amount).toString();
}
export async function readIndexedServerPerpsDay({walletAddress,day},{fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now(),pageSize=50,maxRows=500}={}){
 key(walletAddress,32);
 if(typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function'||!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(maxRows)||maxRows<1||maxRows>1000||typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))fail();
 const start=Date.parse(day+'T00:00:00Z'),observedAt=now(),started=monotonicNow();
 if(!Number.isSafeInteger(start)||new Date(start).toISOString().slice(0,10)!==day||!Number.isSafeInteger(observedAt)||start>observedAt||!Number.isFinite(started))fail();
 const from=Math.floor(start/1000),until=Math.min(from+86400,Math.floor(observedAt/1000)+1),rows=[],seen=new Set();
 const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 async function page(offset){
  const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000)fail();
  const url=new URL('https://perps-api.jup.ag/v1/trades');
  for(const [k,v]of Object.entries({walletAddress,createdAtAfter:from,createdAtBefore:until,start:offset,end:offset+pageSize}))url.searchParams.set(k,String(v));
  const response=await fetchImpl(url.href,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',headers:{Accept:'application/json','x-perps-api-version':'v2'},signal:AbortSignal.timeout(6000)});
  if(!response?.ok||response.redirected||!response.body)fail();
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1048576)fail();parts.push(Buffer.from(chunk.value));}}finally{await reader.cancel();}
  let value;try{value=JSON.parse(Buffer.concat(parts,size).toString('utf8'));}catch{fail();}
  if(!Number.isSafeInteger(value?.count)||value.count<0||value.count>maxRows||!Array.isArray(value.dataList)||value.dataList.length!==Math.min(pageSize,Math.max(0,value.count-offset)))fail();
  return value;
 }
 const first=await page(0),firstHash=fingerprint(first);let next=first;
 for(let offset=0;offset<first.count;offset+=pageSize){
  if(offset)next=await page(offset);if(next.count!==first.count)fail();
  for(const row of next.dataList){
   if(row?.owner!==walletAddress||!['Increase','Decrease'].includes(row.action)||!['long','short'].includes(row.side)||!Number.isSafeInteger(row.createdTime)||row.createdTime<from||row.createdTime>=until)fail();
   const asset=['BTC','ETH','SOL'].find(a=>PERPS_CUSTODIES[a].mint===row.mint);if(!asset)fail();
   const position=(await deriveServerPerpsIdentities({walletAddress,asset,side:row.side.toUpperCase()})).position;
   if(row.positionPubkey!==position)fail();key(row.txHash,64);
   const id=[row.txHash,position,row.action,row.createdTime].join(':');if(seen.has(id))fail();seen.add(id);
   rows.push(Object.freeze({signature:row.txHash,positionAddress:position,asset,side:row.side.toUpperCase(),action:row.action,createdTime:row.createdTime,
    indexedPnlUsdUnits:usd(row.pnl,true),indexedFeeUsdUnits:usd(row.fee),indexedCollateralDeltaUsdUnits:usd(row.collateralUsdDelta,true)}));
  }
 }
 if(fingerprint(await page(0))!==firstHash)fail();
 const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000)fail();
 return Object.freeze({stage:'INDEXED_HISTORY_ONLY',readyForSigning:false,walletAddress,day,observedAt,rows:Object.freeze(rows),indexedCount:rows.length,
  requiresChainReconciliation:true,lossTodayUsdcUnits:null,tradesToday:null});
}
