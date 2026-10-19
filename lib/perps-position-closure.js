// Read-only, finalized whole-position closure evidence. A missing API row,
// confirmed-only balance, timeout or expired blockhash is never a closure.
import {readPerpsBroadcastReceipt,isVerifiedPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {deriveServerPerpsIdentities} from './perps-server-custody.js';
const proofs=new WeakMap();
function fail(){throw Error('UNVERIFIED_SERVER_PERPS_POSITION_CLOSURE');}
export function requireVerifiedServerPerpsPositionClosure(value){
 const proof=proofs.get(value);if(!proof||!isVerifiedPerpsBroadcastReceipt(proof.receipt)||proof.receipt.confirmationStatus!=='finalized')fail();
 requireFreshServerPerpsDailyAccount(proof.account,{walletAddress:value.walletAddress,minimumSlot:proof.receipt.slot});
 const age=proof.now()-proof.receipt.observedAt;if(!Number.isFinite(age)||age<0||age>10000)fail();return value;
}
export async function readServerPerpsPositionClosure(record,{request,readFinalizedAccount,now=Date.now}={}){
 if(record?.state!=='OPEN'||typeof record.position_address!=='string'||typeof request!=='function'||typeof readFinalizedAccount!=='function'||typeof now!=='function')fail();
 const positions=[];for(const asset of ['BTC','ETH','SOL'])for(const side of ['LONG','SHORT'])positions.push((await deriveServerPerpsIdentities({walletAddress:record.wallet,asset,side})).position);
 if(!positions.includes(record.position_address))fail();
 const receipt=await readPerpsBroadcastReceipt({walletAddress:record.wallet,signature:record.signature,wireHash:record.wire_hash},request,{now,requireFinalized:true});
 if(!receipt)return null;if(receipt.state!=='CONFIRMED')fail();
 const account=requireFreshServerPerpsDailyAccount(await readFinalizedAccount({walletAddress:record.wallet,minimumSlot:receipt.slot}),{walletAddress:record.wallet,minimumSlot:receipt.slot});
 if(account.commitment!=='finalized'||account.requiresExclusiveCustodyJournal===true||account.day!==new Date(now()).toISOString().slice(0,10))fail();
 if(account.positions.some(p=>p.address===record.position_address))return null;
 if(receipt.executionDay===account.day){
  if(!account.transactions.some(t=>t.signature===record.signature&&!t.failed&&t.events.some(e=>e.action==='Increase'&&e.positionAddress===record.position_address)))fail();
  if(!account.transactions.some(t=>!t.failed&&t.slot>=receipt.slot&&t.events.some(e=>['Decrease','Liquidate'].includes(e.action)&&e.positionAddress===record.position_address)))fail();
 }
 const value=Object.freeze({stage:'FINALIZED_WHOLE_POSITION_CLOSED',walletAddress:record.wallet,signature:record.signature,wireHash:record.wire_hash,
  reservationId:record.reservation,positionAddress:record.position_address,observedSlot:account.observedSlot,observedAt:account.observedAt,day:account.day,
  lossTodayUsdcUnits:account.lossTodayUsdcUnits,readyForSigning:false});
 proofs.set(value,{receipt,account,now});return requireVerifiedServerPerpsPositionClosure(value);
}
export async function reconcileClosedServerPerpsPositions(journal,walletAddress,{request,readFinalizedAccount,now=Date.now,limit=20}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail();
 const rows=journal.openPositions(walletAddress),result={checked:0,closed:0,stillOpen:0,unresolved:0,legacyReview:0,deferred:0};
 for(const row of rows){
  if(!row.position_address){result.legacyReview++;continue;}
  if(result.checked>=limit){result.deferred++;continue;}result.checked++;
  try{
   const proof=await readServerPerpsPositionClosure(row,{request,readFinalizedAccount,now});
   if(proof===null){result.stillOpen++;continue;}
   journal.reconcileClosedPosition(row.reservation,proof);result.closed++;
  }catch{result.unresolved++;}
 }
 return Object.freeze(result);
}
