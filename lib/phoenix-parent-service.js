// Owner/session service for one-time parent setup only. Never opens a trade or
// activates automation. Native preparation and provider transport are injected.
import {randomBytes} from 'node:crypto';
import {requirePhoenixExecutionJournal} from './phoenix-execution-journal.js';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {requirePhoenixParentOnboarding,requirePhoenixParentSimulation} from './phoenix-parent-onboarding.js';
import {authorizePhoenixParentSigning} from './phoenix-parent-signing.js';
import {dispatchPhoenixParent,recoverPhoenixParent,inspectPhoenixParentOperation} from './phoenix-parent-dispatch.js';
const fail=code=>{throw Error('PHOENIX_PARENT_SERVICE_'+code);};
const hex=value=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('INPUT');return value;};
export function createPhoenixParentService({controls,vault,journal,riskJournal,swapJournal,backupRegistry,prepareNative,request,sendRegisterIxs,assertUncontended,isRunning,now=Date.now}={}){
 requirePhoenixExecutionJournal(journal);requirePerpsExecutionJournal(riskJournal);requireBotSwapJournal(swapJournal);
 if([prepareNative,request,sendRegisterIxs,assertUncontended,isRunning,now].some(f=>typeof f!=='function')||typeof controls?.readForOwner!=='function'||
    typeof vault?.describe!=='function'||typeof vault?.signPhoenixParent!=='function'||typeof backupRegistry?.readVerified!=='function')fail('CONFIGURATION');
 const reviews=new Map(),busy=new Set();
 function owned(who){hex(who?.ownerAccountHash);const state=controls.readForOwner({ownerAccountHash:who.ownerAccountHash});if(!state||state.walletAddress!==who.walletAddress)fail('OWNERSHIP');return state;}
 function gate(who,allowed){const state=owned(who),identity=vault.describe(who);
  if(!isRunning()||identity.exclusive!==true||identity.ownerAccountHash!==who.ownerAccountHash||identity.walletAddress!==who.walletAddress||identity.restoreReviewRequired)fail('CUSTODY');
  if(state.enabled!==false||state.paused!==true)fail('PAUSE_REQUIRED');
  const backup=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);
  if(!backup.phoenixStateIncluded||!backup.platformFeeStateIncluded||!backup.botSwapStateIncluded)fail('BACKUP_REQUIRED');
  if(journal.pending(who.walletAddress).some(a=>a.id!==allowed)||swapJournal.pending(who.walletAddress).length||riskJournal.pending(who.walletAddress).length||
     riskJournal.pendingPositionCloses(who.walletAddress).length||riskJournal.pendingExitCancellations(who.walletAddress).length||riskJournal.pendingPlatformFeePayments(who.walletAddress).length)fail('PENDING');
  assertUncontended(who);return state;
 }
 async function exclusive(wallet,fn){if(busy.has(wallet))fail('BUSY');busy.add(wallet);try{return await fn();}finally{busy.delete(wallet);}}
 async function native(who,symbol){const result=await prepareNative({...who,symbol});
  requirePhoenixParentOnboarding(result?.preparation);requirePhoenixParentSimulation(result?.simulation,{preparation:result.preparation,request});
  if(result.preparation.walletAddress!==who.walletAddress)fail('OWNERSHIP');return Object.freeze({preparation:result.preparation,simulation:result.simulation});
 }
 return Object.freeze({
  async status(who){owned(who);let available=true;try{gate(who);}catch{available=false;}
   return {stage:'PHOENIX_PARENT_STATUS',venue:'phoenix',walletAddress:who.walletAddress,available,authorizesTrading:false,
    operations:journal.pendingParent(who.walletAddress).map(inspectPhoenixParentOperation)};},
  async prepare({ownerAccountHash,walletAddress,symbol}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},state=gate(who);if(typeof symbol!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(symbol))fail('INPUT');
   const proof=await native(who,symbol);if(gate(who).revision!==state.revision)fail('REVIEW_CHANGED');
   for(const [id,p]of reviews)if(p.public.expiresAt<=now())reviews.delete(id);if(reviews.size>=100)fail('BUSY');
   const review=Object.freeze({stage:'PHOENIX_PARENT_REVIEW',venue:'phoenix',id:randomBytes(32).toString('hex'),walletAddress,
    parentAddress:proof.preparation.parentAddress,maxPositions:32,networkFeeLamports:proof.simulation.networkFeeLamports,rentLockedLamports:proof.simulation.rentLockedLamports,
    maximumLamports:proof.simulation.maximumLamports,expiresAt:now()+15000,authorizationDurationMs:300000,requiresProtocolCosignature:true,authorizesTrading:false,submitted:false});
   reviews.set(review.id,{public:review,who,revision:state.revision,symbol});return review;
  });},
  async confirm({ownerAccountHash,walletAddress,id,explicitApproval}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress};owned(who);const p=reviews.get(hex(id));
   if(!p||explicitApproval!==true||p.who.ownerAccountHash!==ownerAccountHash||p.who.walletAddress!==walletAddress||p.public.expiresAt<=now())fail('REVIEW_REQUIRED');
   if(gate(who).revision!==p.revision)fail('REVIEW_CHANGED');reviews.delete(id);
   try{
    const proof=await native(who,p.symbol);if(proof.preparation.parentAddress!==p.public.parentAddress||BigInt(proof.simulation.maximumLamports)>BigInt(p.public.maximumLamports))fail('COST_CHANGED');
    const claim=journal.prepareParent({id,ownerAccountHash,controlRevision:p.revision,preparation:proof.preparation,simulation:proof.simulation,request,maximumLamports:p.public.maximumLamports,expiresAt:now()+p.public.authorizationDurationMs,explicitApproval:true});
    const grant=authorizePhoenixParentSigning({ownerAccountHash,journal,claim,preparation:proof.preparation,simulation:proof.simulation,request,controls,backupRegistry,riskJournal,swapJournal,now,assertUncontended:()=>gate(who,id)});
    vault.signPhoenixParent(grant);return await dispatchPhoenixParent(grant,{journal,request,sendRegisterIxs});
   }catch(error){const row=journal.readParentAttempt(id,ownerAccountHash);
    if(row?.state==='PREPARED')journal.recoverUnsignedParent(id,ownerAccountHash);
    if(row?.signature)return {...inspectPhoenixParentOperation(journal.readParentAttempt(id,ownerAccountHash)),requiresAttention:true};throw error;}
  });},
  async recover({ownerAccountHash,walletAddress,id}){return exclusive(walletAddress,async()=>{owned({ownerAccountHash,walletAddress});return recoverPhoenixParent({journal,id:hex(id),ownerAccountHash,walletAddress,request,now});});}
 });
}
