import {PERPS_CONTROL_ORIGIN,readExistingPerpsControlSession} from './perps-control-client.js';
import {perpsNavigationDraft} from './perps-navigation.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createBotManualPerpsClient({fetchImpl=fetch,readSessionToken=()=>readExistingPerpsControlSession(),now=Date.now}={}){
 const proofs=new WeakMap(),closeProofs=new WeakMap();
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
  async prepare(wallet,draft){
   draft=perpsNavigationDraft(draft);const {value,token}=await request('botManualPrepare',wallet,{draft});
   if(value.stage!=='BOT_MANUAL_REVIEW'||!/^[-a-f0-9]{36}$/.test(value.id)||value.submitted!==false||!Number.isSafeInteger(value.expiresAt)
    ||value.expiresAt<=now()||value.expiresAt>now()+16000||JSON.stringify(value.draft)!==JSON.stringify(draft)
    ||value.fee?.basisPoints!==20||value.fee?.token!=='USDC'||value.fee?.networkFeeToken!=='SOL')fail('bot-manual-review-required');
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
  async positions(wallet){return (await request('botManualPositions',wallet)).value;},
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
