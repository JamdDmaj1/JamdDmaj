// Authenticated service composition, never an unauthenticated transfer API.
import {randomBytes} from 'node:crypto';
import {createWebSwapEngine} from './web-swap-engine.js';
import {botSwapAmountUnits} from './perps-bot-swap-review.js';
import {authorizeBotSwapCustody} from './perps-bot-swap-signing.js';
import {requireBotSwapJournal} from './perps-bot-swap-journal.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {requireFreshServerPerpsAccount} from './perps-server-account.js';
const SOL='So11111111111111111111111111111111111111112',USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const READS=new Set(['getGenesisHash','getSlot','getLatestBlockhash','getMultipleAccounts','getBlockHeight','isBlockhashValid','getFeeForMessage','getMinimumBalanceForRentExemption','simulateTransaction','getSignatureStatuses']);
function fail(code='BOT_SWAP_UNAVAILABLE'){throw Error(code);}
function projection(row){return {id:row.id,walletAddress:row.wallet,state:row.state,signature:row.signature,createdAt:row.created,updatedAt:row.updated,submitted:row.state!=='SIGNING'&&row.state!=='ABORTED',readyForRetry:false};}
export function createBotWalletSwapService({controls,vault,journal,riskJournal,backupRegistry,readAccount,readRequest,sendRequest,fetchImpl,isRunning,now=Date.now}={}){
 requireBotSwapJournal(journal);
 if(!['read','readForOwner'].every(k=>typeof controls?.[k]==='function')||typeof vault?.describe!=='function'||typeof vault?.signBotSwap!=='function'
  ||typeof backupRegistry?.readVerified!=='function'||[readAccount,readRequest,sendRequest,fetchImpl,isRunning,now].some(fn=>typeof fn!=='function'))fail();
 const reviews=new Map(),busy=new Set();
 function owned(ownerAccountHash,walletAddress){
  if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash))fail('BOT_SWAP_LOGIN_REQUIRED');
  const state=controls.readForOwner({ownerAccountHash});if(!state||state.walletAddress!==walletAddress)fail('BOT_SWAP_OWNERSHIP_REQUIRED');return state;
 }
 function unencumbered(who){
  if(isRunning()!==true)fail();
  const state=owned(who.ownerAccountHash,who.walletAddress),custody=vault.describe(who);
  if(state.enabled!==false||state.paused!==true)fail('BOT_SWAP_PAUSE_REQUIRED');
  if(custody.exclusive!==true||custody.walletAddress!==who.walletAddress||custody.ownerAccountHash!==who.ownerAccountHash||custody.restoreReviewRequired===true)fail('BOT_SWAP_CUSTODY_UNAVAILABLE');
  for(const name of ['pending','openPositions','pendingExitCancellations','pendingPositionCloses','pendingPlatformFeePayments']){
   if(typeof riskJournal?.[name]!=='function'||riskJournal[name](who.walletAddress).length)fail('BOT_SWAP_RECONCILIATION_REQUIRED');
  }
  const risk=riskJournal.riskState(who.walletAddress);
  if(risk.pendingCount!==0||risk.openReservationCount!==0||BigInt(risk.activeMarginUsdcUnits)!==0n)fail('BOT_SWAP_RECONCILIATION_REQUIRED');
  return state;
 }
 function backup(who){const proof=requireVerifiedPerpsCustodyBackup(backupRegistry.readVerified(who),who);if(proof.botSwapStateIncluded!==true)fail('BOT_SWAP_BACKUP_REQUIRED');}
 async function bank(who){const account=requireFreshServerPerpsAccount(await readAccount(who),{walletAddress:who.walletAddress});if(account.openPositions!==0)fail('BOT_SWAP_OPEN_POSITIONS');return account;}
 function clean(){for(const [id,p]of reviews)if(now()>=p.review.expiresAt){p.engine.invalidate();reviews.delete(id);}if(reviews.size>=100)fail('BOT_SWAP_REVIEW_CAPACITY');}
 async function exclusive(wallet,fn){if(busy.has(wallet))fail('BOT_SWAP_BUSY');busy.add(wallet);try{return await fn();}finally{busy.delete(wallet);}}
 const api={
  hasPending(wallet){return journal.pending(wallet).length>0||busy.has(wallet);},
  status({ownerAccountHash,walletAddress}){
   const state=owned(ownerAccountHash,walletAddress);let available=true,reason=null;
   try{unencumbered({ownerAccountHash,walletAddress});backup({ownerAccountHash,walletAddress});if(api.hasPending(walletAddress))fail('BOT_SWAP_RECONCILIATION_REQUIRED');}catch(error){available=false;reason=error.message;}
   return {stage:'EXCLUSIVE_BOT_WALLET_OPERATIONS',walletAddress,swapAvailable:available,reason,paused:state.paused,
    operations:journal.recent(ownerAccountHash,walletAddress).map(projection),readyForSigning:false};
  },
  async prepare({ownerAccountHash,walletAddress,direction,amount}){return exclusive(walletAddress,async()=>{
   const who={ownerAccountHash,walletAddress},state=unencumbered(who);backup(who);if(journal.pending(walletAddress).length)fail('BOT_SWAP_RECONCILIATION_REQUIRED');clean();
   if(!['SOL_TO_USDC','USDC_TO_SOL'].includes(direction))fail('BOT_SWAP_INVALID_PAIR');
   const inputSol=direction==='SOL_TO_USDC',units=botSwapAmountUnits(amount,inputSol?9:6);await bank(who);unencumbered(who);
   let claim=null;const id=randomBytes(32).toString('hex');
   const adapter={read:async address=>{const pending=journal.pending(address);return pending.length?{signature:pending[0].signature}:null;},
    begin:record=>{if(!claim)fail();return journal.beginBroadcast(claim,record);},resolve:()=>fail()};
   const current=()=>{try{if(unencumbered(who).revision!==state.revision)return false;backup(who);return true;}catch{return false;}};
   const engine=createWebSwapEngine({journal:adapter,now,isForeground:current,
    rpc:(method,params)=>{if(!READS.has(method)&&method!=='sendTransaction')fail();if(method==='sendTransaction'&&!current())fail('BOT_SWAP_SETTINGS_CHANGED');return method==='sendTransaction'?sendRequest(method,params):readRequest(method,params);},
    fetchImpl:(path,options)=>{const url=new URL(path,'https://www.jamddmaj.com');if(url.origin!=='https://www.jamddmaj.com'||url.pathname!=='/api/swap-build')fail();return fetchImpl(url.href,options);}});
   const source=await engine.prepare({payer:walletAddress,inputMint:inputSol?SOL:USDC,outputMint:inputSol?USDC:SOL,amount:units,slippageBps:50});
   if(unencumbered(who).revision!==state.revision)fail('BOT_SWAP_SETTINGS_CHANGED');backup(who);
   const review=Object.freeze({id,stage:'BOT_SWAP_REVIEW',walletAddress,controlRevision:state.revision,direction,inputUnits:source.input,minimumOutputUnits:source.minimum,
    simulatedOutputUnits:source.simulatedOutput,networkFeeLamports:source.fee,accountRentLamports:source.rent,slippageBps:50,expiresAt:source.expiresAt,submitted:false});
   reviews.set(id,{who,engine,source,review,setClaim:value=>{claim=value;},used:false});return review;
  });},
  async confirm({ownerAccountHash,walletAddress,id,explicitApproval}){return exclusive(walletAddress,async()=>{
   owned(ownerAccountHash,walletAddress);const p=reviews.get(id);
   if(!p||p.used||p.who.ownerAccountHash!==ownerAccountHash||p.who.walletAddress!==walletAddress||explicitApproval!==true)fail('BOT_SWAP_REVIEW_REQUIRED');
   p.used=true;reviews.delete(id);let claim;
   try{
    if(now()>=p.review.expiresAt||unencumbered(p.who).revision!==p.review.controlRevision)fail('BOT_SWAP_SETTINGS_CHANGED');backup(p.who);await bank(p.who);
    const authorized=await authorizeBotSwapCustody({engineGrant:p.engine.authorize(p.source,true),review:p.review,journal,ownerAccountHash,controls,backupRegistry,assertUncontended:unencumbered});claim=authorized.claim;p.setClaim(claim);
    const signed=vault.signBotSwap(authorized.grant);journal.signed(claim,signed);
    if(unencumbered(p.who).revision!==p.review.controlRevision)fail('BOT_SWAP_SETTINGS_CHANGED');backup(p.who);
    await p.engine.submit(p.source,signed);return projection(journal.read(id));
   }catch(error){
    if(claim){const row=journal.read(id);if(row.state==='SIGNING')journal.abortUnsignedOrUnsent(claim);else if(row.state==='UNKNOWN')return projection(row);}
    throw error;
   }finally{p.engine.invalidate();}
  });},
  async recover({ownerAccountHash,walletAddress,id}){return exclusive(walletAddress,async()=>{
   owned(ownerAccountHash,walletAddress);let row=journal.read(id);if(!row||row.owner!==ownerAccountHash||row.wallet!==walletAddress)fail('BOT_SWAP_OWNERSHIP_REQUIRED');
   // SIGNING can never have reached send: UNKNOWN is fsynced before transport.
   if(row.state==='SIGNING')return projection(journal.recoverNeverBroadcast(id,ownerAccountHash));
   if(row.state!=='UNKNOWN')return projection(row);
   const engine=createWebSwapEngine({journal:{read:async()=>({signature:row.signature,lastValidBlockHeight:row.last_height}),resolve:async(address,signature,state)=>{if(address!==walletAddress)fail();row=journal.settle(id,signature,state);}},rpc:(method,params)=>{if(!READS.has(method))fail();return readRequest(method,params);},now});
   await engine.checkPending(walletAddress);return projection(journal.read(id));
  });}
 };return Object.freeze(api);
}
