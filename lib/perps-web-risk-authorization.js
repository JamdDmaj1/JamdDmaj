// Server-only bridge to the SHARED execution risk ledger. No key use or send.
// Limits come from a synchronous authenticated server policy reader, never the
// request body. The account must be real finalized complete daily evidence.
import {createHash} from 'node:crypto';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {readWebPerpsSubmissionInspection} from './perps-web-submission-journal.js';
import {readInspectedPerpsManualReview} from './perps-manual-preparation.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const proofs=new WeakMap();
function fail(){throw Error('WEB_PERPS_RISK_NOT_AUTHORIZED');}
function policy(value,wallet){
 if(!value||Object.keys(value).sort().join(',')!=='limits,revision,walletAddress'||value.walletAddress!==wallet
  ||typeof value.revision!=='string'||!value.revision||value.revision.length>180||/[\x00-\x1f]/.test(value.revision))fail();
 const limits=value.limits;
 if(!limits||Object.keys(limits).sort().join(',')!=='capitalUsd,dailyLossUsd,dailyTrades,positions'||typeof limits.capitalUsd!=='string'||typeof limits.dailyLossUsd!=='string'
  ||BigInt(exactUsdUnits(limits.dailyLossUsd))>BigInt(exactUsdUnits(limits.capitalUsd))||!Number.isSafeInteger(limits.positions)||limits.positions<1||limits.positions>10
  ||!Number.isSafeInteger(limits.dailyTrades)||limits.dailyTrades<1||limits.dailyTrades>100)fail();
 return JSON.stringify({walletAddress:wallet,revision:value.revision,limits:{capitalUsd:limits.capitalUsd,dailyLossUsd:limits.dailyLossUsd,positions:limits.positions,dailyTrades:limits.dailyTrades}});
}
export function readWebPerpsRiskAuthorization(value,{journal}={}){
 const proof=proofs.get(value);if(!proof||proof.journal!==journal)fail();proof.check();return proof;
}
export function consumeWebPerpsRiskAuthorization(value,{journal}={}){
 const proof=readWebPerpsRiskAuthorization(value,{journal});if(proof.used)fail();proof.used=true;return proof;
}
export async function authorizeWebPerpsRisk(evidence,{journal,readAccount,readLimits}={}){
 requirePerpsExecutionJournal(journal);if(typeof readAccount!=='function'||typeof readLimits!=='function')fail();
 const native=readWebPerpsSubmissionInspection(evidence),wallet=native.packet.review.walletAddress;
 const expected=policy(readLimits({walletAddress:wallet}),wallet),limits=JSON.parse(expected).limits;
 const snapshot=await readAccount({walletAddress:wallet,minimumSlot:native.packet.review.observedSlot});
 const check=()=>{
  readWebPerpsSubmissionInspection(evidence);
  requireFreshServerPerpsDailyAccount(snapshot,{walletAddress:wallet,minimumSlot:native.packet.review.observedSlot,journal});
  if(snapshot.commitment!=='finalized'||snapshot.requiresExclusiveCustodyJournal===true||policy(readLimits({walletAddress:wallet}),wallet)!==expected)fail();
 };
 check();const proof=readInspectedPerpsManualReview(native.native),id='web:'+native.packet.reviewId;
 const request=Object.freeze({walletAddress:wallet,signalId:id,reservationId:id,marginUsd:native.packet.review.draft.margin,
  positionAddress:native.packet.preparation.positionPubkey,entryExitPlan:proof.entryExitPlan,limits:Object.freeze(limits),snapshot});
 const identity=Object.freeze({signature:native.signature,wireHash:createHash('sha256').update(Buffer.from(native.signedBase64,'base64')).digest('hex')});
 const value=Object.freeze({stage:'WEB_PERPS_RISK_AUTHORIZATION',reviewId:native.packet.reviewId,walletAddress:wallet,reservationId:id,readyForSigning:false});
 proofs.set(value,{journal,request,identity,check,used:false});return value;
}
