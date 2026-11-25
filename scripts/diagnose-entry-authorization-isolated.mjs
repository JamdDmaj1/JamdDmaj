// Diagnostic on private SQLite snapshots ONLY. No custody vault import, private
// key, signing implementation, or financial send transport is available here.
import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdtempSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openBotSwapJournal} from '../lib/perps-bot-swap-journal.js';
import {openPerpsBackupRegistry,requireVerifiedPerpsCustodyBackup} from '../lib/perps-backup-registry.js';
import {openManualPerpsPolicyStore} from '../lib/perps-manual-policy-store.js';
import {openPerpsPlatformFeeJournal} from '../lib/perps-platform-fee-journal.js';
import {openPerpsPlatformFeePaymentJournal} from '../lib/perps-platform-fee-payment-journal.js';
import {createBotManualEntryFunding} from '../lib/perps-bot-manual-entry-funding.js';
import {createServerPerpsReadOnlyRpc} from '../lib/perps-server-rpc.js';
import {createServerPerpsCustodyRiskReader} from '../lib/perps-server-daily-account.js';
import {createPerpsNetworkFeeValuationReader} from '../lib/perps-network-fee-valuation.js';
import {createPerpsConversionUsdValuationReader} from '../lib/perps-conversion-usd-valuation.js';
import {createPerpsEntryConversionUsdValuationReader} from '../lib/perps-entry-conversion-usd-valuation.js';
import {createPerpsEntryRecoveryUsdValuationReader} from '../lib/perps-entry-recovery-usd-valuation.js';
import {PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
import {PERPS_PLATFORM_FEE} from '../lib/perps-platform-fee.js';
const stores=[],now=Date.now,monotonicNow=()=>performance.now();let stage='snapshot',signatureBoundary=false;
try{
 const directory=mkdtempSync('/opt/jamddmaj-perps/checks/entry-auth-isolated-');chmodSync(directory,0o700);
 for(const name of ['journal','swaps','backup','manual-policy','fees','payments']){
  const source=new DatabaseSync('/var/lib/private/jamddmaj-perps-runtime/'+name+'.sqlite',{readOnly:true});
  try{await backup(source,join(directory,name+'.sqlite'));chmodSync(join(directory,name+'.sqlite'),0o600);}finally{source.close();}
 }
 const controlDb=new DatabaseSync('/var/lib/private/jamddmaj-perps-controls/controls.sqlite',{readOnly:true});stores.push(controlDb);
 const metadata=new DatabaseSync(join(directory,'journal.sqlite'),{readOnly:true});
 const row=metadata.prepare('SELECT p.wallet,h.draft_json FROM perps_entry_conversion_holds h JOIN perps_reservations p ON p.reservation=h.reservation ORDER BY h.created DESC LIMIT 1').get();metadata.close();if(!row)throw Error('NO_ENTRY_FIXTURE');
 const control=controlDb.prepare('SELECT owner,wallet,revision,enabled,paused FROM perps_automation_controls WHERE wallet=?').get(row.wallet);if(!control||control.enabled!==0||control.paused!==1)throw Error('DIAGNOSTIC_REQUIRES_PAUSED_ACCOUNT');
 const who={ownerAccountHash:control.owner,walletAddress:control.wallet};
 const controls={read(identity){if(JSON.stringify(identity)!==JSON.stringify(who))throw Error('DIAGNOSTIC_OWNER_MISMATCH');return {walletAddress:control.wallet,revision:control.revision,enabled:false,paused:true};}};
 const owned=identity=>controls.read(identity);
 const journal=openPerpsExecutionJournal(join(directory,'journal.sqlite'));stores.push(journal);
 const swapJournal=openBotSwapJournal(join(directory,'swaps.sqlite'));stores.push(swapJournal);
 const backupRegistry=openPerpsBackupRegistry(join(directory,'backup.sqlite'));stores.push(backupRegistry);
 const policyStore=openManualPerpsPolicyStore(join(directory,'manual-policy.sqlite'));stores.push(policyStore);
 const feeJournal=openPerpsPlatformFeeJournal(join(directory,'fees.sqlite'),{entryJournal:journal,controls});stores.push(feeJournal);
 const paymentJournal=openPerpsPlatformFeePaymentJournal(join(directory,'payments.sqlite'));stores.push(paymentJournal);
 const assertCustody=identity=>{owned(identity);const proof=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(identity),identity);if(!proof.platformFeeStateIncluded||!proof.botSwapStateIncluded)throw Error('DIAGNOSTIC_BACKUP_SCOPE_MISSING');};
 const gate=identity=>{assertCustody(identity);if(journal.pending(identity.walletAddress).length||swapJournal.pending(identity.walletAddress).length||journal.pendingPositionCloses(identity.walletAddress).length||journal.pendingPlatformFeePayments(identity.walletAddress).length)throw Error('DIAGNOSTIC_PENDING_ACTION');return owned(identity);};
 const env=Object.fromEntries(readFileSync('/proc/'+process.argv[2]+'/environ','utf8').split('\0').filter(Boolean).map(v=>{const at=v.indexOf('=');return [v.slice(0,at),v.slice(at+1)];}));
 const url=env.JAMDDMAJ_PERPS_RPC_URL||'https://api.mainnet-beta.solana.com';console.log(JSON.stringify({stage:'rpc-configuration',configured:!!env.JAMDDMAJ_PERPS_RPC_URL,host:new URL(url).hostname}));
 // Diagnostic co-sampling only: preserve same-bank checks, never widen them.
 let queued=[],scheduled=false,nextStart=0;
 const coSampleFetch=(endpoint,options)=>new Promise((resolve,reject)=>{
  queued.push({endpoint,options,resolve,reject});if(scheduled)return;scheduled=true;
  setTimeout(async()=>{const group=queued;queued=[];scheduled=false;
   try{
    if(group.length>8)throw Error('DIAGNOSTIC_BATCH_TOO_LARGE');
    const start=Math.max(Date.now(),nextStart);nextStart=start+150*group.length;if(start>Date.now())await new Promise(resolve=>setTimeout(resolve,start-Date.now()));
    if(group.length===1){const r=await fetch(endpoint,options);if(!r.ok)console.log(JSON.stringify({stage:'rpc-http',status:r.status,method:JSON.parse(options.body).method}));group[0].resolve(r);return;}
    const messages=group.map(v=>JSON.parse(v.options.body));
    const response=await fetch(endpoint,{...options,signal:AbortSignal.any(group.map(v=>v.options.signal)),body:JSON.stringify(messages)});
    if(!response.ok){for(const item of group)item.resolve(response.clone());return;}
    const replies=await response.json();if(!Array.isArray(replies)||replies.length!==messages.length)throw Error('DIAGNOSTIC_BATCH_INVALID');
    for(let i=0;i<group.length;i++){const found=replies.filter(v=>v.id===messages[i].id);if(found.length!==1)throw Error('DIAGNOSTIC_BATCH_INVALID');if(found[0].error)console.log(JSON.stringify({stage:'rpc-error',method:messages[i].method,code:found[0].error.code}));group[i].resolve(Response.json(found[0]));}
   }catch(error){for(const item of group)item.reject(error);}
  },5);
 });
 const rpcRequest=createServerPerpsReadOnlyRpc({url,readSpacingMs:0,fetchImpl:coSampleFetch});
 const reader=createServerPerpsCustodyRiskReader({request:rpcRequest,journal,swapJournal,paymentJournal,
  verifyExclusiveCustody:identity=>({...identity,purpose:'jamddmaj-perps-automation',exclusive:true}),
  readNetworkFees:createPerpsNetworkFeeValuationReader({}),readConversionLoss:createPerpsConversionUsdValuationReader({}),
  readEntryConversionLoss:createPerpsEntryConversionUsdValuationReader({}),readEntryRecoveryLoss:createPerpsEntryRecoveryUsdValuationReader({})});
 const readAccount=async identity=>{stage='risk-account';const result=await reader(identity);stage='authorization';return result;};
 const blocked=()=>{throw Error('DIAGNOSTIC_FINANCIAL_SEND_FORBIDDEN');};
 const vault={signBotSwap(){signatureBoundary=true;throw Error('DIAGNOSTIC_SIGNATURE_BOUNDARY_REACHED');}};
 const platformFees={status:()=>({dueUnits:'0',pendingCount:0,failedCount:0}),assertActivationReadiness:async()=>{}};
 const engine=createBotManualEntryFunding({controls,vault,journal,swapJournal,policyStore,backupRegistry,readAccount,rpcRequest,sendRequest:blocked,feeJournal,platformFees,owned,assertCustody,gate,operation:blocked,isRunning:()=>true,now,monotonicNow});
 const draft=JSON.parse(row.draft_json),response=await fetch('https://perps-api.jup.ag/v1/market-stats?mint='+PERPS_CUSTODIES[draft.asset].mint);if(!response.ok)throw Error('REFERENCE_UNAVAILABLE');draft.referencePrice=Number((await response.json()).price).toFixed(6);
 stage='prepare';const review=await engine.prepare({who,draft});console.log(JSON.stringify({stage:'isolated-review',ok:true,remainingMs:review.expiresAt-now()}));
 stage='confirm';await engine.confirm({...who,id:review.id,explicitApproval:true,explicitFeeApproval:true,feeTermsVersion:PERPS_PLATFORM_FEE.version});
}catch(error){console.log(JSON.stringify({stage,signatureBoundary,submitted:false,liveStateChanged:false,code:/^[A-Z_]{1,100}$/.test(error.message)?error.message:'DIAGNOSTIC_UNAVAILABLE',frames:String(error.stack).split('\n').slice(1,4).map(v=>v.replace(/file:\/\/.*entry-auth-isolated-[^/]+/g,'isolated'))}));if(!signatureBoundary)process.exitCode=1;}
finally{for(const store of stores.reverse())store.close();}
