// One-use wallet-only child setup authorization. No order/transfer authority.
import {requirePhoenixExecutionJournal,requirePhoenixChildSetupClaim} from './phoenix-execution-journal.js';
import {requirePhoenixChildSetupWire,requirePhoenixChildSetupSimulation} from './phoenix-child-setup-simulation.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
const grants=new WeakMap(),issued=new WeakSet();
const fail=()=>{throw Error('PHOENIX_CHILD_SIGNING_NOT_AUTHORIZED');};
export function authorizePhoenixChildSetupSigning({ownerAccountHash,journal,claim,wire,simulation,request,controls,backupRegistry,riskJournal,swapJournal,assertUncontended,now=Date.now}={}){
 requirePhoenixExecutionJournal(journal);requirePerpsExecutionJournal(riskJournal);requireBotSwapJournal(swapJournal);
 const initial=requirePhoenixChildSetupClaim(claim,journal);
 if(initial.owner!==ownerAccountHash||initial.wallet!==wire?.walletAddress||initial.message!==wire.messageBase64||typeof controls?.read!=='function'||
    typeof backupRegistry?.readVerified!=='function'||typeof assertUncontended!=='function'||typeof now!=='function'||issued.has(claim))fail();
 const who={ownerAccountHash,walletAddress:initial.wallet};
 function revalidate(signed=false){
  const p=requirePhoenixChildSetupWire(wire);requirePhoenixChildSetupSimulation(simulation,{wire,request});if(p.request!==request)fail();
  const row=journal.readChildSetup(initial.id,ownerAccountHash),state=controls.read(who),at=now();
  if(!row||row.state!==(signed?'SIGNED':'PREPARED')||row.message!==initial.message||row.revision!==initial.revision||row.parent!==wire.parentAddress||
     !Number.isSafeInteger(at)||at<row.created||at>=row.expires||BigInt(simulation.maximumLamports)>BigInt(row.maximum_lamports)||
     state.walletAddress!==initial.wallet||state.revision!==row.revision||state.enabled!==false||state.paused!==true)fail();
  if(journal.pending(initial.wallet).some(a=>a.id!==initial.id)||swapJournal.pending(initial.wallet).length||riskJournal.pending(initial.wallet).length||
     riskJournal.pendingPositionCloses(initial.wallet).length||riskJournal.pendingExitCancellations(initial.wallet).length||riskJournal.pendingPlatformFeePayments(initial.wallet).length)fail();
  assertUncontended(who);const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(!backup.phoenixStateIncluded||!backup.platformFeeStateIncluded||!backup.botSwapStateIncluded)fail();
 }
 revalidate();issued.add(claim);const grant=Object.freeze({stage:'ONE_USE_PHOENIX_CHILD_SETUP',id:initial.id});
 grants.set(grant,{...who,id:initial.id,journal,wire,request,used:false,messageBase64:wire.messageBase64,revalidate,
  persistSigned(encoded){revalidate();const row=journal.persistSignedChildSetup(claim,encoded);revalidate(true);return row;}});return grant;
}
export function consumePhoenixChildSetupSigning(grant){const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;}
export function inspectPhoenixChildSetupDispatch(grant,{journal,request}={}){const p=grants.get(grant);
 if(!p||!p.used||p.journal!==journal||p.request!==request)fail();p.revalidate(true);return Object.freeze({id:p.id,ownerAccountHash:p.ownerAccountHash,walletAddress:p.walletAddress,wire:p.wire});
}
