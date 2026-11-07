// Exact finalized failed return only. No signing, resending, original-risk
// release or authority for a fresh attempt is provided by this evidence.
import {createHash} from 'node:crypto';
import {readRecordedPerpsEntryRecoveryMaterial} from './perps-entry-collateral-recovery-receipt.js';
import {readServerPerpsTradeTransaction,readVerifiedPerpsTransactionEvidence,requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {requireBotSwapJournal,requireBotSwapClaim} from './perps-bot-swap-journal.js';
import {readEntryRecoveryAttempts} from './perps-entry-recovery-attempts.js';
const proofs=new WeakMap();
const accountedFailures=new WeakMap();
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
// Only the verified immutable transaction belonging to this private failure
// proof. This is accounting evidence, never a custody/signing capability.
export function readFailedPerpsEntryRecoveryTransaction(value){
 requireFailedPerpsEntryRecovery(value);return proofs.get(value).transaction;
}
function requireFailureCosts(failure,{journal,executionJournal,account}={}){
 const native=proofs.get(failure);if(!native||native.journal!==journal||native.executionJournal!==executionJournal)fail();
 requireVerifiedServerPerpsTradeTransaction(native.transaction);
 const age=native.monotonicNow()-native.started;if(!Number.isFinite(age)||age<0||age>10000)fail();
 requireFreshServerPerpsDailyAccount(account,{walletAddress:failure.walletAddress,minimumSlot:failure.slot,journal:executionJournal});
 if(account.networkFeesIncludedInUsdLoss!==true||account.requiresReconciledDailyAccounting!==false||account.historyThroughSlot<failure.slot)fail();
 const tx=account.transactions.find(value=>value.signature===failure.signature);
 if(account.day===failure.day){if(!tx?.failed||tx.slot!==failure.slot||tx.walletFeeLamports!==failure.networkFeeLamports)fail();}
 else if(failure.day>=account.day||tx!==undefined)fail();
 const row=journal.read(failure.id);if(!['UNKNOWN','FAILED'].includes(row.state))fail();
 return row;
}
function requireFailureAccounting(failure,options){requireFailedPerpsEntryRecovery(failure,{journal:options?.journal});return requireFailureCosts(failure,options);}
export function reconcileAccountedFailedPerpsEntryRecovery(failure,{journal,executionJournal,account}={}){
 const row=requireFailureAccounting(failure,{journal,executionJournal,account});
 // The exact error and full current accounting retire only the swap exclusion.
 // The original converted collateral and execution reservation remain held.
 if(row.state==='UNKNOWN')journal.settle(row.id,row.signature,'FAILED');
 return Object.freeze({...failure,stage:'ACCOUNTED_FAILED_ENTRY_RECOVERY',state:'FAILED',accountingDay:account.day,
  feeIncludedInCurrentDay:account.day===failure.day,requiresNewReview:false,originalRiskReleased:false,readyForRetry:false});
}

// Read-only precondition for a future separately approved review. This proof
// neither changes attempts nor grants custody/submission authority.
export function proveAccountedEntryRecoveryFailures(failures,{journal,executionJournal,account,ownerAccountHash}={}){
 requireBotSwapJournal(journal);
 if(!Array.isArray(failures)||!failures.length||failures.length>32||!/^[a-f0-9]{64}$/.test(ownerAccountHash??''))fail();
 const first=failures[0];requireFailedPerpsEntryRecovery(first,{journal});
 const walletAddress=first.walletAddress,reservationId=first.reservationId;
 const parent=executionJournal.read(reservationId),hold=executionJournal.entryConversionHold(reservationId);
 if(!parent||!['RESERVED','UNCERTAIN'].includes(parent.state)||parent.wallet!==walletAddress||parent.signal!=='manual:'+reservationId||hold?.state!=='FINALIZED')fail();
 const source=journal.read(hold.conversion_id);
 if(source?.owner!==ownerAccountHash||source.wallet!==walletAddress||source.state!=='FINALIZED'||source.signature!==hold.signature
  ||hold.input_units!==String(parent.margin)||createHash('sha256').update(Buffer.from(source.signed,'base64')).digest('hex')!==hold.wire_hash)fail();
 const context={walletAddress,reservationId,conversionSignature:hold.signature};
 const chain=readEntryRecoveryAttempts(id=>journal.read(id),context),seen=new Set();
 if(!chain.current||!['FAILED','ABORTED'].includes(chain.current.state)||journal.pending(walletAddress).length)fail();
 for(const failure of failures){
  const row=requireFailureAccounting(failure,{journal,executionJournal,account});
  if(row.state!=='FAILED'||row.owner!==ownerAccountHash||failure.walletAddress!==walletAddress||failure.reservationId!==reservationId||seen.has(failure.id))fail();seen.add(failure.id);
 }
 const expected=chain.rows.filter(row=>row.state==='FAILED').map(row=>row.id).sort();
 if(JSON.stringify([...seen].sort())!==JSON.stringify(expected))fail();
 const byId=new Map(failures.map(failure=>[failure.id,failure]));
 for(const row of chain.rows){
  const review=JSON.parse(row.review);if(!review.previousFailure)continue;
  const native=byId.get(review.previousRecoveryId);
  if(!native||['signature','wireHash','slot','day'].some(key=>review.previousFailure[key]!==native[key]))fail();
 }
 const snapshot=(excludeId=null)=>JSON.stringify({parent:executionJournal.read(reservationId),hold:executionJournal.entryConversionHold(reservationId),
  conversion:journal.read(hold.conversion_id),attempts:readEntryRecoveryAttempts(id=>journal.read(id),context).rows.filter(row=>row.id!==excludeId)});
 const latest=failures.find(failure=>failure.id===chain.current.id);
 const previousFailure=chain.current.state==='FAILED'?Object.freeze({signature:latest.signature,wireHash:latest.wireHash,slot:latest.slot,day:latest.day}):null;
 const remaining=Math.min(...failures.map(failure=>{const native=proofs.get(failure);return 10000-(native.monotonicNow()-native.started);}));
 const expiresAt=Math.floor(Math.min(account.observedAt+remaining,Date.parse(account.day+'T00:00:00Z')+86400000));
 const value=Object.freeze({stage:'ACCOUNTED_ENTRY_RECOVERY_FAILURES_FOR_REVIEW',walletAddress,reservationId,previousRecoveryId:chain.current.id,
  day:account.day,expiresAt,previousFailure,failedSignatures:Object.freeze(failures.map(failure=>failure.signature)),minimumSlot:Math.max(...failures.map(failure=>failure.slot)),
  readyForSigning:false,readyForRetry:false,originalRiskReleased:false,requiresFreshExplicitApproval:true});
 accountedFailures.set(value,{journal,executionJournal,account,ownerAccountHash,failures:[...failures],context,snapshot,saved:snapshot(),used:false,appendedId:null});
 return requireAccountedEntryRecoveryFailures(value);
}
export function requireAccountedEntryRecoveryFailures(value,{journal,executionJournal,ownerAccountHash,previousRecoveryId}={}){
 const proof=accountedFailures.get(value);
 if(!proof||journal!==undefined&&journal!==proof.journal||executionJournal!==undefined&&executionJournal!==proof.executionJournal
  ||ownerAccountHash!==undefined&&ownerAccountHash!==proof.ownerAccountHash||previousRecoveryId!==undefined&&previousRecoveryId!==value.previousRecoveryId
  ||proof.snapshot(proof.appendedId)!==proof.saved)fail();
 if(proof.appendedId){
  const current=readEntryRecoveryAttempts(id=>proof.journal.read(id),proof.context).current;
  if(current?.id!==proof.appendedId||JSON.parse(current.review).previousRecoveryId!==value.previousRecoveryId)fail();
 }
 for(const failure of proof.failures)(proof.appendedId?requireFailureCosts:requireFailureAccounting)(failure,proof);
 return value;
}
// Called only inside the execution-journal lock. The sole permitted mutation is
// an append of the exact new claim; prior proofs, costs and rows stay immutable.
export function claimWithAccountedEntryRecoveryFailures(value,context,claim){
 requireAccountedEntryRecoveryFailures(value,context);const proof=accountedFailures.get(value);
 const chain=readEntryRecoveryAttempts(id=>proof.journal.read(id),proof.context);
 if(proof.used||typeof claim!=='function'||!/^[a-f0-9]{64}$/.test(context?.newAttemptId??'')||context?.journal!==proof.journal||context.executionJournal!==proof.executionJournal
  ||context.ownerAccountHash!==proof.ownerAccountHash||context.previousRecoveryId!==value.previousRecoveryId||context.newAttemptId!==chain.nextId)fail();
 proof.used=true;const result=claim(),row=requireBotSwapClaim(result,proof.journal);
 if(row.id!==context.newAttemptId||row.owner!==proof.ownerAccountHash||row.wallet!==value.walletAddress||row.signed!==null||row.signature!==null
  ||JSON.parse(row.review).previousRecoveryId!==value.previousRecoveryId)fail();
 proof.appendedId=context.newAttemptId;return result;
}
