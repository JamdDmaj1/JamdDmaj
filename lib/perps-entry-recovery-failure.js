// Exact finalized failed return only. No signing, resending, original-risk
// release or authority for a fresh attempt is provided by this evidence.
import {createHash} from 'node:crypto';
import {readRecordedPerpsEntryRecoveryMaterial} from './perps-entry-collateral-recovery-receipt.js';
import {readServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence,requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
const proofs=new WeakMap();
function fail(){throw Error('PERPS_ENTRY_RECOVERY_FAILURE_REQUIRED');}
export async function readFailedPerpsEntryRecovery(input,{request,now=Date.now,monotonicNow=()=>performance.now()}={}){
 const started=monotonicNow();if(!Number.isFinite(started))fail();
 requireBotSwapJournal(input.journal);const recorded=input.journal.read(input.id);
 if(typeof request!=='function'||!recorded||recorded.owner!==input.ownerAccountHash||!['UNKNOWN','FAILED'].includes(recorded.state))fail();
 const preliminary=await request('getSignatureStatuses',[[recorded.signature],{searchTransactionHistory:true}]);
 if(!Array.isArray(preliminary?.value)||preliminary.value.length!==1)fail();
 const preliminaryStatus=preliminary.value[0];if(preliminaryStatus===null||preliminaryStatus?.confirmationStatus!=='finalized')return null;
 if(!Object.hasOwn(preliminaryStatus,'err'))fail();if(preliminaryStatus.err===null)return null;
 const cachedRequest=(method,params)=>method==='getSignatureStatuses'&&params[0]?.length===1&&params[0][0]===recorded.signature?Promise.resolve(structuredClone(preliminary)):request(method,params);
 const material=await readRecordedPerpsEntryRecoveryMaterial(input,{request:cachedRequest,now,monotonicNow,failedReturnMode:true});
 if(JSON.stringify(material.row)!==JSON.stringify(recorded))fail();
 const {row,wire,binding,guarded,current}=material;
 const reply=await guarded('getSignatureStatuses',[[row.signature],{searchTransactionHistory:true}]);
 if(!Array.isArray(reply?.value)||reply.value.length!==1)fail();
 const status=reply.value[0];if(status===null||status?.confirmationStatus!=='finalized')return null;
 if(!Object.hasOwn(status,'err'))fail();if(status.err===null)return null;
 const tx=await guarded('getTransaction',[row.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(tx===null)return null;
 if(!Number.isSafeInteger(status.slot)||status.slot<binding.minimumSlot||!Number.isSafeInteger(reply.context?.slot)||reply.context.slot<status.slot||tx.slot!==status.slot
  ||JSON.stringify(tx.meta?.err)!==JSON.stringify(status.err)||tx.transaction?.[0]!==row.signed
  ||!Number.isSafeInteger(tx.blockTime)||tx.blockTime*1000<row.created-2000)fail();
 const day=new Date(tx.blockTime*1000).toISOString().slice(0,10);
 const transaction=await readServerPerpsTradeTransaction({walletAddress:row.wallet,signature:row.signature,day},
  {request:(method,params)=>method==='getTransaction'&&params[0]===row.signature?Promise.resolve(structuredClone(tx)):guarded(method,params),now,monotonicNow,requireTradeEvent:false});
 if(!transaction.failed||transaction.events.length||transaction.walletFeeLamports!==transaction.transactionFeeLamports)fail();
 const meta=tx.meta;
 if(!Array.isArray(meta.preBalances)||!Array.isArray(meta.postBalances)||!meta.preBalances.length||meta.preBalances.length!==meta.postBalances.length
  ||!Array.isArray(meta.preTokenBalances)||!Array.isArray(meta.postTokenBalances)||JSON.stringify(meta.preTokenBalances)!==JSON.stringify(meta.postTokenBalances))fail();
 for(let i=0;i<meta.preBalances.length;i++)if(!Number.isSafeInteger(meta.preBalances[i])||meta.preBalances[i]<0||!Number.isSafeInteger(meta.postBalances[i])||meta.postBalances[i]<0
  ||meta.postBalances[i]!==meta.preBalances[i]-(i===0?meta.fee:0))fail();
 const evidence=readVerifiedPerpsTransactionEvidence(transaction);
 if(evidence.wire!==row.signed||Buffer.from(evidence.wire,'base64').subarray(65).toString('base64')!==wire.messageBase64)fail();current();
 const value=Object.freeze({stage:'FINALIZED_RECORDED_ENTRY_RECOVERY_FAILURE',id:row.id,reservationId:binding.reservationId,walletAddress:row.wallet,
  signature:row.signature,wireHash:createHash('sha256').update(Buffer.from(row.signed,'base64')).digest('hex'),slot:transaction.slot,day,
  networkFeeLamports:transaction.walletFeeLamports,originalRiskReleased:false,readyForRetry:false,readyForSigning:false});
 proofs.set(value,{material,transaction,journal:input.journal,executionJournal:input.executionJournal,started,monotonicNow});return requireFailedPerpsEntryRecovery(value);
}
export function requireFailedPerpsEntryRecovery(value,{journal}={}){
 const proof=proofs.get(value);if(!proof||journal!==undefined&&journal!==proof.journal)fail();
 requireVerifiedServerPerpsTradeTransaction(proof.transaction);proof.material.current();
 const age=proof.monotonicNow()-proof.started;if(!Number.isFinite(age)||age<0||age>10000)fail();return value;
}
export function reconcileAccountedFailedPerpsEntryRecovery(failure,{journal,executionJournal,account}={}){
 requireFailedPerpsEntryRecovery(failure,{journal});
 if(proofs.get(failure).executionJournal!==executionJournal)fail();
 requireFreshServerPerpsDailyAccount(account,{walletAddress:failure.walletAddress,minimumSlot:failure.slot,journal:executionJournal});
 if(account.networkFeesIncludedInUsdLoss!==true||account.requiresReconciledDailyAccounting!==false||account.historyThroughSlot<failure.slot)fail();
 const tx=account.transactions.find(value=>value.signature===failure.signature);
 if(account.day===failure.day){if(!tx?.failed||tx.slot!==failure.slot||tx.walletFeeLamports!==failure.networkFeeLamports)fail();}
 else if(failure.day>=account.day||tx!==undefined)fail();
 const row=journal.read(failure.id);if(!['UNKNOWN','FAILED'].includes(row.state))fail();
 // The exact error and full current accounting retire only the swap exclusion.
 // The original converted collateral and execution reservation remain held.
 if(row.state==='UNKNOWN')journal.settle(row.id,row.signature,'FAILED');
 return Object.freeze({...failure,stage:'ACCOUNTED_FAILED_ENTRY_RECOVERY',state:'FAILED',accountingDay:account.day,
  feeIncludedInCurrentDay:account.day===failure.day,requiresNewReview:false,originalRiskReleased:false,readyForRetry:false});
}
