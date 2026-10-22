// Read-only chain/account recovery plus an explicit shared-ledger settlement.
// This never signs, submits, rebuilds a quote or clears the web wallet barrier.
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireWebPerpsSubmissionJournal} from './perps-web-submission-journal.js';
import {readWebPerpsSubmissionReceipt} from './perps-web-broadcast.js';
import {readWebPerpsFinalizedPosition,requireVerifiedWebPerpsPosition} from './perps-web-position-recovery.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {isVerifiedPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
const proofs=new WeakMap(),releaseProofs=new WeakMap();
function fail(){throw Error('WEB_PERPS_RISK_SETTLEMENT_NOT_VERIFIED');}
export function consumeWebPerpsRiskSettlement(value,{riskJournal,webJournal}={}){
 const proof=proofs.get(value);if(!proof||proof.used||proof.riskJournal!==riskJournal||proof.webJournal!==webJournal)fail();
 proof.check();proof.used=true;return proof;
}
export function authorizeWebPerpsBarrierRelease(value,{riskJournal,webJournal}={}){
 const proof=proofs.get(value);if(!proof||!proof.used||proof.riskJournal!==riskJournal||proof.webJournal!==webJournal)fail();proof.check();
 const parent=riskJournal.read(value.reservationId),before=JSON.parse(proof.parentJson),next=proof.receipt.state==='CONFIRMED'?'OPEN':'CLOSED';
 if(parent?.state!==next||parent.confirmed_slot!==proof.receipt.slot||parent.day!==proof.receipt.executionDay)fail();
 for(const name of Object.keys(before))if(!['state','day','updated','confirmed_slot'].includes(name)&&parent[name]!==before[name])fail();
 const parentJson=JSON.stringify(parent),webJson=JSON.stringify(webJournal.read(value.reviewId));
 const check=()=>{proof.check();if(JSON.stringify(riskJournal.read(value.reservationId))!==parentJson||JSON.stringify(webJournal.read(value.reviewId))!==webJson)fail();};
 check();const grant=Object.freeze({stage:'WEB_PERPS_RECONCILED_BARRIER_RELEASE',reviewId:value.reviewId,walletAddress:value.walletAddress,signature:value.signature,
  financialState:next,confirmedSlot:proof.receipt.slot,executionDay:proof.receipt.executionDay});
 releaseProofs.set(grant,{webJournal,check,parentJson,webJson,used:false});return grant;
}
export function consumeWebPerpsBarrierRelease(value,{webJournal}={}){
 const proof=releaseProofs.get(value);if(!proof||proof.used||proof.webJournal!==webJournal)fail();proof.check();proof.used=true;return proof;
}
export async function readWebPerpsRiskSettlement(reviewId,{journal:webJournal,riskJournal,rpcRequest,readAccount,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePerpsExecutionJournal(riskJournal);requireWebPerpsSubmissionJournal(webJournal);
 if(typeof rpcRequest!=='function'||typeof readAccount!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 const web=webJournal.read(reviewId),id='web:'+reviewId,parent=riskJournal.read(id);
 if(!web||!parent||parent.signal!==id||parent.wallet!==web.wallet||parent.signature!==web.signature||parent.wire_hash!==web.wire_hash
  ||!['UNCERTAIN','OPEN','CLOSED'].includes(parent.state))fail();
 const packet=JSON.parse(web.packet_json);
 if(parent.position_address!==packet.preparation.positionPubkey||String(parent.margin)!==packet.review.marginUsdcUnits||parent.entry_exit_plan===null)fail();
 const encoded=JSON.stringify(web),parentJson=JSON.stringify(parent),started=monotonicNow(),at=now();
 const current=()=>{const age=monotonicNow()-started,clock=now();if(!Number.isFinite(age)||age<0||age>10000||!Number.isSafeInteger(clock)||clock<at||clock-at>10000
  ||JSON.stringify(webJournal.read(reviewId))!==encoded)fail();};
 current();const receipt=await readWebPerpsSubmissionReceipt(reviewId,{journal:webJournal,rpcRequest,now});current();if(receipt===null)return null;
 let position=null;
 if(receipt.state==='CONFIRMED'){
  position=await readWebPerpsFinalizedPosition(reviewId,{journal:webJournal,rpcRequest,now,monotonicNow});current();
  if(!position||position.entrySlot!==receipt.slot||position.entryExitPlan!==parent.entry_exit_plan)fail();
 }
 const minimumSlot=position?.observedSlot??receipt.slot;
 const account=await readAccount({walletAddress:web.wallet,minimumSlot});current();
 const check=()=>{
  current();requireFreshServerPerpsDailyAccount(account,{walletAddress:web.wallet,minimumSlot,journal:riskJournal});
  if(!isVerifiedPerpsBroadcastReceipt(receipt)||receipt.confirmationStatus!=='finalized'||now()-receipt.observedAt>10000||receipt.observedAt>now()+2000
   ||account.commitment!=='finalized'||account.requiresExclusiveCustodyJournal===true||account.requiresReconciledDailyAccounting!==false
   ||account.walletNetworkFeesLamports!=='0'&&account.networkFeesIncludedInUsdLoss!==true)fail();
  if(receipt.executionDay===account.day){
   const transactions=account.transactions.filter(tx=>tx.signature===web.signature);
   if(transactions.length!==1||transactions[0].slot!==receipt.slot||transactions[0].failed!==(receipt.state==='FAILED'))fail();
   requireVerifiedServerPerpsTradeTransaction(transactions[0]);
  }
  if(position){
   requireVerifiedWebPerpsPosition(position,{journal:webJournal});
   const actual=account.positions.find(p=>p.address===position.positionAddress);
   if(JSON.stringify(actual)!==JSON.stringify(position.position))fail();
  }
 };
 check();if(JSON.stringify(riskJournal.read(id))!==parentJson)fail();
 const value=Object.freeze({stage:'WEB_PERPS_SHARED_RISK_SETTLEMENT',reviewId,reservationId:id,walletAddress:web.wallet,signature:web.signature,
  nextState:receipt.state==='CONFIRMED'?'OPEN':'CLOSED',readyForSigning:false,tradingEnabled:false});
 proofs.set(value,{riskJournal,webJournal,parentJson,receipt,account,position,check,used:false});return value;
}
export async function reconcileRiskBoundWebEntry(reviewId,options={}){
 requireWebPerpsSubmissionJournal(options.journal);requirePerpsExecutionJournal(options.riskJournal);
 const previous=options.journal.readFinancialSettlement(reviewId);
 if(previous){
  const parent=options.riskJournal.read('web:'+reviewId),original=JSON.parse(previous.risk_row_json);
  if(!parent||!['OPEN','CLOSED'].includes(parent.state))fail();
  for(const key of ['wallet','signal','reservation','margin','wire_hash','signature','position_address','entry_exit_plan','confirmed_slot','day'])if(parent[key]!==original[key])fail();
  return parent; // Historical settlement facts only, not fresh signing authority.
 }
 const proof=await readWebPerpsRiskSettlement(reviewId,options);if(proof===null)return null;
 const parent=options.riskJournal.reconcileWebSubmission(proof,{webJournal:options.journal});
 const grant=authorizeWebPerpsBarrierRelease(proof,{riskJournal:options.riskJournal,webJournal:options.journal});
 options.journal.recordFinancialSettlement(grant);return parent;
}
