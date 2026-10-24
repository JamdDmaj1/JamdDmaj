import {redisRequest} from './server.js';
import {trialHash} from './web-trial-session.js';
import {wrapRecoveryCode,unwrapRecoveryCode} from '../api/account.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function validBackup(raw){
 try {const value=JSON.parse(raw);return typeof value.encrypted?.iv==='string'&&/^[A-Za-z0-9+/=]{12,80}$/.test(value.encrypted.iv)&&typeof value.encrypted.data==='string'&&/^[A-Za-z0-9+/=]{20,1600000}$/.test(value.encrypted.data);}catch{return false;}
}
// Snapshot both encrypted backups and the former encrypted account association
// before switching the mapping. Never delete or rewrite either backup.
const replace=`local old=redis.call('GET',KEYS[1]); if old~=ARGV[1] then return 0 end; if (redis.call('GET',KEYS[3]) or '')~=ARGV[2] or redis.call('GET',KEYS[4])~=ARGV[3] then return 0 end; if redis.call('EXISTS',KEYS[2])~=0 then return 0 end; redis.call('SET',KEYS[2],ARGV[4]); redis.call('SET',KEYS[1],ARGV[5]); return 1`;

export async function relinkGoogleSync(owner,input,secret,{storage=redisRequest,now=Date.now}={}){
 if(!/^[a-f0-9]{64}$/.test(owner||'')||typeof secret!=='string'||secret.length<32)throw fail('SYNC_UNAVAILABLE',503);
 if(!input||Object.keys(input).sort().join(',')!=='expectedBackupHash,expectedRecoveryHash,explicitApproval,recoveryCode'||input.explicitApproval!==true||!/^[a-f0-9]{64}$/.test(input.expectedRecoveryHash||'')||!/^[a-f0-9]{64}$/.test(input.expectedBackupHash||'')||typeof input.recoveryCode!=='string'||!/^[A-Z0-9]{20}$/.test(input.recoveryCode))throw fail('INVALID_REQUEST');
 const key=`jamd:account:google:${owner.slice(0,32)}`;
 const rows=await storage('pipeline',[['GET',key]]),raw=rows?.[0]?.result;
 if(rows?.[0]?.error||typeof raw!=='string')throw fail('SYNC_UNAVAILABLE',503);
 let record;try{record=JSON.parse(raw);}catch{throw fail('SYNC_UNAVAILABLE',503);}
 if(record.provider!=='google'||record.subHash!==owner.slice(0,32)||!record.wrappedRecovery)throw fail('SYNC_UNAVAILABLE',503);
 const oldCode=await unwrapRecoveryCode(record.wrappedRecovery,secret),previousHash=await trialHash(oldCode),selectedHash=await trialHash(input.recoveryCode);
 if(previousHash!==input.expectedRecoveryHash)throw fail('SYNC_CHANGED_REFRESH_FIRST',409);
 if(selectedHash===previousHash)return {ok:true,linked:true,changed:false};
 const previousKey=`jamd:backup:${previousHash}`,selectedKey=`jamd:backup:${selectedHash}`;
 const backups=await storage('pipeline',[['GET',previousKey],['GET',selectedKey]]);
 if(backups?.length!==2||backups.some((row,index)=>row?.error||row?.result===undefined||(index===1||row.result!==null)&&!validBackup(row.result)))throw fail('BOTH_BACKUPS_REQUIRED',409);
 const checked=JSON.parse(backups[1].result).encrypted;
 if(await trialHash(JSON.stringify({iv:checked.iv,data:checked.data}))!==input.expectedBackupHash)throw fail('SYNC_CHANGED_REFRESH_FIRST',409);
 const archiveKey=`jamd:account:sync-archive:${owner}:${crypto.randomUUID()}`;
 const stamp=new Date(now()).toISOString(),archive=JSON.stringify({version:1,createdAt:stamp,previousAccount:raw,previousRecoveryHash:previousHash,selectedRecoveryHash:selectedHash,previousBackup:backups[0].result,selectedBackup:backups[1].result});
 const replacement=JSON.stringify({...record,wrappedRecovery:await wrapRecoveryCode(input.recoveryCode,secret),updatedAt:stamp,lastSyncRelinkArchive:archiveKey});
 const changed=await storage('pipeline',[['EVAL',replace,4,key,archiveKey,previousKey,selectedKey,raw,backups[0].result??'',backups[1].result,archive,replacement]]);
 if(changed?.[0]?.error||![0,1].includes(changed?.[0]?.result))throw fail('SYNC_UNAVAILABLE',503);
 if(changed[0].result!==1)throw fail('SYNC_CHANGED_REFRESH_FIRST',409);
 return {ok:true,linked:true,changed:true};
}
