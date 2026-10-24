// External-owner close flow. No custody vault, server key, entry creation or
// implicit retries. Financial facts use the existing backed-up shared journal.
import {randomBytes,createHash} from 'node:crypto';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireManualPerpsPolicyStore} from './perps-manual-policy-store.js';
import {prepareSimulatedServerPerpsFullClose} from './perps-server-close-preparation.js';
import {describeSimulatedPerpsCloseSettlement} from './perps-close-settlement.js';
import {verifyOwnerSignedPerpsCloseIntent} from './perps-close-execution-record.js';
import {readJournaledPerpsCloseConversion} from './perps-journal-close-conversion.js';
import {verifyOwnerSignedPerpsCloseConversionIntent} from './perps-close-conversion-record.js';
import {reconcileRecordedPerpsCloses} from './perps-close-completion.js';
import {readServerPerpsExitCleanup} from './perps-position-closure.js';
import {buildUnsignedPerpsExitCleanup} from './perps-exit-cleanup.js';
import {inspectServerPerpsExitCancellation} from './perps-exit-cancellation.js';
import {simulateServerPerpsExitCancellation} from './perps-exit-cancellation-simulation.js';
import {reconcilePendingPerpsExitCancellations} from './perps-exit-cancellation-recovery.js';
import {validateWebClosePacket,verifyWebCloseSignature,webCloseBindingText,webCloseKey} from './perps-web-close-protocol.js';
import {webPerpsSha256} from './perps-web-review-protocol.js';
const prefix='jamd:web-perps:review:v1:',keeper='https://perps-api.jup.ag/v2/transaction/execute',sendRpc='https://api.mainnet-beta.solana.com/';
function fail(code='WEB_CLOSE_UNAVAILABLE'){throw Error(code);}
function owner(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
function identifier(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
function bps(value){if(!Number.isSafeInteger(value)||value<1||value>100)fail();return value;}
const hash=encoded=>createHash('sha256').update(Buffer.from(encoded,'base64')).digest('hex');
export function createWebPerpsCloseCoordinator({journal,policyStore,command,rpcRequest,builderRequest,fetchImpl,isExecutionAvailable,isOpen=()=>true,readFinalizedAccount,now=Date.now,monotonicNow=()=>performance.now()}={}){
 requirePerpsExecutionJournal(journal);requireManualPerpsPolicyStore(policyStore);
 if([command,rpcRequest,builderRequest,fetchImpl,isExecutionAvailable,isOpen,readFinalizedAccount,now,monotonicNow].some(v=>typeof v!=='function'))fail();
 const running=new Set();
 const gate=()=>{if(isOpen()!==true||isExecutionAvailable()!==true)fail('WEB_CLOSE_EXECUTION_DISABLED');};
 function identity(account,wallet){owner(account);webCloseKey(wallet);if(!isOpen())fail();policyStore.readLimits({ownerAccountHash:account,walletAddress:wallet});}
 function parent(account,wallet,closeId){identity(account,wallet);if(typeof closeId!=='string'||!closeId.startsWith('wc:'+account+':')||!/^wc:[a-f0-9]{64}:[a-f0-9]{64}$/.test(closeId))fail();
  const row=journal.readPositionClose(closeId);if(!row||row.wallet!==wallet)fail();return row;}
 async function cache(account,packet,context){
  packet.recordBinding=await webPerpsSha256(webCloseBindingText(packet));
  await validateWebClosePacket(packet,{walletAddress:packet.walletAddress,positionAddress:packet.positionAddress,now:now()});gate();
  const value=JSON.stringify({ownerAccountHash:account,packet,context});if(value.length>8192||await command(['SET',prefix+packet.reviewId,value,'EX',120,'NX'])!=='OK')fail();
  if(await command(['GET',prefix+packet.reviewId])!==value)fail();gate();return packet;
 }
 function packet(account,wallet,position,operation,details,material,slot,at,closeId){const reviewId=randomBytes(32).toString('hex');return {version:1,reviewId,closeId:closeId||'wc:'+account+':'+reviewId,operation,walletAddress:wallet,positionAddress:position,
  observedAt:at,expiresAt:at+15000,observedSlot:slot,details,material,recordBinding:null,readyForSigning:false,tradingEnabled:false};}
 const closeDetails=p=>({asset:p.plan.asset,side:p.plan.side,sizeUsdUnits:p.plan.sizeUsdUnits,collateralUsdUnits:p.plan.collateralUsdUnits,
  priceLimitUsdUnits:p.inspection.bindings.core.priceSlippageUsdUnits,receiveAsset:p.plan.receiveToken,requiresConversion:p.plan.requiresSeparateUsdcConversion,
  networkFeeLamports:p.funding.networkFeeLamports,rentLockedLamports:p.funding.rentLockedLamports,settlement:describeSimulatedPerpsCloseSettlement(p.oracleEffects).encoded});
 const material=p=>({serializedTxBase64:p.serializedTxBase64,blockhash:p.txMetadata.blockhash,lastValidBlockHeight:String(p.txMetadata.lastValidBlockHeight)});
 function trackedEntries(wallet,position){const entries=journal.openPositions(wallet).filter(e=>e.position_address===position);
  if(!entries.length||entries.some(e=>!e.reservation.startsWith('web:')))fail('WEB_CLOSE_UNTRACKED_POSITION');return entries;}
 async function prepareClose(account,input){
  gate();identity(account,input.walletAddress);trackedEntries(input.walletAddress,input.positionAddress);
  if(journal.pending(input.walletAddress).length||journal.pendingPositionCloses(input.walletAddress).length||journal.pendingExitCancellations(input.walletAddress).length)fail('WEB_CLOSE_RECONCILIATION_REQUIRED');
  const canonical={walletAddress:webCloseKey(input.walletAddress),positionAddress:webCloseKey(input.positionAddress),referencePrice:input.referencePrice,maxSlippageBps:bps(input.maxSlippageBps),settlement:'COLLATERAL_THEN_USDC'},at=now();
  const reviewed=await prepareSimulatedServerPerpsFullClose(canonical,{request:rpcRequest,fetchImpl:builderRequest,now,monotonicNow});gate();trackedEntries(input.walletAddress,input.positionAddress);
  return cache(account,packet(account,input.walletAddress,input.positionAddress,'CLOSE',closeDetails(reviewed),material(reviewed.preparation),reviewed.simulation.observedSlot,at),{input:canonical,preparation:reviewed.preparation});
 }
 async function cleanupPreparation(account,wallet,closeId,original=null){
  const row=parent(account,wallet,closeId),entries=JSON.parse(row.entries);let cleanup;
  for(const entry of entries){const current=journal.read(entry.reservation);if(!current||!current.reservation.startsWith('web:'))fail();
   if(JSON.parse(current.entry_exit_plan).exits.length===0)continue;
   const found=await readServerPerpsExitCleanup(current,{request:rpcRequest,readFinalizedAccount,now,journal});
   if(found&&(!original||found.pendingExits.some(e=>e.address===original.exitAddress))){cleanup=found;break;}}
  if(!cleanup)return null;
  const exitAddress=original?.exitAddress||cleanup.pendingExits[0].address;
  const preparation=original?.preparation||await buildUnsignedPerpsExitCleanup(cleanup,exitAddress,builderRequest);
  const inspection=await inspectServerPerpsExitCancellation(preparation,cleanup,{exitAddress,request:rpcRequest});
  const simulation=await simulateServerPerpsExitCancellation(inspection,{request:rpcRequest,monotonicNow});
  return {cleanup,preparation,inspection,simulation,exitAddress};
 }
 async function prepareNext(account,wallet,closeId,options){
  gate();const row=parent(account,wallet,closeId);if(row.state!=='PREPARED')fail();
  await recover(account,wallet,closeId);gate();const snapshot=journal.readPositionCloseCompletionSnapshot(closeId);
  if(snapshot.execution.state!=='FIRST_LEG_FINALIZED'||journal.pendingExitCancellations(wallet).length)fail('WEB_CLOSE_RECONCILIATION_REQUIRED');
  const at=now(),cleanup=await cleanupPreparation(account,wallet,closeId);gate();
  if(cleanup){
   const {preparation,inspection,simulation,exitAddress}=cleanup;
   return cache(account,packet(account,wallet,row.position,'CANCEL_EXIT',{exitAddress,networkFeeLamports:simulation.feeLamports,returnedUsdcUnits:simulation.returnedUsdcUnits},
    {serializedTxBase64:inspection.envelope.serializedTxBase64,blockhash:inspection.envelope.blockhash,lastValidBlockHeight:String(preparation.txMetadata.lastValidBlockHeight)},simulation.observedSlot,at,closeId),{exitAddress,preparation});
  }
  if(!JSON.parse(snapshot.execution.payout_json).requiresConversion||snapshot.conversion!==null)fail('WEB_CLOSE_RECONCILIATION_REQUIRED');
  const conversionOptions={maxSlippageBps:bps(options.maxSlippageBps),minimumUsdcUnits:options.minimumUsdcUnits};
  const reviewed=await journal.preparePositionCloseConversion(closeId,{request:rpcRequest,...conversionOptions,now,monotonicNow});gate();
  const proof=readJournaledPerpsCloseConversion(reviewed,journal),wire=proof.prepared.wire,sim=proof.prepared.simulation;
  return cache(account,packet(account,wallet,row.position,'CONVERT',{asset:wire.asset,amountUnits:wire.amountUnits,minimumUsdcUnits:wire.minimumUsdcUnits,networkFeeLamports:sim.networkFeeLamports,source:wire.source,destination:wire.destination,nativeSolInput:wire.nativeSolInput,closeWrappedAccount:wire.closeWrappedAccount},
   {serializedTxBase64:wire.serializedTxBase64,blockhash:wire.blockhash,lastValidBlockHeight:wire.lastValidBlockHeight},sim.observedSlot,at,closeId),{conversionOptions:{...conversionOptions,minimumUsdcUnits:wire.minimumUsdcUnits}});
 }
 async function send(encoded,signature,operation,minimumSlot){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader,acknowledged=false;
  try{gate();const convert=operation==='CONVERT',action=operation==='CLOSE'?'decrease-position':'cancel-tpsl';
   const response=await fetchImpl(convert?sendRpc:keeper,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(convert?{jsonrpc:'2.0',id:1,method:'sendTransaction',params:[encoded,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0,minContextSlot:minimumSlot}]}:{action,serializedTxBase64:encoded})});
   if(response.status!==200||response.redirected||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error();
   reader=response.body?.getReader();if(!reader)throw Error();const parts=[];let size=0;while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>4096)throw Error();parts.push(Buffer.from(p.value));}
   if(controller.signal.aborted)throw Error();const value=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   acknowledged=convert?value.jsonrpc==='2.0'&&value.id===1&&!value.error&&value.result===signature:value.action===action&&value.txid===signature;
  }catch{/* A lost response never releases the claim or authorizes a retry. */}finally{clearTimeout(timer);controller.abort();try{await reader?.cancel();}catch{}}
  return acknowledged;
 }
 async function submit(account,{reviewId,signedBase64}){
  gate();owner(account);identifier(reviewId);const text=await command(['GET',prefix+reviewId]);if(typeof text!=='string'||text.length>8192)fail();
  const cached=JSON.parse(text);if(cached.ownerAccountHash!==account||cached.packet.reviewId!==reviewId)fail();
  const {packet:p,context}=cached;identity(account,p.walletAddress);await validateWebClosePacket(p,{walletAddress:p.walletAddress,positionAddress:p.positionAddress,now:now()});
  const signature=verifyWebCloseSignature(p,signedBase64).signature,key=p.walletAddress;
  if(running.has(key))fail('WEB_CLOSE_RECONCILIATION_REQUIRED');running.add(key);
  try{
   let minimumSlot=p.observedSlot;
   if(p.operation==='CLOSE'){
    if(journal.readPositionClose(p.closeId))fail('WEB_CLOSE_RECONCILIATION_REQUIRED');trackedEntries(key,p.positionAddress);
    const reviewed=await prepareSimulatedServerPerpsFullClose(context.input,{request:rpcRequest,fetchImpl:async()=>Response.json(context.preparation),now,monotonicNow});
    if(JSON.stringify(closeDetails(reviewed))!==JSON.stringify(p.details)||JSON.stringify(material(reviewed.preparation))!==JSON.stringify(p.material))fail();
    gate();await validateWebClosePacket(p,{walletAddress:key,positionAddress:p.positionAddress,now:now()});
    journal.preparePositionClose(p.closeId,reviewed.oracleEffects);
    const intent=verifyOwnerSignedPerpsCloseIntent(journal.readPositionClose(p.closeId),signedBase64);
    journal.beginPositionCloseSigning(p.closeId);journal.recordPositionCloseBroadcast(p.closeId,intent);minimumSlot=reviewed.simulation.observedSlot;
   }else if(p.operation==='CANCEL_EXIT'){
    const row=parent(account,key,p.closeId);if(row.position!==p.positionAddress)fail();
    const id='wx:'+account+':'+reviewId;if(journal.readExitCancellation(id))fail('WEB_CLOSE_RECONCILIATION_REQUIRED');
    const reviewed=await cleanupPreparation(account,key,p.closeId,context);if(!reviewed||reviewed.inspection.envelope.serializedTxBase64!==p.material.serializedTxBase64||reviewed.simulation.feeLamports!==p.details.networkFeeLamports||reviewed.simulation.returnedUsdcUnits!==p.details.returnedUsdcUnits)fail();
    gate();await validateWebClosePacket(p,{walletAddress:key,positionAddress:p.positionAddress,now:now()});
    journal.beginExitCancellation(id,reviewed.simulation);journal.beginExitCancellationSigning(id,reviewed.simulation);
    journal.recordExitCancellationBroadcastIntent(id,{walletAddress:key,signature,wireHash:hash(signedBase64)});minimumSlot=reviewed.simulation.observedSlot;
   }else{
    const row=parent(account,key,p.closeId);if(row.position!==p.positionAddress||journal.readPositionCloseConversion(p.closeId))fail('WEB_CLOSE_RECONCILIATION_REQUIRED');
    // Rebuild the original blockhash/minimum with fresh chain evidence, never
    // substitute a newer quote for bytes already approved by the owner.
    const request=async(method,params)=>{const reply=await rpcRequest(method,params);return method==='getLatestBlockhash'?{context:reply.context,value:{blockhash:p.material.blockhash,lastValidBlockHeight:Number(p.material.lastValidBlockHeight)}}:reply;};
    const reviewed=await journal.preparePositionCloseConversion(p.closeId,{request,...context.conversionOptions,now,monotonicNow}),proof=readJournaledPerpsCloseConversion(reviewed,journal),wire=proof.prepared.wire,sim=proof.prepared.simulation;
    if(wire.serializedTxBase64!==p.material.serializedTxBase64||wire.minimumUsdcUnits!==p.details.minimumUsdcUnits||sim.networkFeeLamports!==p.details.networkFeeLamports)fail();
    const intent=verifyOwnerSignedPerpsCloseConversionIntent(wire,signedBase64);gate();await validateWebClosePacket(p,{walletAddress:key,positionAddress:p.positionAddress,now:now()});
    journal.preparePositionCloseConversionRecord(p.closeId,reviewed);journal.beginPositionCloseConversionSigning(p.closeId,reviewed);journal.recordPositionCloseConversionBroadcast(p.closeId,intent);minimumSlot=sim.observedSlot;
   }
   // All irreversible journal writes happen before the one and only attempt.
   const acknowledged=await send(signedBase64,signature,p.operation,minimumSlot);
   return Object.freeze({closeId:p.closeId,reviewId,operation:p.operation,walletAddress:key,signature,state:'UNCERTAIN',acknowledged,readyForRetry:false});
  }finally{running.delete(key);}
 }
 async function recover(account,wallet,closeId,reviewId=null){parent(account,wallet,closeId);if(reviewId!==null)identifier(reviewId);
  await reconcilePendingPerpsExitCancellations(journal,wallet,{request:rpcRequest,now});
  await reconcileRecordedPerpsCloses(journal,wallet,{request:rpcRequest,readFinalizedAccount,now,monotonicNow});return status(account,wallet,closeId,reviewId);}
 function status(account,wallet,closeId,reviewId=null){const row=parent(account,wallet,closeId),e=journal.readPositionCloseExecution(closeId),c=journal.readPositionCloseConversion(closeId),completion=journal.readPositionCloseCompletion(closeId);
  let phase=row.state==='COMPLETED'?'COMPLETED':!e||e.state==='SIGNING'?'RECONCILIATION_REQUIRED':e.state==='UNCERTAIN'?'AWAITING_FIRST_LEG':c?.state==='SIGNING'?'RECONCILIATION_REQUIRED':c?.state==='UNCERTAIN'?'AWAITING_CONVERSION':'READY_FOR_NEXT_REVIEW';
  if(phase==='READY_FOR_NEXT_REVIEW'&&!JSON.parse(e.payout_json).requiresConversion)phase='ACCOUNTING_REQUIRED';
  if(c?.state==='FINALIZED'&&row.state!=='COMPLETED')phase='CONVERSION_FINALIZED';
  let cancellation=null;if(reviewId!==null){const value=journal.readExitCancellation('wx:'+account+':'+reviewId);if(value&&value.wallet===wallet&&JSON.parse(row.entries).some(entry=>entry.reservation===value.reservation))cancellation={reviewId,signature:value.signature,state:value.state};}
  return {closeId,walletAddress:wallet,positionAddress:row.position,phase,firstLegSignature:e?.signature??null,conversionSignature:c?.signature??null,
   receivedTokenUnits:e?.payout_json?JSON.parse(e.payout_json).receivedTokenUnits:null,receivedUsdcUnits:completion?.record_json?JSON.parse(completion.record_json).receivedUsdcUnits:null,cancellation,readyForRetry:false};}
 function list(account,wallet){identity(account,wallet);return journal.pendingPositionCloses(wallet).filter(row=>row.id.startsWith('wc:'+account+':')).slice(0,10).map(row=>status(account,wallet,row.id));}
 return Object.freeze({prepareClose,prepareNext,submit,recover,list});
}
