// Existing JamdDmaj session + wallet, not a new exchange login or wallet signer.
import bs58 from 'bs58';
import {PERPS_CONTROL_ORIGIN,readExistingPerpsControlSession} from './perps-control-client.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const units=v=>typeof v==='string'&&/^(0|[1-9]\d{0,19})$/.test(v)&&BigInt(v)<=18446744073709551615n;
function key(v,length=32){try{if(typeof v!=='string'||v.length>88)return false;const b=bs58.decode(v);return b.length===length&&!b.every(n=>n===0)&&bs58.encode(b)===v;}catch{return false;}}
const states=['HELD','OPEN','SETTLING','RECOVERY_REQUIRED','ABORTED','PAYOUT_PENDING','CANONICAL_READY','COMPLETE'];
export function createPhoenixManualClient({fetchImpl=fetch,readSessionToken=()=>readExistingPerpsControlSession(),now=Date.now}={}){
 const reviews=new WeakMap();
 const session=()=>{const token=readSessionToken();if(!hex(token))fail('session-missing');return token;};
 async function request(action,walletAddress,fields={}){
  if(!key(walletAddress))fail('phoenix-invalid-wallet');const token=session();
  const response=await fetchImpl(PERPS_CONTROL_ORIGIN+'/v1/automation',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action,walletAddress,...fields}),signal:AbortSignal.timeout(25000)});
  if(response.redirected||!response.headers.get('content-type')?.includes('application/json')||!response.body)fail('phoenix-unavailable');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>131072)fail('phoenix-unavailable');chunks.push(chunk.value);}}finally{void reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let cursor=0;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(session()!==token)fail('session-changed');
  if(!response.ok)fail(/^[a-z0-9-]{1,100}$/.test(body?.error?.code)?body.error.code:'phoenix-unavailable');
  if(body?.ok!==true||body.phoenix?.walletAddress!==walletAddress||body.phoenix.venue!=='phoenix')fail('phoenix-unavailable');
  return {value:body.phoenix,token};
 }
 function operation(v,workflowId){
  if(v.stage!=='PHOENIX_MANUAL_OPERATION'||!hex(workflowId)||v.workflowId!==workflowId||!states.includes(v.state)||v.readyForRetry!==false||
     v.walletCredited!==(v.state==='COMPLETE')||typeof v.submitted!=='boolean'||typeof v.requiresPolling!=='boolean'||
     v.submitted!==(v.signature!==null)||!['PREPARED','SIGNED','UNKNOWN','FINALIZED','CANCELLED',null].includes(v.attemptState)||v.attemptId!==null&&!hex(v.attemptId)||
     !['OPEN','CLOSE','WITHDRAW','UNWRAP','FEE',null].includes(v.phase)||v.signature!==null&&!key(v.signature,64))fail('phoenix-status-unverified');return v;
 }
 function parentOperation(v,id){
  if(v.stage!=='PHOENIX_PARENT_OPERATION'||v.id!==id||!hex(id)||!key(v.parentAddress)||!['PREPARED','SIGNED','UNKNOWN','CANCELLED','FINALIZED'].includes(v.state)||v.mayRetry!==false||
     v.requiresPolling!==(v.state==='UNKNOWN')||v.requiresOperatorReview!==(v.state==='SIGNED')||typeof v.registered!=='boolean'||typeof v.requiresNewReview!=='boolean'||
     v.registered&&v.state!=='FINALIZED'||v.requiresNewReview!==(v.state==='CANCELLED'||v.state==='FINALIZED'&&!v.registered)||
     Object.hasOwn(v,'providerAcknowledged')&&typeof v.providerAcknowledged!=='boolean')fail('phoenix-status-unverified');
  if(['PREPARED','CANCELLED'].includes(v.state)?v.signature!==null:!key(v.signature,64))fail('phoenix-status-unverified');
  return v;
 }
 return Object.freeze({
  async parentStatus(wallet){const {value}=await request('phoenixParentStatus',wallet);
   if(value.stage!=='PHOENIX_PARENT_STATUS'||typeof value.available!=='boolean'||value.authorizesTrading!==false||!Array.isArray(value.operations)||value.operations.length>1)fail('phoenix-status-unverified');
   for(const p of value.operations){if(p.walletAddress!==wallet||p.venue!=='phoenix')fail('phoenix-status-unverified');parentOperation(p,p.id);}return value;
  },
  async prepareParent(wallet,symbol){if(typeof symbol!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(symbol))fail('phoenix-review-required');
   const {value,token}=await request('phoenixParentPrepare',wallet,{symbol});
   if(value.stage!=='PHOENIX_PARENT_REVIEW'||!hex(value.id)||!key(value.parentAddress)||value.maxPositions!==32||value.networkFeeLamports!=='10000'||
      !units(value.rentLockedLamports)||value.rentLockedLamports==='0'||!units(value.maximumLamports)||BigInt(value.maximumLamports)!==10000n+BigInt(value.rentLockedLamports)||
      BigInt(value.maximumLamports)>100000000n||value.requiresProtocolCosignature!==true||value.authorizesTrading!==false||value.submitted!==false||value.authorizationDurationMs!==300000||
      !Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+16000)fail('phoenix-review-required');
   const review=Object.freeze(value);reviews.set(review,{token,used:false,parent:true});return review;
  },
  async confirmParent(review,explicitApproval){const p=reviews.get(review);
   if(!p?.parent||p.used||p.token!==session()||explicitApproval!==true||review.expiresAt<=now())fail('phoenix-review-required');
   p.used=true;return parentOperation((await request('phoenixParentConfirm',review.walletAddress,{id:review.id,explicitApproval:true})).value,review.id);
  },
  async recoverParent(wallet,id){if(!hex(id))fail('phoenix-review-required');return parentOperation((await request('phoenixParentRecover',wallet,{id})).value,id);},
  async prepareEntry(wallet,{symbol,side,marginUsdcUnits,leverageTenths}={}){
   if(typeof symbol!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(symbol)||!['LONG','SHORT'].includes(side)||!units(marginUsdcUnits)||
      !Number.isInteger(leverageTenths)||leverageTenths<11||leverageTenths>500)fail('phoenix-review-required');
   const terms=quotePerpsPlatformFee(marginUsdcUnits),{value,token}=await request('phoenixEntryPrepare',wallet,{symbol,side,marginUsdcUnits,leverageTenths});
   if(value.stage!=='PHOENIX_MANUAL_ENTRY_REVIEW'||!hex(value.id)||!hex(value.workflowId)||value.symbol!==symbol||value.side!==side||value.marginUsdcUnits!==marginUsdcUnits||
      value.leverageTenths!==leverageTenths||value.submitted!==false||value.maxSlippageBps!==50||value.withdrawalMayQueue!==true||
      value.platformFeeUsdcUnits!==terms.feeUnits||value.platformFeeTermsVersion!==terms.version||value.platformFeeRecipient!==terms.recipient||
      value.maximumFeeNetworkLamports!=='10000'||value.authorizationDurationMs!==300000||!units(value.maximumNetworkAndRentLamports)||
      BigInt(value.maximumNetworkAndRentLamports)<10000n||BigInt(value.maximumNetworkAndRentLamports)>50000000n||!units(value.protocolFeeUsdcUnits)||
      !units(value.baseLots)||value.baseLots==='0'||!Number.isInteger(value.maximumProtocolTakerFeeMicro)||value.maximumProtocolTakerFeeMicro<0||value.maximumProtocolTakerFeeMicro>10000||
      !Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+16000||
      !['referencePrice','priceLimitUsd'].every(k=>typeof value[k]==='string'&&/^(0|[1-9]\d{0,18})(\.\d{1,18})?$/.test(value[k])))fail('phoenix-review-required');
   const review=Object.freeze(value);reviews.set(review,{token,used:false,entry:true});return review;
  },
  async confirmEntry(review,explicitApproval){const p=reviews.get(review);
   if(!p?.entry||p.used||p.token!==session()||explicitApproval!==true||review.expiresAt<=now())fail('phoenix-review-required');
   p.used=true;return operation((await request('phoenixEntryConfirm',review.walletAddress,{id:review.id,explicitApproval:true})).value,review.workflowId);
  },
  async recoverEntry(wallet,workflowId){if(!hex(workflowId))fail('phoenix-review-required');return operation((await request('phoenixEntryRecover',wallet,{workflowId})).value,workflowId);},
  async status(wallet){const {value}=await request('phoenixStatus',wallet);
   if(value.stage!=='PHOENIX_MANUAL_STATUS'||value.entryAvailable!==false||value.entryReason!=='PHOENIX_RELEASE_GATES_PENDING'||typeof value.closeAvailable!=='boolean'||!Array.isArray(value.operations)||value.operations.length>256)fail('phoenix-status-unverified');
   for(const o of value.operations){if(o.walletAddress!==wallet||o.venue!=='phoenix')fail('phoenix-status-unverified');operation(o,o.workflowId);}return value;},
  async prepareClose(wallet,workflowId){
   if(!hex(workflowId))fail('phoenix-review-required');const {value,token}=await request('phoenixClosePrepare',wallet,{workflowId});
   if(value.stage!=='PHOENIX_MANUAL_CLOSE_REVIEW'||value.workflowId!==workflowId||!hex(value.id)||value.submitted!==false||value.maxSlippageBps!==50||value.closePercent!==100||
      value.returnsToUsdc!==true||value.withdrawalMayQueue!==true||value.platformCloseFeeUnits!=='0'||value.authorizationDurationMs!==300000||
      value.estimatesAreGuaranteed!==false||!Number.isInteger(value.maximumProtocolTakerFeeMicro)||value.maximumProtocolTakerFeeMicro<0||value.maximumProtocolTakerFeeMicro>10000||
      !Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+16000||!['LONG','SHORT'].includes(value.side)||
      typeof value.referencePrice!=='string'||!/^(0|[1-9]\d{0,12})(\.\d{1,18})?$/.test(value.referencePrice)||typeof value.priceLimitUsd!=='string'||
      !/^(0|[1-9]\d{0,18})(\.\d{1,18})?$/.test(value.priceLimitUsd)||!units(value.baseLots)||value.baseLots==='0'||
      !['networkFeeLamports','maximumNetworkAndRentLamports','protocolCloseFeeUsdcUnits','estimatedReceivedCollateralUnits'].every(k=>units(value[k]))||
      BigInt(value.maximumNetworkAndRentLamports)<BigInt(value.networkFeeLamports)||BigInt(value.maximumNetworkAndRentLamports)>50000000n)fail('phoenix-review-required');
   const review=Object.freeze(value);reviews.set(review,{token,used:false});return review;
  },
  async confirmClose(review,explicitApproval){
   const p=reviews.get(review);if(!p||p.entry||p.parent||p.used||p.token!==session()||explicitApproval!==true||review.expiresAt<=now())fail('phoenix-review-required');
   p.used=true;const {value}=await request('phoenixCloseConfirm',review.walletAddress,{id:review.id,explicitApproval:true});return operation(value,review.workflowId);
  },
  async recoverClose(wallet,workflowId){if(!hex(workflowId))fail('phoenix-review-required');return operation((await request('phoenixCloseRecover',wallet,{workflowId})).value,workflowId);},
  async positions(wallet){const {value}=await request('phoenixPositions',wallet);
   if(value.stage!=='PHOENIX_MANUAL_POSITIONS'||!units(value.cashUsdcUnits)||!Number.isSafeInteger(value.observedSlot)||value.observedSlot<1||!Array.isArray(value.items)||value.items.length>32)fail('phoenix-status-unverified');
   for(const p of value.items)if(!hex(p.workflowId)||typeof p.symbol!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(p.symbol)||!Number.isInteger(p.subaccountIndex)||p.subaccountIndex<1||p.subaccountIndex>255)fail('phoenix-status-unverified');return value;
  },
  async history(wallet){const {value}=await request('phoenixHistory',wallet);
   if(value.stage!=='PHOENIX_MANUAL_HISTORY'||!Array.isArray(value.items)||value.items.length>50)fail('phoenix-status-unverified');
   for(const item of value.items)if(!hex(item.workflowId)||item.state!=='COMPLETE'||!units(item.marginUsdcUnits)||item.receivedUsdcUnits!==null&&!units(item.receivedUsdcUnits)||
    item.netPnlUsdcUnits!==null||item.platformFeeStatus!=='NOT_YET_COMPOSED'||!Number.isSafeInteger(item.openedAt)||!Number.isSafeInteger(item.closedAt)||item.closedAt<item.openedAt||item.closedAt>now()+2000||
    item.signature!==null&&!key(item.signature,64))fail('phoenix-status-unverified');return value;
  }
 });
}
