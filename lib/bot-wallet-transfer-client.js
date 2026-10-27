import {PERPS_CONTROL_ORIGIN,readExistingPerpsControlSession} from './perps-control-client.js';
const HEX=/^[a-f0-9]{64}$/,KEY=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const fail=code=>{throw Error(code||'transfer-unavailable');};
export function createBotWalletTransferClient({fetchImpl=fetch,readSessionToken=readExistingPerpsControlSession,now=Date.now}={}){
 const proofs=new WeakMap();
 function session(){const value=readSessionToken();if(!HEX.test(value||''))fail('session-missing');return value;}
 async function request(body){const token=session(),r=await fetchImpl(PERPS_CONTROL_ORIGIN+'/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)});
  if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))fail();const text=await r.text();if(text.length>16384)fail();const v=JSON.parse(text);if(session()!==token)fail('session-changed');
  if(!r.ok)fail(/^[a-z-]{1,80}$/.test(v?.error?.code||'')?v.error.code:'transfer-unavailable');if(v?.ok!==true||Object.keys(v).sort().join(',')!=='botSwap,ok')fail();return {value:v.botSwap,token};
 }
 function operation(v,wallet,id){if(v?.walletAddress!==wallet||!HEX.test(v.id||'')||id&&v.id!==id||!['SIGNING','UNKNOWN','FINALIZED','FAILED','ABORTED'].includes(v.state)||v.readyForRetry!==false)fail();return Object.freeze({...v});}
 return Object.freeze({
  async status(walletAddress){const {value}=await request({action:'botTransferStatus',walletAddress});if(value?.stage!=='EXCLUSIVE_BOT_WALLET_OPERATIONS'||value.walletAddress!==walletAddress||typeof value.swapAvailable!=='boolean'||!Array.isArray(value.operations)||value.operations.length>20)fail();return {...value,operations:value.operations.map(v=>operation(v,walletAddress))};},
  async prepare(walletAddress,recipient,mint,amount){const {value:v,token}=await request({action:'botTransferPrepare',walletAddress,recipient,mint,amount});
   if(v?.stage!=='BOT_TRANSFER_REVIEW'||v.walletAddress!==walletAddress||v.recipient!==recipient||v.mint!==mint||!KEY.test(recipient)||!HEX.test(v.id||'')||v.submitted!==false||!Number.isInteger(v.decimals)||v.decimals<0||v.decimals>18||!Number.isSafeInteger(v.expiresAt)||v.expiresAt<=now()||v.expiresAt>now()+61000)fail();
   for(const k of ['inputUnits','networkFeeLamports','accountRentLamports'])if(typeof v[k]!=='string'||! /^(0|[1-9][0-9]{0,19})$/.test(v[k]))fail();if(BigInt(v.inputUnits)===0n)fail();
   const review=Object.freeze({...v});proofs.set(review,{token,used:false});return review;
  },
  async confirm(review,approval){const p=proofs.get(review);if(!p||p.used||p.token!==session()||approval!==true||now()>=review.expiresAt)fail('transfer-review-expired');p.used=true;
   return operation((await request({action:'botTransferConfirm',walletAddress:review.walletAddress,id:review.id,explicitApproval:true})).value,review.walletAddress,review.id);
  },
  async recover(walletAddress,id){if(!HEX.test(id||''))fail();return operation((await request({action:'botTransferRecover',walletAddress,id})).value,walletAddress,id);}
 });
}
