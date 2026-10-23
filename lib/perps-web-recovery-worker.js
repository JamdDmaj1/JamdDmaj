// Bounded read-only chain reconciliation of already recorded manual entries.
// No builder, wallet, signing, submission or close authority is accepted.
import {setTimeout as delay} from 'node:timers/promises';
import {requireManualPerpsPolicyStore} from './perps-manual-policy-store.js';
import {requireWebPerpsSubmissionJournal} from './perps-web-submission-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {reconcileRiskBoundWebEntry} from './perps-web-risk-recovery.js';
import {reconcileClosedServerPerpsPositions} from './perps-position-closure.js';
export function createWebPerpsRecoveryWorker({policyStore,journal,riskJournal,rpcRequest,readAccount,now=Date.now,monotonicNow=()=>performance.now(),wait=delay}={}){
 requireManualPerpsPolicyStore(policyStore);requireWebPerpsSubmissionJournal(journal);requirePerpsExecutionJournal(riskJournal);
 if([rpcRequest,readAccount,now,monotonicNow,wait].some(v=>typeof v!=='function'))throw Error('WEB_RECOVERY_WORKER_UNAVAILABLE');
 let active=null,afterWallet='';
 async function loop({signal,once=false}){
  while(!signal?.aborted){
   const wallets=policyStore.listWallets({afterWallet,limit:20}),counts={checked:0,reconciled:0,held:0};
   for(const walletAddress of wallets){
    if(signal?.aborted)break;afterWallet=walletAddress;counts.checked++;
    try{
     const pending=journal.pending(walletAddress);
     if(pending){const result=await reconcileRiskBoundWebEntry(pending.review_id,{journal,riskJournal,rpcRequest,readAccount,now,monotonicNow});if(result)counts.reconciled++;else counts.held++;}
     if(riskJournal.openPositions(walletAddress).length)await reconcileClosedServerPerpsPositions(riskJournal,walletAddress,{request:rpcRequest,readFinalizedAccount:readAccount,now});
    }catch{counts.held++;}
   }
   if(wallets.length<20)afterWallet='';
   if(once)return Object.freeze({stage:'WEB_RECOVERY_CYCLE_COMPLETE',...counts,financialSubmissionEnabled:false});
   try{await wait(15000,undefined,{signal});}catch{if(signal?.aborted)break;throw Error('WEB_RECOVERY_WORKER_UNAVAILABLE');}
  }
  return Object.freeze({stage:'WEB_RECOVERY_STOPPED',financialSubmissionEnabled:false});
 }
 return Object.freeze({run(options={}){if(active)return active;active=Promise.resolve().then(()=>loop(options)).finally(()=>{active=null;});return active;}});
}
