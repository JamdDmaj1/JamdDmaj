import {PERPS_CONTROL_ORIGIN,readExistingPerpsControlSession} from './perps-control-client.js';
import {perpsNavigationDraft} from './perps-navigation.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createBotManualPerpsClient({fetchImpl=fetch,readSessionToken=()=>readExistingPerpsControlSession(),now=Date.now}={}){
 const proofs=new WeakMap(),closeProofs=new WeakMap(),recoveryProofs=new WeakMap();
 const session=()=>{const token=readSessionToken();if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('session-missing');return token;};
 async function request(action,walletAddress,fields={}){
  const token=session(),response=await fetchImpl(PERPS_CONTROL_ORIGIN+'/v1/automation',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action,walletAddress,...fields}),signal:AbortSignal.timeout(25000)});
  if(response.redirected||!response.headers.get('content-type')?.includes('application/json')||!response.body)fail('bot-manual-unavailable');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384)fail('bot-manual-unavailable');chunks.push(value);}}finally{void reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(session()!==token)fail('session-changed');
  if(!response.ok)fail(/^[a-z-]{1,100}$/.test(data?.error?.code)?data.error.code:'bot-manual-unavailable');
  if(data?.ok!==true||data.botManual?.walletAddress!==walletAddress)fail('bot-manual-unavailable');
  return {value:data.botManual,token};
 }
 return Object.freeze({
  async status(wallet){return (await request('botManualStatus',wallet)).value;},
  async prepare(wallet,draft,{entryReservationId}={}){
   if(entryReservationId!==undefined&&(typeof entryReservationId!=='string'||!/^[-a-f0-9]{36}$/.test(entryReservationId)))fail('bot-manual-review-required');
   draft=perpsNavigationDraft(draft);const {value,token}=await request('botManualPrepare',wallet,{draft,...(entryReservationId===undefined?{}:{entryReservationId})});
   const conversion=value.stage==='BOT_MANUAL_ENTRY_CONVERSION_REVIEW';
   if(!['BOT_MANUAL_REVIEW','BOT_MANUAL_ENTRY_CONVERSION_REVIEW'].includes(value.stage)||!/^[-a-f0-9]{36}$/.test(value.id)||value.submitted!==false||!Number.isSafeInteger(value.expiresAt)
    ||value.expiresAt<=now()||value.expiresAt>now()+16000||JSON.stringify(value.draft)!==JSON.stringify(draft)
    ||value.fee?.basisPoints!==20||value.fee?.token!=='USDC'||value.fee?.networkFeeToken!=='SOL')fail('bot-manual-review-required');
   if(conversion&&(draft.side!=='LONG'||entryReservationId!==undefined||value.maxSlippageBps!==50
    ||value.requiresSeparateOpeningConfirmation!==true||typeof value.minimumCollateralUnits!=='string'||! /^[1-9][0-9]{0,19}$/.test(value.minimumCollateralUnits)
    ||typeof value.collateralMint!=='string'||! /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.collateralMint)))fail('bot-manual-review-required');
   if(entryReservationId!==undefined&&(draft.side!=='LONG'||value.entryReservationId!==entryReservationId))fail('bot-manual-review-required');
   if(entryReservationId===undefined&&value.entryReservationId!==undefined)fail('bot-manual-review-required');
   for(const key of ['marginUsdcUnits','networkFeeLamports','rentLockedLamports'])if(typeof value[key]!=='string'||!/^\d{1,20}$/.test(value[key]))fail('bot-manual-review-required');
   const expectedFee=quotePerpsPlatformFee(value.marginUsdcUnits);
   for(const key of Object.keys(expectedFee))if(value.fee[key]!==expectedFee[key])fail('bot-manual-review-required');
   const review=Object.freeze(value);proofs.set(review,{token,used:false});return review;
  },
  async confirm(review,approval,feeApproval){
   const proof=proofs.get(review);if(!proof||proof.used||proof.token!==session()||approval!==true||feeApproval!==true||now()>=review.expiresAt)fail('bot-manual-review-required');
   proof.used=true;return (await request('botManualConfirm',review.walletAddress,{id:review.id,explicitApproval:true,explicitFeeApproval:true,feeTermsVersion:review.fee.version})).value;
  },
  async recover(wallet,id){return (await request('botManualRecover',wallet,{id})).value;},
  async prepareRecovery(wallet,reservationId){
   if(typeof reservationId!=='string'||!/^[-a-f0-9]{36}$/.test(reservationId))fail('bot-manual-review-required');
   const {value,token}=await request('botManualRecoveryPrepare',wallet,{id:reservationId});
   if(value.stage!=='BOT_MANUAL_ENTRY_RECOVERY_REVIEW'||value.reservationId!==reservationId||!/^[-a-f0-9]{36}$/.test(value.id)
    ||value.submitted!==false||value.maxSlippageBps!==50||value.platformFeeUsdcUnits!=='0'||value.requiresExplicitRecoveryConfirmation!==true
    ||!['BTC','ETH','SOL'].includes(value.asset)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+10000)fail('bot-manual-review-required');
   for(const key of ['amountUnits','minimumUsdcUnits'])if(typeof value[key]!=='string'||! /^[1-9][0-9]{0,19}$/.test(value[key])||BigInt(value[key])>18446744073709551615n)fail('bot-manual-review-required');
   for(const key of ['networkFeeLamports','rentLockedLamports'])if(typeof value[key]!=='string'||! /^(0|[1-9][0-9]{0,19})$/.test(value[key]))fail('bot-manual-review-required');
   const review=Object.freeze(value);recoveryProofs.set(review,{token,used:false});return review;
  },
  async confirmRecovery(review,explicitApproval){
   const proof=recoveryProofs.get(review);if(!proof||proof.used||proof.token!==session()||explicitApproval!==true||now()>=review.expiresAt)fail('bot-manual-review-required');
   proof.used=true;return (await request('botManualRecoveryConfirm',review.walletAddress,{id:review.id,explicitApproval:true})).value;
  },
  async recoverRecovery(wallet,reservationId){return (await request('botManualRecoveryRecover',wallet,{id:reservationId})).value;},
  async positions(wallet){return (await request('botManualPositions',wallet)).value;},
  async history(wallet){
   const {value}=await request('botManualHistory',wallet),units=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=18446744073709551615n;
   if(value.stage!=='BOT_MANUAL_CLOSED_HISTORY'||!Array.isArray(value.items)||value.items.length>50||typeof value.hasMore!=='boolean')fail('bot-manual-history-unavailable');
   const ids=new Set();for(const item of value.items){
      if(!item||!/^manual-close:[-a-f0-9]{36}$/.test(item.id)||ids.has(item.id)||typeof item.positionAddress!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(item.positionAddress)||!['BTC','ETH','SOL'].includes(item.asset)||!['LONG','SHORT'].includes(item.side)
     ||!['COMPLETED','CLOSED_PENDING_ACCOUNTING'].includes(item.state)||!Number.isSafeInteger(item.openedAt)||item.openedAt<0||!Number.isSafeInteger(item.closedAt)||item.closedAt<item.openedAt||item.closedAt>now()+2000
     ||!units(item.firstLegNetworkFeeLamports)||(item.receivedUsdcUnits!==null&&!units(item.receivedUsdcUnits))||item.netPnlUsdcUnits!==null
     ||typeof item.firstLegSignature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(item.firstLegSignature)
     ||item.conversionSignature!==null&&(typeof item.conversionSignature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(item.conversionSignature)))fail('bot-manual-history-unavailable');
    ids.add(item.id);
   }return value;
  },
  async prepareClose(wallet,positionAddress,referencePrice){
   const {value,token}=await request('botManualClosePrepare',wallet,{positionAddress,referencePrice});
   if(value.stage!=='BOT_MANUAL_CLOSE_REVIEW'||value.positionAddress!==positionAddress||value.referencePrice!==referencePrice
    ||value.protection?.settlementProtection!=='NATIVE_PRICE_THEN_USDC_MINIMUM'||value.protection.firstLegAbsoluteMinimum!==null
    ||value.protection.estimatesAreGuaranteed!==false||value.submitted!==false||!/^manual-close:[-a-f0-9]{36}$/.test(value.id)
    ||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+16000)fail('bot-manual-review-required');
   const review=Object.freeze(value);closeProofs.set(review,{token,used:false});return review;
  },
  async confirmClose(review,explicitApproval){
   const proof=closeProofs.get(review);if(!proof||proof.used||proof.token!==session()||explicitApproval!==true||now()>=review.expiresAt)fail('bot-manual-review-required');proof.used=true;
   return (await request('botManualCloseConfirm',review.walletAddress,{id:review.id,explicitApproval:true})).value;
  },
  async recoverClose(wallet,id){return (await request('botManualCloseRecover',wallet,{id})).value;}
 });
}
