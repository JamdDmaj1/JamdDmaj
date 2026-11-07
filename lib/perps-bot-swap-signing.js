// Narrow one-use custody capability for an exact simulated swap or transfer.
// Distinct engine grants and reviewed stages cannot be used interchangeably.
import {consumeWebSwapGrant} from './web-swap-engine.js';
import {requireBotSwapJournal,requireBotSwapClaim} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {consumeWalletTransferGrant} from './wallet-transfer-engine.js';
import {consumePerpsEntryConversionGrant} from './perps-entry-conversion-engine.js';
import {readPreparedPerpsEntryConversion} from './perps-entry-conversion-preparation.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {readPerpsEntryCollateralRecoveryIntent} from './perps-entry-collateral-recovery-intent.js';
import {readPreparedPerpsEntryCollateralRecovery} from './perps-entry-collateral-recovery-preparation.js';
const grants=new WeakMap(),recoveryIssued=new WeakMap();
function fail(){throw Error('BOT_SWAP_CUSTODY_NOT_AUTHORIZED');}
export async function authorizeBotSwapCustody({engineGrant,review,journal,ownerAccountHash,controls,backupRegistry,assertUncontended,transfer=false}={}){
 requireBotSwapJournal(journal);if(typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof assertUncontended!=='function')fail();
 if(transfer?review.stage!=='BOT_TRANSFER_REVIEW':review.stage!=='BOT_SWAP_REVIEW')fail();
 const approval=await (transfer?consumeWalletTransferGrant:consumeWebSwapGrant)(engineGrant,review.walletAddress),who={ownerAccountHash,walletAddress:review.walletAddress};
 const claim=journal.claim({id:review.id,...who,revision:review.controlRevision,review,message:approval.message});
 function revalidate(){
  approval.current();const row=requireBotSwapClaim(claim,journal),state=controls.read(who);
  if(row.owner!==ownerAccountHash||row.wallet!==review.walletAddress||row.revision!==review.controlRevision||row.review!==JSON.stringify(review)
   ||row.message!==Buffer.from(approval.message).toString('base64')||state.enabled!==false||state.paused!==true||state.revision!==review.controlRevision)fail();
  assertUncontended(who);
  const proof=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);if(proof.botSwapStateIncluded!==true)fail();
 }
 try{revalidate();const grant=Object.freeze({id:claim.id});grants.set(grant,{...who,message:Uint8Array.from(approval.message),revalidate,used:false});return {grant,claim};}
 catch(error){journal.abortUnsignedOrUnsent(claim);throw error;}
}
export function consumeBotSwapCustody(grant){const p=grants.get(grant);if(!p||p.used)fail();p.used=true;p.revalidate();return p;}

