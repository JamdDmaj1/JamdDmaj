// Portable terminal entry facts. Not a live position, signer or retry grant.
import {webPerpsBytes} from './perps-web-envelope.js';
export async function webPerpsSignedWireHash(encoded){
 const digest=await crypto.subtle.digest('SHA-256',webPerpsBytes(encoded));return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function validateWebPerpsOperationStatus(value,row,{now}={}){
 const keys='confirmedSlot,executionDay,financialState,outcome,recordBinding,reviewId,settledAt,signature,stage,walletAddress,wireHash';
 const packet=JSON.parse(row.packetJson);
 if(!value||Object.keys(value).sort().join(',')!==keys||value.stage!=='WEB_PERPS_OPERATION_SETTLED'
  ||value.reviewId!==row.operationId||value.walletAddress!==row.walletAddress||value.signature!==row.signature||value.recordBinding!==row.recordBinding
  ||!['CONFIRMED','FAILED'].includes(value.outcome)||!['OPEN','CLOSED'].includes(value.financialState)||value.outcome==='FAILED'&&value.financialState!=='CLOSED'
  ||!Number.isSafeInteger(value.confirmedSlot)||value.confirmedSlot<packet.review.observedSlot||!Number.isSafeInteger(value.settledAt)||value.settledAt<row.createdAt
  ||now!==undefined&&(!Number.isSafeInteger(now)||value.settledAt>now+120000)||typeof value.executionDay!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.executionDay)
  ||!Number.isFinite(Date.parse(value.executionDay+'T00:00:00Z'))||new Date(value.executionDay+'T00:00:00Z').toISOString().slice(0,10)!==value.executionDay
  ||value.wireHash!==await webPerpsSignedWireHash(row.signedBase64))throw Error('WEB_PERPS_STATUS_NOT_VERIFIED');
 return Object.freeze({...value});
}
