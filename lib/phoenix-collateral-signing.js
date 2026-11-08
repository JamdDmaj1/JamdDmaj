// One inspected withdrawal/conversion, never an order, transfer to a third
// party, generic SPL approval, registration, or automatic queue retry.
import {requirePhoenixExecutionJournal,requirePhoenixOrderClaim} from './phoenix-execution-journal.js';
import {requirePhoenixCollateralWire,requirePhoenixCollateralSimulation} from './phoenix-collateral-simulation.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
const grants=new WeakMap(),issued=new WeakSet();
const fail=()=>{throw Error('PHOENIX_COLLATERAL_SIGNING_NOT_AUTHORIZED');};
export function authorizePhoenixCollateralSigning({ownerAccountHash,journal,claim,wire,simulation,request,controls,
 backupRegistry,riskJournal,swapJournal,explicitApproval,assertUncontended}={}){
 requirePhoenixExecutionJournal(journal);requirePerpsExecutionJournal(riskJournal);requireBotSwapJournal(swapJournal);
 if(explicitApproval!==true||typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)||
    typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof assertUncontended!=='function'||issued.has(claim))fail();
 const {preparation}=requirePhoenixCollateralWire(wire),who={ownerAccountHash,walletAddress:preparation.walletAddress};
 const initial=requirePhoenixOrderClaim(claim,journal);
 if(initial.owner!==ownerAccountHash||initial.wallet!==who.walletAddress||initial.kind!==preparation.phase||initial.message!==wire.messageBase64)fail();
 function revalidate(signed=false){
  const p=requirePhoenixCollateralWire(wire);requirePhoenixCollateralSimulation(simulation,{wire,request});
  const row=journal.readAttempt(initial.id,ownerAccountHash),state=controls.read(who),flow=journal.readWorkflow(initial.workflow,ownerAccountHash);
  if(!row||row.state!==(signed?'SIGNED':'PREPARED')||row.message!==wire.messageBase64||row.workflow!==initial.workflow||row.kind!==preparation.phase||
     row.revision!==initial.revision||state.walletAddress!==who.walletAddress||state.enabled!==false||state.paused!==true||state.revision!==row.revision||
     !flow||flow.child!==preparation.subaccountIndex||flow.state!==(preparation.phase==='WITHDRAW'?'SETTLING':'CANONICAL_READY'))fail();
  if(BigInt(p.account.payerLamports)<BigInt(simulation.networkFeeLamports)+BigInt(simulation.rentLockedLamports))fail();
  if(journal.pending(who.walletAddress).some(v=>v.id!==initial.id)||swapJournal.pending(who.walletAddress).length||
     riskJournal.pending(who.walletAddress).length||riskJournal.pendingPositionCloses(who.walletAddress).length||
     riskJournal.pendingExitCancellations(who.walletAddress).length||riskJournal.pendingPlatformFeePayments(who.walletAddress).length)fail();
  assertUncontended(who);
  const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(!backup.phoenixStateIncluded||!backup.botSwapStateIncluded||!backup.platformFeeStateIncluded)fail();
 }
 revalidate();issued.add(claim);
 const grant=Object.freeze({stage:'ONE_USE_PHOENIX_COLLATERAL',id:initial.id});
 grants.set(grant,{...who,used:false,messageBase64:wire.messageBase64,revalidate,
  persistSigned(encoded){revalidate();const row=journal.persistSigned(claim,encoded);revalidate(true);return row;}});return grant;
}
export function consumePhoenixCollateralSigning(grant){const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;}
