// VPS HTTP adapter. Authentication and shared rate limiting are mandatory
// server dependencies; neither the owner identity nor readiness comes from JSON.
import {validateServerPerpsAutomationSettings} from './perps-automation-controls.js';
import {requireVerifiedPerpsCustodyBackup} from './perps-backup-registry.js';
import {requireFreshServerPerpsAccount} from './perps-server-account.js';
import {exactUsdUnits} from './jupiter-perps-order.js';
const ORIGINS=new Set(['https://www.jamddmaj.com','https://jamddmaj.com','https://localhost','capacitor://localhost']);
const FIELDS={provision:['action','settings','explicitCustodyApproval'],save:['action','walletAddress','expectedRevision','settings'],pause:['action','walletAddress'],
 phoenixReconcile:['action','walletAddress'],phoenixEngineStatus:['action','walletAddress'],phoenixMarkets:['action','walletAddress'],phoenixStatus:['action','walletAddress'],phoenixPositions:['action','walletAddress'],phoenixHistory:['action','walletAddress'],
 phoenixParentStatus:['action','walletAddress'],phoenixParentPrepare:['action','walletAddress','symbol'],phoenixParentConfirm:['action','walletAddress','id','explicitApproval'],phoenixParentRecover:['action','walletAddress','id'],
 phoenixPayout:['action','walletAddress','workflowId','explicitApproval'],phoenixClosePrepare:['action','walletAddress','workflowId'],phoenixCloseConfirm:['action','walletAddress','id','explicitApproval'],phoenixCloseRecover:['action','walletAddress','workflowId'],
 phoenixEntryPrepare:['action','walletAddress','symbol','side','marginUsdcUnits','leverageTenths'],phoenixEntryConfirm:['action','walletAddress','id','explicitApproval'],phoenixEntryRecover:['action','walletAddress','workflowId'],
 phoenixSetupAccount:['action','walletAddress','symbol','side','marginUsdcUnits','leverageTenths','explicitApproval'],phoenixSetupRecover:['action','walletAddress','id'],
 botManualStatus:['action','walletAddress'],botManualPrepare:['action','walletAddress','draft','entryReservationId'],botManualConfirm:['action','walletAddress','id','explicitApproval','explicitFeeApproval','feeTermsVersion'],botManualRecover:['action','walletAddress','id'],
 botManualPositions:['action','walletAddress'],botManualHistory:['action','walletAddress'],botManualClosePrepare:['action','walletAddress','positionAddress','referencePrice'],botManualCloseConfirm:['action','walletAddress','id','explicitApproval'],botManualCloseRecover:['action','walletAddress','id'],
 botManualRecoveryPrepare:['action','walletAddress','id'],botManualRecoveryConfirm:['action','walletAddress','id','explicitApproval'],botManualRecoveryRecover:['action','walletAddress','id'],
 botTransferStatus:['action','walletAddress'],botTransferPrepare:['action','walletAddress','recipient','mint','amount'],botTransferConfirm:['action','walletAddress','id','explicitApproval'],botTransferRecover:['action','walletAddress','id'],
 botSwapStatus:['action','walletAddress'],botSwapPrepare:['action','walletAddress','direction','amount'],botSwapConfirm:['action','walletAddress','id','explicitApproval'],botSwapRecover:['action','walletAddress','id'],
 activationReview:['action','walletAddress','expectedRevision'],activate:['action','walletAddress','expectedRevision','token','explicitApproval','explicitFeeApproval','feeTermsVersion']};
