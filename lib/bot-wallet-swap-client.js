import {PERPS_CONTROL_ORIGIN,readExistingPerpsControlSession} from './perps-control-client.js';
const HEX=/^[a-f0-9]{64}$/,U=/^(0|[1-9][0-9]{0,19})$/;
function fail(code='bot-swap-unavailable'){throw Object.assign(Error(code),{code});}
function units(value){if(typeof value!=='string'||!U.test(value)||BigInt(value)>18446744073709551615n)fail();return value;}
export function createBotWalletSwapClient({fetchImpl=fetch,readSessionToken=()=>readExistingPerpsControlSession(),now=Date.now}={}){
 const reviews=new WeakMap();
 function session(){const token=readSessionToken();if(typeof token!=='string'||!HEX.test(token))fail('session-missing');return token;}
 async function request(body){
  const token=session(),response=await fetchImpl(PERPS_CONTROL_ORIGIN+'/v1/automation',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(response.redirected||!response.headers.get('content-type')?.toLowerCase().includes('application/json')||!response.body)fail();
  const reader=response.body.getReader(),parts=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384)fail();parts.push(part.value);}}finally{void reader.cancel().catch(()=>{});}
  const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{fail();}
  if(session()!==token)fail('session-changed');
  if(!response.ok){const code=value?.error?.code;fail(typeof code==='string'&&/^[a-z-]{1,80}$/.test(code)?code:'bot-swap-unavailable');}
  if(value?.ok!==true||Object.keys(value).sort().join(',')!=='botSwap,ok')fail();return {value:value.botSwap,token};
 }
 function operation(value,wallet){
  if(value?.walletAddress!==wallet||!HEX.test(value.id)||!['SIGNING','UNKNOWN','FINALIZED','FAILED','ABORTED'].includes(value.state)||value.readyForRetry!==false
   ||value.signature!==null&&(typeof value.signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value.signature)))fail();
  return Object.freeze({id:value.id,walletAddress:wallet,operation:value.operation==='TRANSFER'?'TRANSFER':'SWAP',state:value.state,signature:value.signature,readyForRetry:false});
 }
 return Object.freeze({
  async status(walletAddress){const {value}=await request({action:'botSwapStatus',walletAddress});
   if(value?.stage!=='EXCLUSIVE_BOT_WALLET_OPERATIONS'||value.walletAddress!==walletAddress||typeof value.swapAvailable!=='boolean'||typeof value.paused!=='boolean'
    ||!Array.isArray(value.operations)||value.operations.length>20||value.readyForSigning!==false||value.reason!==null&&typeof value.reason!=='string')fail();
   return Object.freeze({...value,operations:Object.freeze(value.operations.map(v=>operation(v,walletAddress)))});
  },
  async prepare(walletAddress,direction,amount){
   const {value,token}=await request({action:'botSwapPrepare',walletAddress,direction,amount});
   if(value?.stage!=='BOT_SWAP_REVIEW'||value.walletAddress!==walletAddress||value.direction!==direction||!HEX.test(value.id)||value.slippageBps!==50||value.submitted!==false
    ||typeof value.controlRevision!=='string'||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now()||value.expiresAt>now()+16000)fail('bot-swap-review-required');
   for(const key of ['inputUnits','minimumOutputUnits','simulatedOutputUnits','networkFeeLamports','accountRentLamports'])units(value[key]);
   if(BigInt(value.inputUnits)===0n||BigInt(value.minimumOutputUnits)===0n)fail();
   const review=Object.freeze({...value});reviews.set(review,{token,used:false});return review;
  },
  async confirm(review,explicitApproval){const proof=reviews.get(review);if(!proof||proof.used||proof.token!==session()||explicitApproval!==true||now()>=review.expiresAt)fail('bot-swap-review-required');proof.used=true;
   const {value}=await request({action:'botSwapConfirm',walletAddress:review.walletAddress,id:review.id,explicitApproval:true});
   const result=operation(value,review.walletAddress);if(result.id!==review.id)fail();return result;
  },
  async recover(walletAddress,id){if(!HEX.test(id))fail();const {value}=await request({action:'botSwapRecover',walletAddress,id});const result=operation(value,walletAddress);if(result.id!==id)fail();return result;}
 });
}