export function authorizeBotFailedEntryRecoveryCustody(args){return authorizeEntryRecoveryCustody(args,false);}
export function authorizeBotEntryCollateralRecoveryCustody(args){return authorizeEntryRecoveryCustody(args,true);}
// Both paths require an exact persisted swap claim created under the execution
// journal lock. The older failed-only entry point retains its narrower contract.
function authorizeEntryRecoveryCustody({intent,ownerAccountHash,controls,backupRegistry,explicitApproval,assertCurrent}={},allowUnsigned){
 const p=readPerpsEntryCollateralRecoveryIntent(intent),native=readPreparedPerpsEntryCollateralRecovery(p.prepared);
 if(recoveryIssued.has(intent)||explicitApproval!==true||p.ownerAccountHash!==ownerAccountHash||!allowUnsigned&&native.binding.openingSignature===null
  ||typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'||typeof assertCurrent!=='function')fail();
 const who={ownerAccountHash,walletAddress:intent.walletAddress};
 function revalidate(signed=false){
  readPerpsEntryCollateralRecoveryIntent(intent,{signed});assertCurrent(who);
  const state=controls.read(who),row=requireBotSwapClaim(p.claim,p.journal),parent=p.executionJournal.read(intent.reservationId);
  if(state?.walletAddress!==who.walletAddress||state.enabled!==false||state.paused!==true||state.revision!==p.controlRevision
   ||parent?.state!==(native.binding.openingSignature===null?'RESERVED':'UNCERTAIN')||parent.signature!==native.binding.openingSignature||(!signed&&row.signed!==null)
   ||row.message!==native.wire.messageBase64||row.owner!==ownerAccountHash)fail();
  if(p.journal.pending(who.walletAddress).some(r=>r.id!==intent.id)
   ||p.executionJournal.pending(who.walletAddress).some(r=>r.reservation!==intent.reservationId)
   ||p.executionJournal.pendingPositionCloses(who.walletAddress).length||p.executionJournal.pendingExitCancellations(who.walletAddress).length
   ||p.executionJournal.pendingPlatformFeePayments(who.walletAddress).length)fail();
  const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(backup.botSwapStateIncluded!==true||backup.platformFeeStateIncluded!==true)fail();
 }
 revalidate();recoveryIssued.set(intent,()=>revalidate(true));const grant=Object.freeze({id:intent.id});
 grants.set(grant,{...who,message:Uint8Array.from(Buffer.from(native.wire.messageBase64,'base64')),revalidate,used:false});
 return Object.freeze({grant,claim:p.claim});
}
export function revalidateSignedBotEntryRecoveryCustody(intent){const check=recoveryIssued.get(intent);if(!check)fail();check();}

// Separate stage/capability: generic swap or transfer consent cannot authorize
// a futures funding conversion. This grants exactly one already-inspected wire.
export async function authorizeBotEntryConversionCustody({engineGrant,prepared,review,journal,executionJournal,
 reservationId,ownerAccountHash,controls,backupRegistry,readAccount,readLimits,assertCurrent}={}){
 requireBotSwapJournal(journal);requirePerpsExecutionJournal(executionJournal);
 const native=readPreparedPerpsEntryConversion(prepared),who={ownerAccountHash,walletAddress:prepared.walletAddress};
 if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash)
   ||typeof controls?.read!=='function'||typeof backupRegistry?.readVerified!=='function'
   ||[readAccount,readLimits,assertCurrent].some(fn=>typeof fn!=='function')
   ||JSON.stringify(review)!==JSON.stringify({...prepared,id:review?.id,controlRevision:review?.controlRevision,reservationId})
   ||typeof review.id!=='string'||!/^[a-f0-9]{64}$/.test(review.id))fail();
 const policyText=JSON.stringify(readLimits(who));let claim,snapshot;
 function revalidate(){
  readPreparedPerpsEntryConversion(prepared);assertCurrent(who);
  const state=controls.read(who),policy=readLimits(who),hold=executionJournal.entryConversionHold(reservationId);
  if(state?.walletAddress!==who.walletAddress||state.enabled!==false||state.paused!==true||state.revision!==review.controlRevision
    ||policy?.walletAddress!==who.walletAddress||JSON.stringify(policy)!==policyText
    ||hold?.conversion_id!==review.id)fail();
  const proof=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(proof.botSwapStateIncluded!==true||proof.platformFeeStateIncluded!==true)fail();
  if(executionJournal.pending(who.walletAddress).some(row=>row.reservation!==reservationId)
    ||executionJournal.pendingPositionCloses(who.walletAddress).length||executionJournal.pendingExitCancellations(who.walletAddress).length
    ||executionJournal.pendingPlatformFeePayments(who.walletAddress).length)fail();
  if(claim){
   const row=requireBotSwapClaim(claim,journal);
   if(row.owner!==ownerAccountHash||row.wallet!==who.walletAddress||row.review!==JSON.stringify(review)
     ||row.message!==native.wire.messageBase64||row.signed!==null)fail();
  }else if(journal.pending(who.walletAddress).length)fail();
  if(snapshot){
   requireFreshServerPerpsDailyAccount(snapshot,{walletAddress:who.walletAddress,minimumSlot:prepared.observedSlot,journal:executionJournal});
   executionJournal.revalidateEntryConversion(reservationId,{limits:policy.limits,snapshot,wire:native.wire,draft:prepared.draft,conversionId:review.id});
  }
 }
 revalidate();
 snapshot=await readAccount({...who,minimumSlot:prepared.observedSlot});revalidate();
 const approval=await consumePerpsEntryConversionGrant(engineGrant,who.walletAddress);revalidate();
 if(Buffer.from(approval.message).toString('base64')!==native.wire.messageBase64)fail();
 claim=journal.claim({id:review.id,...who,revision:review.controlRevision,review,message:approval.message});
 function check(){approval.current();revalidate();}
 try{
  check();const grant=Object.freeze({id:claim.id});
  grants.set(grant,{...who,message:Uint8Array.from(approval.message),revalidate:check,used:false});
  return Object.freeze({grant,claim});
 }catch(error){journal.abortUnsignedOrUnsent(claim);throw error;}
}
