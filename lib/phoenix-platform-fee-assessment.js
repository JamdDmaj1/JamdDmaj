// A finalized Phoenix fill + prior durable commercial consent, not a spending
// grant. Its namespace cannot collide with a Jupiter assessment.
import {createHash} from 'node:crypto';
import {requirePhoenixExecutionJournal} from './phoenix-execution-journal.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
const proofs=new WeakMap();
const fail=()=>{throw Error('PHOENIX_FEE_ASSESSMENT_REJECTED');};
function current(journal,workflowId,ownerAccountHash){
 requirePhoenixExecutionJournal(journal);
 const f=journal.readWorkflow(workflowId,ownerAccountHash),c=journal.feeConsent(workflowId,ownerAccountHash);
 if(!f||!c||c.terms!==f.fee_terms)fail();
 const rows=journal.workflowAttempts(f.id,ownerAccountHash),opening=rows.find(r=>r.kind==='OPEN'&&r.state==='FINALIZED');
 if(!opening||opening.id!==c.attempt||JSON.parse(opening.receipt).state!=='POSITION_OPEN'||
    rows.some(r=>r.kind==='FEE'&&r.state==='FINALIZED'&&JSON.parse(r.receipt).state==='PAID'))fail();
 const quote=quotePerpsPlatformFee(f.margin),receipt=JSON.parse(opening.receipt);
 if(f.fee_terms!==JSON.stringify(quote)||c.accepted>opening.updated||receipt.signature!==opening.signature)fail();
 const id=createHash('sha256').update(JSON.stringify(['phoenix',quote.version,f.wallet,opening.signature])).digest('hex');
 return Object.freeze({id,reservation:f.id,wallet:f.wallet,opening_signature:opening.signature,opening_slot:receipt.slot,
  margin:f.margin,fee:quote.feeUnits,terms:f.fee_terms,subaccountIndex:f.child,state:'AWAITING_PAYMENT_REVIEW',created:opening.updated});
}
export function assessPhoenixPlatformFee({journal,workflowId,ownerAccountHash}={}){
 const value=current(journal,workflowId,ownerAccountHash);proofs.set(value,{read:()=>current(journal,workflowId,ownerAccountHash),text:JSON.stringify(value)});return value;
}
export function requirePhoenixPlatformFeeAssessment(value){const p=proofs.get(value);if(!p||JSON.stringify(p.read())!==p.text)fail();return value;}
