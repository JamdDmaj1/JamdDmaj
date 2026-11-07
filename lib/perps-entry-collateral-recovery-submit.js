// Exact signed recovery, one transport attempt. UNKNOWN is persisted first;
// response loss never authorizes a retry or risk release.
import {readPerpsEntryCollateralRecoveryIntent} from './perps-entry-collateral-recovery-intent.js';
import {readPreparedPerpsEntryCollateralRecovery} from './perps-entry-collateral-recovery-preparation.js';
import {revalidateSignedBotEntryRecoveryCustody} from './perps-bot-swap-signing.js';
import {simulatePerpsCloseConversion} from './perps-close-conversion-simulation.js';
const used=new WeakSet();
export async function submitPerpsEntryCollateralRecovery(intent,{request,sendRequest,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(used.has(intent)||typeof request!=='function'||typeof sendRequest!=='function')throw Error('PERPS_RECOVERY_SUBMISSION_REQUIRED');
 const p=readPerpsEntryCollateralRecoveryIntent(intent,{signed:true}),{wire}=readPreparedPerpsEntryCollateralRecovery(p.prepared);
 revalidateSignedBotEntryRecoveryCustody(intent);used.add(intent);
 const row=p.journal.read(intent.id),signed=row.signed;
 const guarded=async(method,params)=>{
  revalidateSignedBotEntryRecoveryCustody(intent);
  if(method==='simulateTransaction'){
   if(params[0]!==wire.serializedTxBase64)throw Error('PERPS_RECOVERY_SUBMISSION_REQUIRED');
   params=[signed,{...params[1],sigVerify:true}];
  }
  const reply=await request(method,params);revalidateSignedBotEntryRecoveryCustody(intent);return reply;
 };
 await simulatePerpsCloseConversion(wire,{request:guarded,minimumSlot:p.prepared.observedSlot,maxSlippageBps:50,now,monotonicNow});
 revalidateSignedBotEntryRecoveryCustody(intent);
 p.journal.beginBroadcast(p.claim,{address:intent.walletAddress,signature:row.signature,lastValidBlockHeight:wire.lastValidBlockHeight});
 // No fallible checks after durable UNKNOWN and before the transport attempt.
 let acknowledged=false;
 try{acknowledged=(await sendRequest('sendTransaction',[signed,{encoding:'base64',skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed',minContextSlot:p.prepared.observedSlot}]))===row.signature;}catch{}
 return Object.freeze({stage:'ENTRY_COLLATERAL_RECOVERY_PENDING',id:intent.id,reservationId:intent.reservationId,walletAddress:intent.walletAddress,
  state:'UNKNOWN',signature:row.signature,acknowledged,readyForRetry:false,requiresFinalizedReceipt:true});
}
