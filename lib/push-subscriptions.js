import {MARKETS_CATALOG} from './markets-catalog.js';
import {hashIdentifier} from './server.js';
const TTL=30*86400;
const failure=(code,status=400)=>Object.assign(Error(code),{status});
export function validatePushPreferences(input,signalsAllowed=false){
 if(!Array.isArray(input?.alerts)||input.alerts.length>20||typeof input.signals!=='boolean')throw failure('PUSH_PREFERENCES');
 if(input.signals&&!signalsAllowed)throw failure('PUSH_SIGNALS_ACCESS',403);
 const seen=new Set();
 const alerts=input.alerts.map(a=>{
  if(typeof a?.id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(a.id)||seen.has(a.id)||!MARKETS_CATALOG.some(c=>c.id===a.coin)||!['above','below'].includes(a.direction)||typeof a.target!=='number'||!Number.isFinite(a.target)||a.target<=0||a.target>1e15)throw failure('PUSH_ALERT');
  seen.add(a.id);return {id:a.id,coin:a.coin,direction:a.direction,target:a.target};
 });
 return {alerts,signals:input.signals};
}
// Atomic ownership, per-account device cap, rate limit and durable dispatch index.
const SAVE=`
local rate=redis.call('INCR',KEYS[5]); if rate==1 then redis.call('EXPIRE',KEYS[5],60) end
if rate>20 then return 'RATE' end
local owner=redis.call('GET',KEYS[3]); if owner and owner~=ARGV[1] then return 'OWNER' end
redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',ARGV[2])
if not redis.call('ZSCORE',KEYS[4],ARGV[3]) and redis.call('ZCARD',KEYS[4])>=8 then return 'CAP' end
redis.call('SET',KEYS[3],ARGV[1],'EX',ARGV[5])
local record=cjson.decode(ARGV[4]);local old=redis.call('GET',KEYS[1])
record.signalSince=tonumber(ARGV[2])
if old then local previous=cjson.decode(old);if previous.preferences.signals and record.preferences.signals then record.signalSince=previous.signalSince or tonumber(ARGV[2]) end end
redis.call('SET',KEYS[1],cjson.encode(record),'EX',ARGV[5])
redis.call('ZADD',KEYS[2],ARGV[2],ARGV[3])
redis.call('ZADD',KEYS[4],ARGV[6],ARGV[3]);redis.call('EXPIRE',KEYS[4],ARGV[5])
return 'OK'`;
export function pushSubscriptions({storage,now=Date.now}={}){
 return {async save(account,input,signalsAllowed=false){
  if(!/^[a-f0-9]{64}$/.test(account||''))throw failure('PUSH_LOGIN',401);
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(input?.deviceId||'')||!['android-token','web-fid'].includes(input.transport)||typeof input.target!=='string'||!/^[A-Za-z0-9_:\-]{20,4096}$/.test(input.target))throw failure('PUSH_REGISTRATION');
  if(input.transport==='web-fid'&&!/^[A-Za-z0-9_-]{20,128}$/.test(input.target))throw failure('PUSH_REGISTRATION');
  const preferences=validatePushPreferences(input.preferences,signalsAllowed);
  const id=await hashIdentifier(account+':'+input.deviceId),targetHash=await hashIdentifier(input.target),timestamp=now();
  const record={version:1,id,account,transport:input.transport,target:input.target,preferences,updatedAt:timestamp,expiresAt:timestamp+TTL*1000};
  const result=await storage('pipeline',[['EVAL',SAVE,5,'jamd:push:device:'+id,'jamd:push:index','jamd:push:target:'+targetHash,'jamd:push:account:'+account,'jamd:push:rate:'+account,account,timestamp,id,JSON.stringify(record),TTL,record.expiresAt]]);
  const status=result?.[0]?.result;
  if(status!=='OK')throw failure(status==='RATE'?'PUSH_RATE_LIMIT':status==='CAP'?'PUSH_DEVICE_LIMIT':'PUSH_STORAGE',status==='RATE'?429:503);
  return {enabled:true,expiresAt:record.expiresAt};
 },async disable(account,deviceId){
  if(!/^[a-f0-9]{64}$/.test(account||'')||!/^[A-Za-z0-9_-]{16,100}$/.test(deviceId||''))throw failure('PUSH_REGISTRATION');
  const id=await hashIdentifier(account+':'+deviceId);
  const result=await storage('pipeline',[['DEL','jamd:push:device:'+id],['ZREM','jamd:push:index',id],['ZREM','jamd:push:account:'+account,id]]);
  if(result?.length!==3||result.some(r=>r.error))throw failure('PUSH_STORAGE',503);
  return {enabled:false};
 }};
}
