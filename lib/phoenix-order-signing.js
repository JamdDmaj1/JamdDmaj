// Separate Phoenix-only one-use capability. Existing Jupiter/swap signing
// profiles are not broadened. This grants no registration or withdrawal.
import {requirePhoenixExecutionJournal,requirePhoenixOrderClaim} from './phoenix-execution-journal.js';
import {requirePhoenixUnsignedWire} from './phoenix-order-wire.js';
import {requirePhoenixSimulatedOrder} from './phoenix-order-simulation.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';

const grants=new WeakMap(),issued=new WeakSet();
const fail=()=>{throw Error('PHOENIX_ORDER_SIGNING_NOT_AUTHORIZED');};
export function authorizePhoenixOrderSigning({ownerAccountHash,journal,claim,wire,simulation,request,controls,
 backupRegistry,riskJournal,swapJournal,explicitApproval,platformFeeTerms,assertUncontended}={}){
 requirePhoenixExecutionJournal(journal);requirePerpsExecutionJournal(riskJournal);requireBotSwapJournal(swapJournal);
 if(explicitApproval!==true||typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)||
    typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof assertUncontended!=='function'||issued.has(claim))fail();
 const {review}=requirePhoenixUnsignedWire(wire),plan=review.plan,who={ownerAccountHash,walletAddress:plan.walletAddress};
 const initial=requirePhoenixOrderClaim(claim,journal);
 if(initial.owner!==ownerAccountHash||initial.wallet!==who.walletAddress||initial.message!==wire.messageBase64)fail();
 const terms=plan.close?null:quotePerpsPlatformFee(plan.marginUsdcUnits);
 if(!plan.close&&JSON.stringify(platformFeeTerms)!==JSON.stringify(terms))fail();
 function revalidate(signed=false){
  requirePhoenixUnsignedWire(wire);
  const p=requirePhoenixSimulatedOrder(simulation,{wire,request}),row=journal.readAttempt(initial.id,ownerAccountHash),state=controls.read(who);
  if(!row||row.state!==(signed?'SIGNED':'PREPARED')||row.wallet!==who.walletAddress||row.message!==wire.messageBase64||
     row.workflow!==initial.workflow||row.revision!==initial.revision||state.walletAddress!==who.walletAddress||
     state.enabled!==false||state.paused!==true||state.revision!==row.revision)fail();
  const flow=journal.readWorkflow(row.workflow,ownerAccountHash);
  if(!flow||flow.child!==plan.isolatedSubaccountIndex||flow.symbol!==plan.symbol||
     flow.state!==(plan.close?'OPEN':'HELD')||!plan.close&&flow.fee_terms!==JSON.stringify(terms))fail();
  if(!plan.close&&BigInt(p.account.usdc.amountUnits)<BigInt(terms.totalMarginAndPlatformFeeUnits))fail();
  if(BigInt(p.account.payerLamports)<BigInt(simulation.networkFeeLamports)+BigInt(simulation.rentLockedLamports))fail();
  if(journal.pending(who.walletAddress).some(v=>v.id!==initial.id)||swapJournal.pending(who.walletAddress).length||
     riskJournal.pending(who.walletAddress).length||riskJournal.pendingPositionCloses(who.walletAddress).length||
     riskJournal.pendingExitCancellations(who.walletAddress).length||riskJournal.pendingPlatformFeePayments(who.walletAddress).length)fail();
  assertUncontended(who);
  const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(!backup.phoenixStateIncluded||!backup.botSwapStateIncluded||!backup.platformFeeStateIncluded)fail();
 }
 revalidate();issued.add(claim);
 const grant=Object.freeze({stage:'ONE_USE_PHOENIX_ORDER',id:initial.id});
 grants.set(grant,{...who,used:false,messageBase64:wire.messageBase64,revalidate,
  persistSigned(encoded){revalidate();const row=journal.persistSigned(claim,encoded);revalidate(true);return row;}});
 return grant;
}
export function consumePhoenixOrderSigning(grant){
 const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;
}
