// Paced server worker lifecycle. No key creation, activation, network defaults,
// automatic resubmission, or timeout that abandons an in-flight financial cycle.
import {setTimeout as delay} from 'node:timers/promises';
import bs58 from 'bs58';
const STAGES=new Set(['OBSERVATION_ONLY','CYCLE_ALREADY_RUNNING','RECONCILIATION_ONLY','AUTOMATION_INACTIVE','RECONCILIATION_REQUIRED','EXIT_CLEANUP_REQUIRED','BACKUP_VERIFICATION_REQUIRED',
 'DAILY_LOSS_PAUSED','REMOTE_PAUSED','NO_NEW_PUBLISHED_SIGNAL','EXECUTION_BLOCKED','BROADCAST_ACKNOWLEDGED','BROADCAST_UNKNOWN',
 'EXIT_CLEANUP_BLOCKED','CANCELLATION_BROADCAST_ACKNOWLEDGED','CANCELLATION_BROADCAST_UNKNOWN']);
function fail(){throw Error('PERPS_WORKER_CONFIGURATION_UNAVAILABLE');}
function wallet(value){try{if(typeof value!=='string'||bs58.decode(value).length!==32||bs58.encode(bs58.decode(value))!==value)fail();return value;}catch{fail();}}
export function createServerPerpsWorker({mode='maintenance',controls,executor,pollMs=15000,batchSize=20,now=Date.now,wait=delay,saveStatus}={}){
 if(!['maintenance','execute'].includes(mode)||typeof controls?.listForWorker!=='function'||typeof executor?.runOnce!=='function'||typeof executor?.reconcileOnly!=='function'
  ||!Number.isSafeInteger(pollMs)||pollMs<1000||pollMs>60000||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>50||typeof now!=='function'||typeof wait!=='function'||typeof saveStatus!=='function')fail();
 let afterWallet=null,active=null;
 function time(){const value=now();if(!Number.isSafeInteger(value)||value<0)fail();return value;}
 async function loop({signal,once=false}){
  try{
   while(!signal?.aborted){
    const rows=controls.listForWorker({afterWallet,limit:batchSize});
    if(!Array.isArray(rows)||rows.length>batchSize)fail();
    let previous=afterWallet??'';const accounts=[];
    // Validate the ENTIRE bounded page before dispatching any account. The
    // authoritative inventory comes from private durable controls, not clients.
    for(const row of rows){
     if(!row||typeof row.ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(row.ownerAccountHash)||wallet(row.walletAddress)<=previous)fail();
     previous=row.walletAddress;accounts.push(Object.freeze({ownerAccountHash:row.ownerAccountHash,walletAddress:row.walletAddress}));
    }
    const counts={};let checked=0;
    for(const account of accounts){
     if(signal?.aborted)break;
     let stage;
     try{
      const result=await executor[mode==='maintenance'?'reconcileOnly':'runOnce'](account);
      stage=STAGES.has(result?.stage)?result.stage:'EXECUTION_BLOCKED';
     }catch{stage='EXECUTION_BLOCKED';}
     counts[stage]=(counts[stage]??0)+1;checked++;afterWallet=account.walletAddress;
    }
    // A short/empty page ends this inventory sweep, but never spins in-place.
    if(checked===accounts.length&&rows.length<batchSize)afterWallet=null;
    const report=Object.freeze({stage:signal?.aborted?'WORKER_STOPPED':'WORKER_CYCLE_COMPLETE',mode,observedAt:time(),checked,results:Object.freeze(counts),
     readyForSigning:false,activationRequested:false});
    await saveStatus(report);if(once||signal?.aborted)return report;
    try{await wait(pollMs,undefined,{signal});}catch{if(signal?.aborted)break;fail();}
   }
   const stopped=Object.freeze({stage:'WORKER_STOPPED',mode,observedAt:time(),checked:0,results:Object.freeze({}),readyForSigning:false,activationRequested:false});
   await saveStatus(stopped);return stopped;
  }catch{
   // Do not claim a failed worker is running, and never expose upstream error
   // text, credentials, addresses or owner hashes through aggregated status.
   try{await saveStatus(Object.freeze({stage:'WORKER_FAILED',mode,observedAt:time(),readyForSigning:false,activationRequested:false}));}catch{}
   throw Error('PERPS_WORKER_UNAVAILABLE');
  }
 }
 return Object.freeze({
  run({signal,once=false}={}){
   if(typeof once!=='boolean'||signal&&(!(signal instanceof AbortSignal)))fail();
   if(active)return active;
   // Publish the single-flight promise before invoking ANY dependency, even a
   // synchronous callback that reenters run() during the first dispatch.
   active=Promise.resolve().then(()=>loop({signal,once})).finally(()=>{active=null;});return active;
  }
 });
}
