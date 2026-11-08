// Narrow one-use registration grant. Cannot sign an order, deposit, withdrawal,
// arbitrary transfer, provider signature or replacement builder transaction.
import {requirePhoenixExecutionJournal,requirePhoenixParentClaim} from './phoenix-execution-journal.js';
import {requirePhoenixParentOnboarding,requirePhoenixParentSimulation} from './phoenix-parent-onboarding.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
const issued=new WeakSet(),grants=new WeakMap();
const fail=()=>{throw Error('PHOENIX_PARENT_SIGNING_NOT_AUTHORIZED');};
export function authorizePhoenixParentSigning({ownerAccountHash,journal,claim,preparation,simulation,request,controls,backupRegistry,riskJournal,swapJournal,assertUncontended,now=Date.now}={}){
 requirePhoenixExecutionJournal(journal);requirePerpsExecutionJournal(riskJournal);requireBotSwapJournal(swapJournal);
 const initial=requirePhoenixParentClaim(claim,journal);
 if(initial.owner!==ownerAccountHash||initial.wallet!==preparation?.walletAddress||initial.message!==preparation.messageBase64||
    typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof assertUncontended!=='function'||typeof now!=='function'||issued.has(claim))fail();
 const who={ownerAccountHash,walletAddress:initial.wallet};
 function revalidate(signed=false){
  requirePhoenixParentOnboarding(preparation);requirePhoenixParentSimulation(simulation,{preparation,request});
  const row=journal.readParentAttempt(initial.id,ownerAccountHash),state=controls.read(who),at=now();
  if(!row||row.state!==(signed?'SIGNED':'PREPARED')||row.message!==initial.message||row.revision!==initial.revision||row.parent!==preparation.parentAddress||
     !Number.isSafeInteger(at)||at<row.created||at>=row.expires||BigInt(simulation.maximumLamports)>BigInt(row.maximum_lamports)||
     state.walletAddress!==initial.wallet||state.revision!==row.revision||state.enabled!==false||state.paused!==true)fail();
  if(journal.pending(initial.wallet).some(r=>r.id!==initial.id)||swapJournal.pending(initial.wallet).length||riskJournal.pending(initial.wallet).length||
     riskJournal.pendingPositionCloses(initial.wallet).length||riskJournal.pendingExitCancellations(initial.wallet).length||riskJournal.pendingPlatformFeePayments(initial.wallet).length)fail();
  assertUncontended(who);const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(!backup.phoenixStateIncluded||!backup.platformFeeStateIncluded||!backup.botSwapStateIncluded)fail();
 }
 revalidate();issued.add(claim);const grant=Object.freeze({stage:'ONE_USE_PHOENIX_PARENT',id:initial.id});
 grants.set(grant,{...who,used:false,serializedTxBase64:preparation.serializedTxBase64,revalidate,
  persistSigned(encoded){revalidate();const row=journal.persistSignedParent(claim,encoded);revalidate(true);return row;}});return grant;
}
export function consumePhoenixParentSigning(grant){const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;}
export function revalidatePhoenixParentDispatch(grant){const p=grants.get(grant);if(!p||!p.used)fail();p.revalidate(true);return true;}
