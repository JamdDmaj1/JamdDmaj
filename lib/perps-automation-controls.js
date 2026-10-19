// Durable server-side policy, not authentication, custody or execution itself.
// HTTP adapters MUST obtain ownerAccountHash from a verified server session,
// never from a request body. Provision/readForExecutor/pauseForRisk are private
// service operations and must not be exposed as client-selected API actions.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute} from 'node:path';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import bs58 from 'bs58';
import {validateAutomationSettings} from './automation-panel.js';
import {planDailyLossAction} from './automation-settings.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
const FIELDS=new Set(['capital','loss','positions','margin','leverage','dailyTrades','stopLossPercent','takeProfitPercent','lossAction','reductionPercent']);
function fail(reason='PERPS_CONTROLS_UNAVAILABLE'){throw Error(reason);}
function owner(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
function wallet(value){try{const bytes=bs58.decode(value);if(bytes.length!==32||bs58.encode(bytes)!==value)fail();return value;}catch{fail();}}
function revision(value){if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))fail('STALE_PERPS_CONTROLS');return value;}
function hash(value){return createHash('sha256').update(value).digest('hex');}
function canonical(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!FIELDS.has(k)))fail('INVALID_PERPS_SETTINGS');
 for(const [key,v]of Object.entries(value))if(key!=='lossAction'&&v!==null&&v!==''&&(typeof v!=='number'||!Number.isFinite(v)))fail('INVALID_PERPS_SETTINGS');
 let result;try{
  result=validateAutomationSettings(value);
  for(const key of ['capital','loss','margin'])exactUsdUnits(result[key]);
  if(result.margin<10||result.capital<10)fail();
 }catch{fail('INVALID_PERPS_SETTINGS');}
 return result;
}
export function openPerpsAutomationControls(path,{now=Date.now,monotonicNow=()=>performance.now(),authorizeActivation=null}={}){
 if(typeof path!=='string'||!isAbsolute(path)||typeof now!=='function'||typeof monotonicNow!=='function'||authorizeActivation!==null&&typeof authorizeActivation!=='function')fail();
 const db=new DatabaseSync(path,{timeout:5000});
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
  CREATE TABLE IF NOT EXISTS perps_automation_controls (
   wallet TEXT PRIMARY KEY, owner TEXT NOT NULL, revision TEXT NOT NULL UNIQUE,
   settings TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), paused INTEGER NOT NULL CHECK(paused IN(0,1)),
   reason TEXT NOT NULL, updated INTEGER NOT NULL, challenge_hash TEXT, challenge_issued INTEGER, challenge_expires INTEGER,
   risk_day TEXT, risk_loss_units TEXT
  ) STRICT;
  CREATE TABLE IF NOT EXISTS perps_automation_audit (
   sequence INTEGER PRIMARY KEY, wallet TEXT NOT NULL, revision TEXT NOT NULL, action TEXT NOT NULL,
   at INTEGER NOT NULL, settings_hash TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS perps_control_request_quota (
   owner TEXT PRIMARY KEY, bucket INTEGER NOT NULL, count INTEGER NOT NULL CHECK(count>0)
  ) STRICT;`);
 function time(row){const value=now();if(!Number.isSafeInteger(value)||value<0||row&&value<row.updated)fail();return value;}
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 function readWallet(address){const row=db.prepare('SELECT * FROM perps_automation_controls WHERE wallet=?').get(wallet(address));if(!row)fail();return row;}
 function owned(account,address){const row=readWallet(address);if(row.owner!==owner(account))fail();return row;}
 function current(row,expected){if(row.revision!==revision(expected))fail('STALE_PERPS_CONTROLS');}
 function state(row){return Object.freeze({walletAddress:row.wallet,revision:row.revision,settings:Object.freeze(canonical(JSON.parse(row.settings))),
  enabled:row.enabled===1,paused:row.paused===1,reason:row.reason,updatedAt:row.updated,riskDay:row.risk_day,riskLossUsdcUnits:row.risk_loss_units});}
 function audit(row,action){db.prepare('INSERT INTO perps_automation_audit(wallet,revision,action,at,settings_hash) VALUES(?,?,?,?,?)').run(row.wallet,row.revision,action,row.updated,hash(row.settings));}
 function change(row,{settings=JSON.parse(row.settings),enabled=false,paused=true,reason,riskDay=row.risk_day,riskLoss=row.risk_loss_units,action}){
  const id=randomUUID(),at=time(row),encoded=JSON.stringify(canonical(settings));
  db.prepare(`UPDATE perps_automation_controls SET revision=?,settings=?,enabled=?,paused=?,reason=?,updated=?,challenge_hash=NULL,
   challenge_issued=NULL,challenge_expires=NULL,risk_day=?,risk_loss_units=? WHERE wallet=? AND revision=?`)
   .run(id,encoded,Number(enabled),Number(paused),reason,at,riskDay,riskLoss,row.wallet,row.revision);
  const next=readWallet(row.wallet);if(next.revision!==id)fail('STALE_PERPS_CONTROLS');audit(next,action);return state(next);
 }
 function challenge(row,token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof row.challenge_hash!=='string'||!/^[a-f0-9]{64}$/.test(row.challenge_hash)
   ||!Number.isSafeInteger(row.challenge_issued)||!Number.isSafeInteger(row.challenge_expires)||time(row)<row.challenge_issued||time(row)>=row.challenge_expires
   ||!timingSafeEqual(Buffer.from(hash(token),'hex'),Buffer.from(row.challenge_hash,'hex')))fail('INVALID_PERPS_ACTIVATION_APPROVAL');
 }
 function activationBudget(account,settings){
  const units=key=>BigInt(exactUsdUnits(settings[key]));
  if(BigInt(account.availableUsdcUnits)<units('margin')||BigInt(account.payerLamports)===0n||account.openPositions>=settings.positions
   ||account.tradesToday>=settings.dailyTrades||BigInt(account.allocatedUsdcUnits)+units('margin')>units('capital')
   ||BigInt(account.lossTodayUsdcUnits)+BigInt(account.allocatedUsdcUnits)+units('margin')>units('loss'))fail('PERPS_ACTIVATION_RISK_LIMIT');
 }
 return {
  close(){db.close();},
  consumeRequestQuota({ownerAccountHash}){return transaction(()=>{
   owner(ownerAccountHash);const bucket=Math.floor(time()/60000),row=db.prepare('SELECT bucket,count FROM perps_control_request_quota WHERE owner=?').get(ownerAccountHash);
   if(row&&(row.bucket>bucket||row.bucket===bucket&&row.count>=60))return false;
   db.prepare(`INSERT INTO perps_control_request_quota(owner,bucket,count) VALUES(?,?,1)
    ON CONFLICT(owner) DO UPDATE SET bucket=excluded.bucket,count=CASE WHEN perps_control_request_quota.bucket=excluded.bucket THEN perps_control_request_quota.count+1 ELSE 1 END`)
    .run(ownerAccountHash,bucket);return true;
  });},
  provision({ownerAccountHash,walletAddress,settings}){return transaction(()=>{
   owner(ownerAccountHash);wallet(walletAddress);const value=canonical(settings),at=time(),id=randomUUID();
   if(db.prepare('SELECT 1 FROM perps_automation_controls WHERE wallet=?').get(walletAddress))fail('PERPS_WALLET_ALREADY_PROVISIONED');
   db.prepare(`INSERT INTO perps_automation_controls(wallet,owner,revision,settings,enabled,paused,reason,updated)
    VALUES(?,?,?,?,0,1,'NOT_ACTIVATED',?)`).run(walletAddress,ownerAccountHash,id,JSON.stringify(value),at);
   const row=readWallet(walletAddress);audit(row,'PROVISION_DISABLED');return state(row);
  });},
  read({ownerAccountHash,walletAddress}){return state(owned(ownerAccountHash,walletAddress));},
  readForOwner({ownerAccountHash}){
   const rows=db.prepare('SELECT * FROM perps_automation_controls WHERE owner=? LIMIT 2').all(owner(ownerAccountHash));
   if(rows.length>1)fail();return rows.length?state(rows[0]):null;
  },
  readForExecutor({walletAddress}){const row=readWallet(walletAddress);time(row);return state(row);},
  save({ownerAccountHash,walletAddress,expectedRevision,settings}){return transaction(()=>{
   const row=owned(ownerAccountHash,walletAddress);current(row,expectedRevision);
   return change(row,{settings:canonical(settings),reason:'SETTINGS_CHANGED',action:'SAVE_AND_PAUSE'});
  });},
  pause({ownerAccountHash,walletAddress}){return transaction(()=>change(owned(ownerAccountHash,walletAddress),{reason:'USER_PAUSED',action:'USER_PAUSE'}));},
  issueActivationChallenge({ownerAccountHash,walletAddress,expectedRevision}){return transaction(()=>{
   const row=owned(ownerAccountHash,walletAddress);current(row,expectedRevision);const issued=time(row),token=randomBytes(32).toString('hex'),expiresAt=issued+60000;
   db.prepare('UPDATE perps_automation_controls SET challenge_hash=?,challenge_issued=?,challenge_expires=? WHERE wallet=? AND revision=?')
    .run(hash(token),issued,expiresAt,walletAddress,row.revision);
   return Object.freeze({walletAddress,revision:row.revision,settings:state(row).settings,token,expiresAt});
  });},
  async activate({ownerAccountHash,walletAddress,expectedRevision,token,explicitApproval}){
   if(explicitApproval!==true||!authorizeActivation)fail('PERPS_EXECUTION_NOT_CONFIGURED');
   const initial=owned(ownerAccountHash,walletAddress);current(initial,expectedRevision);challenge(initial,token);
   const started=monotonicNow();if(!Number.isFinite(started))fail();
   // This server-startup callback must verify the exclusive custody identity and
   // configured coordinator. A request-body "executionReady" is never accepted.
   const approval=await authorizeActivation(Object.freeze({ownerAccountHash,walletAddress,revision:initial.revision,settings:state(initial).settings}));
   if(approval?.custodyAuthorized!==true||approval.executionReady!==true)fail('PERPS_EXECUTION_NOT_CONFIGURED');
   return transaction(()=>{
    const row=owned(ownerAccountHash,walletAddress);current(row,expectedRevision);challenge(row,token);
    const elapsed=monotonicNow()-started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>10000)fail('EXPIRED_PERPS_ACTIVATION_REVIEW');
    const account=requireFreshServerPerpsDailyAccount(approval.dailyAccount,{walletAddress});
    if(account.day!==new Date(time(row)).toISOString().slice(0,10))fail('EXPIRED_PERPS_ACTIVATION_REVIEW');
    activationBudget(account,canonical(JSON.parse(row.settings)));
    return change(row,{enabled:true,paused:false,reason:'EXPLICITLY_ACTIVATED',action:'USER_ACTIVATION'});
   });
  },
  pauseForRisk({walletAddress,expectedRevision,dailyAccount}){return transaction(()=>{
   const row=readWallet(walletAddress);current(row,expectedRevision);
   const account=requireFreshServerPerpsDailyAccount(dailyAccount,{walletAddress}),settings=canonical(JSON.parse(row.settings));
   if(account.day!==new Date(time(row)).toISOString().slice(0,10))fail();
   if(BigInt(account.lossTodayUsdcUnits)<BigInt(exactUsdUnits(settings.loss)))return state(row);
   if(row.risk_day===account.day&&row.enabled===0&&row.paused===1&&row.reason==='DAILY_LOSS_LIMIT')return state(row);
   // Polling the same breached limit must not repeatedly halve sizing. The
   // daily action is applied once; saving controls cannot reset that marker.
   const plan=row.risk_day===account.day?{nextSettings:{...settings}}:planDailyLossAction(settings);
   // A reduction never produces an unsupported margin or silently raises an
   // existing trade's risk. At the protocol minimum, remain paused at 10 USDC.
   plan.nextSettings.margin=Math.max(10,plan.nextSettings.margin);
   return change(row,{settings:plan.nextSettings,reason:'DAILY_LOSS_LIMIT',riskDay:account.day,riskLoss:account.lossTodayUsdcUnits,action:'DAILY_LOSS_'+settings.lossAction.toUpperCase().replaceAll('-','_')});
  });},
  audit({ownerAccountHash,walletAddress}){
   owned(ownerAccountHash,walletAddress);
   return Object.freeze(db.prepare('SELECT sequence,revision,action,at,settings_hash AS settingsHash FROM perps_automation_audit WHERE wallet=? ORDER BY sequence DESC LIMIT 100').all(walletAddress).map(row=>Object.freeze({...row})));
  }
 };
}
