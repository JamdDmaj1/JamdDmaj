import {hashIdentifier} from './server.js';
import {telegramSignalCards} from './automation-panel.js';
const TTL=31*86400;
const reached=(a,p)=>typeof p==='number'&&Number.isFinite(p)&&p>0&&(a.direction==='above'?p>=a.target:p<=a.target);
export function pushDispatcher({storage,getPrices,getSignals,send,now=Date.now}={}){
 const run=async commands=>{const r=await storage('pipeline',commands);if(r.length!==commands.length||r.some(x=>x.error))throw Error('PUSH_STORAGE');return r.map(x=>x.result);};
 return async()=>{
  const timestamp=now();
  const [lock]=await run([['SET','jamd:push:dispatch-lock',String(timestamp),'NX','EX',55]]);
  if(lock!=='OK')return {busy:true};
  // Bounded rotating queue: one slow or dead device cannot starve later users.
  const [ids]=await run([['ZRANGEBYSCORE','jamd:push:index','-inf',timestamp,'LIMIT',0,25]]);
  if(!Array.isArray(ids)||ids.length===0)return {processed:0,accepted:0};
  const values=await run(ids.map(id=>['GET','jamd:push:device:'+id]));
  const records=[];
  for(let i=0;i<ids.length;i++){
   let record;try{record=JSON.parse(values[i]||'null');}catch{}
   if(!record||record.id!==ids[i]||record.expiresAt<=timestamp){await run([['ZREM','jamd:push:index',ids[i]]]);continue;}
   records.push(record);await run([['ZADD','jamd:push:index',timestamp+60000,record.id]]);
  }
  const coins=[...new Set(records.flatMap(r=>r.preferences.alerts.map(a=>a.coin)))];
  let prices={},signals=[];
  if(coins.length)try{prices=await getPrices(coins);}catch{/* Missing prices never mean zero. */}
  if(records.some(r=>r.preferences.signals))try{signals=telegramSignalCards(await getSignals(),timestamp);}catch{}
  let accepted=0;
  for(const r of records){
   if(now()-timestamp>=40000)break;
   const notices=[];
   for(const a of r.preferences.alerts){const p=prices[a.coin]?.usd;if(reached(a,p))notices.push({kind:'price',body:`${a.coin}: ${p} USD · ${a.direction==='above'?'≥':'≤'} ${a.target} USD`,source:'price:'+a.id+':'+a.coin+':'+a.direction+':'+a.target});}
   if(r.preferences.signals)for(const s of signals){if(Date.parse(s.publishedAt)>=r.signalSince)notices.push({kind:'signal',body:`${s.pair} · ${s.side} · Nueva señal publicada / New published signal`,source:'signal:'+s.id+':'+s.publishedAt});}
   for(const notice of notices.slice(0,5)){
    if(now()-timestamp>=40000)break;
    const eventId=await hashIdentifier(r.id+':'+notice.source),key='jamd:push:sent:'+eventId;
    const [claimed]=await run([['SET',key,'pending','NX','EX',120]]);if(claimed!=='OK')continue;
    let result;try{result=await send({transport:r.transport,target:r.target,kind:notice.kind,body:notice.body,eventId});}catch{/* Retry after pending lease; transport may have accepted before timeout. */continue;}
    if(result.accepted){accepted++;await run([['SET',key,'accepted','EX',TTL]]);}
    else if(result.invalidTarget){await run([['DEL','jamd:push:device:'+r.id],['ZREM','jamd:push:index',r.id]]);break;}
    else if(!result.retryable){await run([['ZADD','jamd:push:index',timestamp+3600000,r.id]]);break;}
   }
  }
  return {processed:records.length,accepted};
 };
}