const ERRORS=new Map([
 ['PERPS_ENTRY_CONVERSION_REVIEW_EXPIRED',[409,'entry-review-expired']],
 ['UNVERIFIED_PERPS_ENTRY_CONVERSION_PREPARATION',[409,'entry-review-unverified']],
 ['PERPS_ENTRY_CONVERSION_COST_CHANGED',[409,'entry-cost-changed']],
 ['PERPS_ENTRY_CONVERSION_SNAPSHOT_BANK_CHANGED',[409,'entry-snapshot-changed']],
 ['UNVERIFIED_PERPS_ENTRY_CONVERSION_SIMULATION',[409,'entry-simulation-unverified']],
 // Fixed public diagnostic codes only. Never expose provider text or wire data.
 ['PHOENIX_ENTRY_GATED',[409,'phoenix-entry-gated']],
 ['PHOENIX_SERVICE_ONBOARDING_REQUIRED',[409,'phoenix-onboarding-required']],
 ['PHOENIX_SERVICE_CONSENT_REQUIRED',[409,'phoenix-consent-required']],
 ['PERPS_CLOSE_PREPARATION_UNAVAILABLE',[503,'close-builder-unavailable']],
 ['PERPS_CLOSE_ACCOUNT_BINDINGS_MISMATCH',[409,'close-account-check-failed']],
 ['UNVERIFIED_PERPS_CLOSE_ORACLE_CONTEXT',[409,'close-price-context-unverified']],
 ['UNSAFE_PERPS_CLOSE_INSTRUCTION_POLICY',[409,'close-instruction-check-failed']],
 ['UNVERIFIED_PERPS_CLOSE_SIMULATION',[409,'close-simulation-unverified']],
 ['PERPS_CLOSE_SNAPSHOT_BANK_CHANGED',[409,'close-snapshot-changed']],
 ['PERPS_CLOSE_WALLET_FUNDING_MISMATCH',[409,'close-funding-check-failed']],
 ['PERPS_CLOSE_POOL_CONFIGURATION_MISMATCH',[409,'close-pool-check-failed']],
 ['PERPS_CLOSE_RESERVE_RELEASE_MISMATCH',[409,'close-reserve-check-failed']],
 ['PERPS_CLOSE_VAULT_CONSERVATION_MISMATCH',[409,'close-vault-check-failed']],
 ['PERPS_CLOSE_RETURN_POLICY_MISMATCH',[409,'close-return-check-failed']],
 ['PERPS_CLOSE_IMPACT_HISTORY_MISMATCH',[409,'close-impact-history-check-failed']],
 ['PERPS_CLOSE_BORROW_ACCRUAL_MISMATCH',[409,'close-borrow-accrual-check-failed']],
 ['PERPS_READ_ONLY_RPC_RATE_LIMITED',[429,'rpc-rate-limit']],
 ['BOT_MANUAL_RECOVERY_REVIEW_REQUIRED',[409,'bot-manual-recovery-review-required']],
 ['PERPS_ENTRY_RECOVERY_ATTEMPT_REQUIRED',[409,'bot-manual-recovery-review-required']],
 ['PERPS_CUSTODY_CAPACITY_REACHED',[503,'custody-capacity']],
 ['PERPS_CONTROLS_UNAVAILABLE',[403,'controls-unavailable']],['STALE_PERPS_CONTROLS',[409,'settings-changed']],
 ['INVALID_PERPS_SETTINGS',[400,'invalid-settings']],['PERPS_EXECUTION_NOT_CONFIGURED',[503,'execution-unavailable']],
 ['INVALID_PERPS_ACTIVATION_APPROVAL',[409,'activation-review-expired']],['EXPIRED_PERPS_ACTIVATION_REVIEW',[409,'activation-review-expired']],
 ['PERPS_ACTIVATION_RISK_LIMIT',[422,'risk-limit']]
]);
async function input(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))throw Error('INPUT');
 const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error('INPUT');
 if(!request.body)throw Error('INPUT');const reader=request.body.getReader(),parts=[];let size=0,timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('INPUT')),5000);});
 try{
  while(true){const chunk=await Promise.race([reader.read(),expired]);if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)throw Error('INPUT');parts.push(Buffer.from(chunk.value));}
  const value=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.action!=='string'||!Object.hasOwn(FIELDS,value.action)
   ||Object.keys(value).some(key=>!FIELDS[value.action].includes(key)))throw Error('INPUT');
  return value;
 }finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}

