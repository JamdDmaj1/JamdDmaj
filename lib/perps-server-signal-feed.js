// Read the existing scanner's stored feed. Never call pro-cron (which publishes
// Telegram messages), read Telegram credentials, sign, or enable automation here.
import {evaluateAutomaticEntryQuality} from './automatic-entry-quality.js';
const URL='https://www.jamddmaj.com/api/pro-client-feed';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_SIGNAL_FEED_UNAVAILABLE');}
function freezeSignal(value){return Object.freeze({...value,decision:Object.freeze(value.decision)});}
export function selectPublishedServerPerpsSignals(feed,{now=Date.now()}={}){
 if(!Number.isSafeInteger(now)||now<0||feed?.ok!==true||feed.clientFeed!==true||typeof feed.executor?.livePaused!=='boolean'
   ||!Array.isArray(feed.open)||feed.open.length>40||typeof feed.generatedAt!=='string')fail();
 const generated=Date.parse(feed.generatedAt);
 if(!Number.isFinite(generated)||generated>now+2000||now-generated>15000)fail();
 const minimumScore=Math.max(12,Number(feed.executor.minScore??12));
 const minimumLiquidity=Math.max(3000000,Number(feed.executor.minLiquidityUsd??3000000));
 if(!Number.isFinite(minimumScore)||minimumScore>20||!Number.isFinite(minimumLiquidity))fail();
 const seen=new Set(),selected=[],rejected={};
 const reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;};
 for(const source of feed.open){
  if(!source||typeof source.id!=='string'||!source.id||source.id.length>180||/[\x00-\x1f]/.test(source.id)){reject('INVALID_SIGNAL');continue;}
  if(seen.has(source.id))fail();seen.add(source.id);
  if(source.status!=='OPEN'){reject('NOT_OPEN');continue;}
  const pair=source.pair||source.symbol;
  if(typeof pair!=='string'||!/^(BTC|ETH|SOL)USDT$/.test(pair)||Number(source.contractMultiplier??1)!==1){reject('UNSUPPORTED_MARKET');continue;}
  const created=Date.parse(source.createdAt),published=Date.parse(source.telegramSentAt);
  if(!Number.isSafeInteger(source.telegramMessageId)||source.telegramMessageId<1||!Number.isFinite(published)){reject('NOT_PUBLISHED');continue;}
  if(!Number.isFinite(created)||created>now+2000||published>now+2000||published<created-2000||now-created>300000||now-published>300000){reject('STALE_SIGNAL');continue;}
  if(!['LONG','SHORT'].includes(source.side)){reject('INVALID_SIDE');continue;}
  const [entry,sl,tp1]=[source.entry,source.sl,source.tp1].map(Number);
  if(![entry,sl,tp1].every(n=>Number.isFinite(n)&&n>0)||(source.side==='LONG'?!(sl<entry&&tp1>entry):!(sl>entry&&tp1<entry))){reject('INVALID_EXITS');continue;}
  // Preserve the legacy conservative strategy rules without importing a Bitget
  // process, API key, env file, execution flag or bitgetEligible transport gate.
  const decision=evaluateAutomaticEntryQuality(source,{minLiquidityUsd:minimumLiquidity});
  if(!decision.ok||Number(source.score)<minimumScore||source.freshness?.status!=='fresh'){reject('STRATEGY_REJECTED');continue;}
  selected.push(freezeSignal({id:source.id,pair,side:source.side,entry,sl,tp1,createdAt:source.createdAt,contractMultiplier:1,
   telegramMessageId:source.telegramMessageId,telegramSentAt:source.telegramSentAt,score:Number(source.score),decision}));
 }
 selected.sort((a,b)=>b.score-a.score||Date.parse(b.telegramSentAt)-Date.parse(a.telegramSentAt));
 return Object.freeze({stage:'PUBLISHED_SIGNAL_CANDIDATES',readyForSigning:false,tradingEnabled:false,
  generatedAt:feed.generatedAt,observedAt:now,remotePaused:feed.executor.livePaused,candidates:Object.freeze(selected.slice(0,12)),rejected:Object.freeze(rejected)});
}
export function requireFreshServerPerpsSignalFeed(value){
 const proof=proofs.get(value);if(!proof)fail();const elapsed=proof.clock()-proof.started;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail();return value;
}
export async function readServerPerpsSignalFeed({feedToken},{fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof feedToken!=='string'||feedToken.length<16||feedToken.length>4096||/[\x00-\x20\x7f]/.test(feedToken)||typeof fetchImpl!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader;
 try{
  const response=await fetchImpl(URL,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',headers:{Accept:'application/json','X-JamdDmaj-Client-Token':feedToken},signal:controller.signal});
  if(!response?.ok||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
  reader=response.body.getReader();const parts=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)fail();parts.push(Buffer.from(part.value));}
  if(controller.signal.aborted)fail();
  const result=selectPublishedServerPerpsSignals(JSON.parse(Buffer.concat(parts,size).toString('utf8')),{now:now()});
  proofs.set(result,{started,clock:monotonicNow});requireFreshServerPerpsSignalFeed(result);return result;
 }catch{fail();}
 finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
}
