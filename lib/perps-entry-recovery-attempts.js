// Bounded immutable attempt chain. Only terminal never-broadcast ABORTED rows
// permit another identity; UNKNOWN/FAILED/FINALIZED are never retry permission.
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw Error('PERPS_ENTRY_RECOVERY_ATTEMPT_REQUIRED');};
function validFailure(reference,row){
 return reference&&Object.keys(reference).sort().join(',')==='day,signature,slot,wireHash'&&row.state==='FAILED'
  &&reference.signature===row.signature&&reference.wireHash===createHash('sha256').update(Buffer.from(row.signed,'base64')).digest('hex')
  &&Number.isSafeInteger(reference.slot)&&reference.slot>0&&/^\d{4}-\d{2}-\d{2}$/.test(reference.day)
  &&Number.isFinite(Date.parse(reference.day+'T00:00:00Z'))&&new Date(reference.day+'T00:00:00Z').toISOString().slice(0,10)===reference.day;
}
export function readEntryRecoveryAttempts(read,{walletAddress,reservationId,conversionSignature}){
 if(typeof read!=='function'||typeof walletAddress!=='string'||typeof reservationId!=='string'||typeof conversionSignature!=='string')fail();
 const rootId=hash(['entry-collateral-recovery-v1',reservationId,conversionSignature]);
 const identity=index=>index===0?rootId:hash(['entry-collateral-recovery-retry-v1',rootId,index]);
 let current=null,previous=null,owner=null,index=0;const rows=[];
 for(;index<=32;index++){
  const row=read(identity(index));if(!row)break;
  const review=JSON.parse(row.review);
  if(index===32||row.id!==identity(index)||row.wallet!==walletAddress||!/^[a-f0-9]{64}$/.test(row.owner)
   ||owner!==null&&row.owner!==owner||review.stage!=='ENTRY_COLLATERAL_RECOVERY_INTENT'
   ||review.reservationId!==reservationId||review.conversionSignature!==conversionSignature||review.walletAddress!==walletAddress
   ||review.maxSlippageBps!==50||!['SIGNING','UNKNOWN','ABORTED','FAILED','FINALIZED'].includes(row.state))fail();
  if(index===0){
   if(review.recoveryAttempt!==undefined&&review.recoveryAttempt!==0||review.rootRecoveryId!==undefined&&review.rootRecoveryId!==rootId
    ||review.previousRecoveryId!==undefined&&review.previousRecoveryId!==null)fail();
  }else if(!(current.state==='ABORTED'&&review.previousFailure===undefined||validFailure(review.previousFailure,current))
   ||review.recoveryAttempt!==index||review.rootRecoveryId!==rootId||review.previousRecoveryId!==current.id)fail();
  owner=row.owner;previous=current;current=row;rows.push(row);
 }
 // Reject a skipped root/attempt instead of silently overlooking an orphan.
 if(index<32&&read(identity(index+1)))fail();
 const canReview=!current||current.state==='ABORTED'&&index<32;
 const failedReviewCandidate=current?.state==='FAILED'&&index<32;
 return Object.freeze({rootId,current,previous,rows:Object.freeze(rows),attemptIndex:current?index-1:null,
  nextId:canReview||failedReviewCandidate?identity(index):null,nextIndex:canReview||failedReviewCandidate?index:null,canReview,failedReviewCandidate});
}
// Identity planning is not authorization. The journal separately requires a
// genuine accounted-failure capability before accepting this reference.
export function planEntryRecoveryAttempt(read,context,{previousRecoveryId=null,failureReference=null}={}){
 const value=readEntryRecoveryAttempts(read,context);
 if(!(value.canReview&&failureReference===null||value.failedReviewCandidate&&validFailure(failureReference,value.current))||(value.current?.id??null)!==previousRecoveryId)fail();
 return Object.freeze({id:value.nextId,recoveryAttempt:value.nextIndex,rootRecoveryId:value.rootId,previousRecoveryId,...(failureReference?{previousFailure:Object.freeze({...failureReference})}:{})});
}