async function diagControls(payload){
 try{const base=process.env.UPSTASH_REDIS_REST_URL||process.env.STASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.STASH_REDIS_REST_TOKEN;
  if(!base||!token)return;
  await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(['SET','jamd:diag:controls',JSON.stringify(payload),'EX',3600])});
 }catch{}
}
export function createPerpsAutomationApi({authenticate,rateLimit,controls,provisionCustody=null,readBackupProof=null,readFundingAccount=null,platformFees=null,botSwaps=null,botManual=null,botPhoenix=null,phoenixParents=null}={}){
 if(botPhoenix!==null&&!['status','positions','history','prepareClose','confirmClose','recoverClose'].every(k=>typeof botPhoenix?.[k]==='function'))throw Error('PERPS_API_NOT_CONFIGURED');
 if(phoenixParents!==null&&!['status','prepare','confirm','recover'].every(k=>typeof phoenixParents?.[k]==='function'))throw Error('PERPS_API_NOT_CONFIGURED');
 if(botManual!==null&&!['status','prepare','confirm','recover'].every(k=>typeof botManual[k]==='function'))throw Error('PERPS_API_NOT_CONFIGURED');
 if(botSwaps!==null&&!['status','prepare','confirm','recover'].every(k=>typeof botSwaps?.[k]==='function'))throw Error('PERPS_API_NOT_CONFIGURED');
 if(typeof authenticate!=='function'||typeof rateLimit!=='function'||provisionCustody!==null&&typeof provisionCustody!=='function'||readBackupProof!==null&&typeof readBackupProof!=='function'||!['read','readForOwner','save','pause','issueActivationChallenge','activate'].every(k=>typeof controls?.[k]==='function'))throw Error('PERPS_API_NOT_CONFIGURED');
 if(readFundingAccount!==null&&typeof readFundingAccount!=='function')throw Error('PERPS_API_NOT_CONFIGURED');
 if(platformFees!==null&&(!platformFees||typeof platformFees.automationDisclosure!=='function'||typeof platformFees.recordAutomationConsent!=='function'))throw Error('PERPS_API_NOT_CONFIGURED');
 async function funding(ownerAccountHash,state){
  if(!state||!readFundingAccount)return null;
  // Read only AFTER authenticated ownership lookup. Never query a body-selected
  // main/Phantom account, infer a failed RPC as zero, or return authority.
  try{
   const account=requireFreshServerPerpsAccount(await readFundingAccount({ownerAccountHash,walletAddress:state.walletAddress}),{walletAddress:state.walletAddress});
   if(!['confirmed','finalized'].includes(account.commitment))throw Error();
   const required=exactUsdUnits(state.settings.margin);
   return {walletAddress:state.walletAddress,stage:'OBSERVED_EXCLUSIVE_WALLET_FUNDS',availableUsdcUnits:account.availableUsdcUnits,
    payerLamports:account.payerLamports,configuredMarginUsdcUnits:required,hasConfiguredCollateral:BigInt(account.availableUsdcUnits)>=BigInt(required),
    observedAt:account.observedAt,observedSlot:account.observedSlot,fundingAvailable:false,readyForSigning:false};
  }catch{return {walletAddress:state.walletAddress,stage:'EXCLUSIVE_WALLET_FUNDS_UNAVAILABLE',fundingAvailable:false,readyForSigning:false};}
 }
 function recovery(ownerAccountHash,state){
  if(!state)return null;
  const who={ownerAccountHash,walletAddress:state.walletAddress};let proof;
  try{if(readBackupProof)proof=requireVerifiedPerpsCustodyBackup(readBackupProof(who),who);}
  catch(error){if(error?.message!=='PERPS_CUSTODY_BACKUP_UNVERIFIED')throw error;}
  if(platformFees&&proof?.platformFeeStateIncluded!==true)proof=null;
  // Informational projection only: never serialize the private proof, archive
  // identity, account hash or recovery token, and never infer funding readiness.
  return {walletAddress:state.walletAddress,stage:proof?'BACKUP_VERIFIED_EXECUTION_PENDING':'BACKUP_VERIFICATION_REQUIRED',
   backupVerified:!!proof,verifiedAt:proof?proof.verifiedAt:null,fundingAvailable:false,readyForSigning:false};
 }
 function fees(ownerAccountHash,state){return state&&typeof platformFees?.status==='function'?platformFees.status({ownerAccountHash,walletAddress:state.walletAddress}):null;}
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store, max-age=0','Vary':'Origin','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
  if(origin&&ORIGINS.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  if(origin&&!ORIGINS.has(origin))return reply({error:{code:'origin-denied'}},403);
  const url=new URL(request.url);if(url.pathname!=='/v1/automation')return reply({error:{code:'not-found'}},404);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(request.method))return reply({error:{code:'method'}},405);
  // Bearer sessions are verified against the existing server session ledger.
  // Cookies, device IDs and a saved Google profile do not authorize controls.
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return reply({error:{code:'login-required'}},401);
  let ownerAccountHash;
  try{ownerAccountHash=await authenticate(request);if(!/^[a-f0-9]{64}$/.test(ownerAccountHash||''))throw Object.assign(Error(),{status:401});}
  catch(error){return reply({error:{code:error?.status===401?'login-required':'authentication-unavailable'}},error?.status===401?401:503);}
  try{if(await rateLimit({ownerAccountHash,scope:'perps-automation-controls'})!==true)return reply({error:{code:'rate-limit'}},429);}
  catch{return reply({error:{code:'controls-unavailable'}},503);}
  try{
   if(request.method==='GET'){
    if(!url.search){const state=controls.readForOwner({ownerAccountHash});if(!state)await diagControls({step:'readForOwner-null',who:String(ownerAccountHash).slice(0,8),at:Date.now()});return reply({ok:true,controls:state,recovery:recovery(ownerAccountHash,state),funding:await funding(ownerAccountHash,state),platformFees:fees(ownerAccountHash,state)});}
    if([...url.searchParams.keys()].some(k=>k!=='walletAddress')||url.searchParams.getAll('walletAddress').length!==1)return reply({error:{code:'invalid-request'}},400);
    const state=controls.read({ownerAccountHash,walletAddress:url.searchParams.get('walletAddress')});if(!state)await diagControls({step:'read-null',who:String(ownerAccountHash).slice(0,8),wallet:String(url.searchParams.get('walletAddress')).slice(0,6),at:Date.now()});
    return reply({ok:true,controls:state,recovery:recovery(ownerAccountHash,state),funding:await funding(ownerAccountHash,state),platformFees:fees(ownerAccountHash,state)});
   }
   if(url.search)return reply({error:{code:'invalid-request'}},400);
   let body;try{body=await input(request);}catch{return reply({error:{code:'invalid-request'}},400);}
   const args={...body,ownerAccountHash};delete args.action;
   if(body.action.startsWith('phoenix')){
    controls.read({ownerAccountHash,walletAddress:body.walletAddress});
    const target=body.action.startsWith('phoenixParent')?phoenixParents:botPhoenix;
    if(!target)return reply({error:{code:'phoenix-unavailable'}},503);
    const method={phoenixMarkets:'markets',phoenixEngineStatus:'engineStatus',phoenixReconcile:'reconcilePending',phoenixStatus:'status',phoenixPositions:'positions',phoenixHistory:'history',phoenixPayout:'payout',phoenixClosePrepare:'prepareClose',phoenixCloseConfirm:'confirmClose',phoenixCloseRecover:'recoverClose',
     phoenixEntryPrepare:'prepareEntry',phoenixEntryConfirm:'confirmEntry',phoenixEntryRecover:'recoverEntry',
 phoenixSetupAccount:'setupAccount',phoenixSetupRecover:'recoverChildSetup',
     phoenixParentStatus:'status',phoenixParentPrepare:'prepare',phoenixParentConfirm:'confirm',phoenixParentRecover:'recover'}[body.action];
    if(typeof target[method]!=='function')return reply({error:{code:'phoenix-unavailable'}},503);
    return reply({ok:true,phoenix:await target[method](args)});
   }
   if(body.action.startsWith('botManual')){
    controls.read({ownerAccountHash,walletAddress:body.walletAddress});
    if(!botManual)return reply({error:{code:'bot-manual-unavailable'}},503);
    const method={botManualStatus:'status',botManualPrepare:'prepare',botManualConfirm:'confirm',botManualRecover:'recover',
     botManualPositions:'positions',botManualHistory:'history',botManualClosePrepare:'prepareClose',botManualCloseConfirm:'confirmClose',botManualCloseRecover:'recoverClose',
     botManualRecoveryPrepare:'prepareRecovery',botManualRecoveryConfirm:'confirmRecovery',botManualRecoveryRecover:'recoverRecovery'}[body.action];
    if(typeof botManual[method]!=='function')return reply({error:{code:body.action.startsWith('botManualRecovery')?'bot-manual-recovery-unavailable':'bot-manual-close-unavailable'}},503);
    return reply({ok:true,botManual:await botManual[method](args)});
   }
   if(body.action.startsWith('botSwap')||body.action.startsWith('botTransfer')){
    // Verify durable ownership before invoking any custody-specific component.
    controls.read({ownerAccountHash,walletAddress:body.walletAddress});
    if(!botSwaps)return reply({error:{code:'bot-swap-unavailable'}},503);
    const method={botSwapStatus:'status',botSwapPrepare:'prepare',botSwapConfirm:'confirm',botSwapRecover:'recover',botTransferStatus:'status',botTransferPrepare:'prepareTransfer',botTransferConfirm:'confirm',botTransferRecover:'recover'}[body.action];
    if(body.action==='botTransferConfirm')args.transfer=true;
    if(typeof botSwaps[method]!=='function')return reply({error:{code:'transfer-unavailable'}},503);
    return reply({ok:true,botSwap:await botSwaps[method](args)});
   }
   if(body.action==='provision'){
    if(body.explicitCustodyApproval!==true)return reply({error:{code:'custody-approval-required'}},400);
    let settings;try{settings=validateServerPerpsAutomationSettings(body.settings);}catch{return reply({error:{code:'invalid-settings'}},400);}
    if(!provisionCustody)return reply({error:{code:'custody-unavailable'}},503);
    const prepared=await provisionCustody({ownerAccountHash,settings,explicitCustodyApproval:true});
    // The authenticated durable mapping, not a callback-supplied owner or UI
    // boolean, determines which public wallet can be returned. No funding or
    // activation capability is granted by this setup response.
    const state=controls.readForOwner({ownerAccountHash});
    if(!state||state.walletAddress!==prepared?.walletAddress||state.enabled!==false||state.paused!==true
      ||prepared.backupVerified!==false||prepared.fundingAvailable!==false||prepared.readyForSigning!==false)throw Error();
    return reply({ok:true,controls:state,setup:{stage:'BACKUP_VERIFICATION_REQUIRED',backupVerified:false,fundingAvailable:false,readyForSigning:false}});
   }
   if(body.action==='activationReview'){
    controls.read({ownerAccountHash,walletAddress:body.walletAddress});
    if(typeof platformFees?.assertActivationReadiness==='function')await platformFees.assertActivationReadiness({ownerAccountHash,walletAddress:body.walletAddress});
    const review=controls.issueActivationChallenge(args);
    return reply({ok:true,review:platformFees?{...review,platformFee:platformFees.automationDisclosure(controls.read({ownerAccountHash,walletAddress:body.walletAddress}))}:review});
   }
   if(body.action==='activate'&&platformFees){
    if(body.explicitFeeApproval!==true||typeof body.feeTermsVersion!=='string')return reply({error:{code:'fee-approval-required'}},400);
    const owned=controls.read({ownerAccountHash,walletAddress:body.walletAddress});
    if(owned.revision!==body.expectedRevision)throw Error('STALE_PERPS_CONTROLS');
    if(typeof platformFees.assertActivationReadiness==='function')await platformFees.assertActivationReadiness({ownerAccountHash,walletAddress:body.walletAddress});
    platformFees.recordAutomationConsent({ownerAccountHash,walletAddress:body.walletAddress,expectedRevision:body.expectedRevision,
      termsVersion:body.feeTermsVersion,explicitFeeApproval:true});
   }
   if(body.action==='activate'&&!platformFees&&(Object.hasOwn(body,'feeTermsVersion')||Object.hasOwn(body,'explicitFeeApproval')))
    return reply({error:{code:'fee-service-changed'}},409);
   const state=body.action==='activate'?await controls.activate(args):body.action==='save'?controls.save(args):controls.pause(args);
   return reply({ok:true,controls:state});
  }catch(error){
   console.error('API_ERROR',String(error?.name||''),String(error?.message||'').slice(0,90));
   if(typeof error?.message==='string'&&/^(PHOENIX|PERPS)_[A-Z0-9_]+$/.test(error.message))console.error('VENUE_ERROR',error.message,String(error.stack||'').split(String.fromCharCode(10)).slice(1,4).join(' | '));

   const phoenixErrors=new Set(['INPUT','OWNERSHIP','CUSTODY','PAUSE_REQUIRED','BACKUP_REQUIRED','PENDING','BUSY','NOT_FOUND','CONSENT_REQUIRED','COST_CHANGED','NETWORK','POSITION_NOT_OPEN','REVIEW_CHANGED','REVIEW_REQUIRED','PAYOUT_REQUIRED','ONBOARDING_REQUIRED','INSUFFICIENT_USDC','INSUFFICIENT_SOL','SIZE_TIER','SYMBOL','MARKET']);
   if(typeof error?.message==='string'&&error.message.startsWith('PHOENIX_SERVICE_')&&phoenixErrors.has(error.message.slice(16)))return reply({error:{code:error.message.toLowerCase().replaceAll('_','-')}},409);
   if(typeof error?.message==='string'&&error.message.startsWith('PHOENIX_PARENT_SERVICE_')&&phoenixErrors.has(error.message.slice('PHOENIX_PARENT_SERVICE_'.length)))return reply({error:{code:error.message.toLowerCase().replaceAll('_','-')}},409);
   const manualErrors=new Set(['BOT_MANUAL_OWNERSHIP_REQUIRED','BOT_MANUAL_PAUSE_REQUIRED','BOT_MANUAL_PENDING','BOT_MANUAL_BUSY','BOT_MANUAL_REVIEW_REQUIRED','BOT_MANUAL_REVIEW_CHANGED','BOT_MANUAL_BACKUP_REQUIRED','BOT_MANUAL_INSUFFICIENT_USDC','BOT_MANUAL_CAPITAL_LIMIT','BOT_MANUAL_NOT_FOUND','BOT_MANUAL_POSITION_UNTRACKED','BOT_MANUAL_CLOSE_UNAVAILABLE','BOT_MANUAL_FEE_PENDING','MANUAL_PERPS_LIMITS_REQUIRED','PERPS_MANUAL_INSUFFICIENT_USDC','PERPS_MANUAL_INSUFFICIENT_SOL','CAPITAL_LIMIT','DAILY_LOSS_LIMIT','POSITION_LIMIT','DAILY_TRADE_LIMIT','INSUFFICIENT_UNRESERVED_BALANCE','RECONCILIATION_REQUIRED']);
   if(error?.message==='BOT_MANUAL_CONVERSION_PENDING')return reply({error:{code:'bot-manual-conversion-pending'}},409);
   if(error?.message==='PERPS_PRESWAP_INTENT_MISMATCH_MINIMUM_OUTPUT')return reply({error:{code:'perps-preswap-intent-mismatch-minimum-output'}},409);
   if(manualErrors.has(error?.message))return reply({error:{code:error.message.toLowerCase().replaceAll('_','-')}},409);
   if(error?.message==='PLATFORM_FEE_RECIPIENT_USDC_ACCOUNT_MISSING')return reply({error:{code:'fee-recipient-account-missing'}},409);
   // Surface the real venue code instead of a blind 503: the owner can act on it
   // and support can read it without server access.
   if(typeof error?.message==='string'&&/^PHOENIX_[A-Z0-9_]+$/.test(error.message))return reply({error:{code:error.message.toLowerCase().replaceAll('_','-')}},409);
   const transferErrors=new Set(['TRANSFER_REJECTED','TRANSFER_INVALID_ADDRESS','TRANSFER_INVALID_AMOUNT','TRANSFER_UNSUPPORTED_TOKEN','TRANSFER_NETWORK_MISMATCH','TRANSFER_REVIEW_EXPIRED','TRANSFER_PENDING','TRANSFER_COST_CHANGED','TRANSFER_INSUFFICIENT_FUNDS','TRANSFER_SIMULATION_FAILED','TRANSFER_APPROVAL_REQUIRED','TRANSFER_SIGNATURE_MISMATCH']);
   if(transferErrors.has(error?.message))return reply({error:{code:error.message.toLowerCase().replaceAll('_','-')}},409);
   const botErrors=new Set(['BOT_SWAP_PAUSE_REQUIRED','BOT_SWAP_BACKUP_REQUIRED','BOT_SWAP_RECONCILIATION_REQUIRED','BOT_SWAP_INVALID_AMOUNT','BOT_SWAP_INVALID_PAIR','BOT_SWAP_REVIEW_REQUIRED','BOT_SWAP_SETTINGS_CHANGED','BOT_SWAP_OPEN_POSITIONS','BOT_SWAP_BUSY','BOT_SWAP_CUSTODY_UNAVAILABLE','BOT_SWAP_OWNERSHIP_REQUIRED']);
   if(botErrors.has(error?.message))return reply({error:{code:error.message.toLowerCase().replaceAll('_','-')}},409);
   const swapErrors={WEB_SWAP_SIMULATION_FAILED:[409,'bot-swap-simulation-failed'],WEB_SWAP_INSUFFICIENT_FUNDS:[409,'bot-swap-insufficient-funds'],
    WEB_SWAP_REVIEW_EXPIRED:[409,'bot-swap-review-expired'],WEB_SWAP_COST_CHANGED:[409,'bot-swap-cost-changed'],WEB_SWAP_POLICY_REJECTED:[409,'bot-swap-route-rejected'],
    WEB_SWAP_ROUTE_TOO_LARGE:[409,'bot-swap-route-rejected'],WEB_SWAP_EXISTING_WRAPPED_SOL:[409,'bot-swap-existing-wrapped-sol'],WEB_SWAP_PENDING_CHECK_REQUIRED:[409,'bot-swap-reconciliation-required'],
    WEB_SWAP_SERVICE_UNAVAILABLE:[503,'bot-swap-quote-unavailable'],PERPS_READ_ONLY_RPC_UNAVAILABLE:[503,'bot-swap-network-unavailable'],UNVERIFIED_SERVER_PERPS_ACCOUNT:[503,'bot-swap-account-unverified'],WEB_SWAP_STATUS_UNVERIFIED:[503,'bot-swap-status-unverified']};
   if(Object.hasOwn(swapErrors,error?.message||'')){const [status,code]=swapErrors[error.message];return reply({error:{code}},status);}
   const [status,code]=ERRORS.get(error?.message)||[503,'controls-unavailable'];
  await diagControls({step:'error',code,who:String(ownerAccountHash).slice(0,8),detail:String(error?.message||'').slice(0,50),at:Date.now()});
  // Keep an unmapped failure diagnosable from the client: the code alone cannot
  // distinguish a custody read from a venue read.
  // Only venue codes are echoed: arbitrary provider text must never reach a client.
  if(code==='controls-unavailable')return reply({error:{code:'controls-unavailable:who='+String(ownerAccountHash).slice(0,8)}},status);
  return reply({error:{code}},status);
  }
 };
}
