// Manual/server close preparation only. No custody key, signing, execution,
// activation, durable journal mutation, retry or submission endpoint exists here.
import bs58 from 'bs58';
import {readServerPerpsAccount} from './perps-server-account.js';
import {planServerPerpsFullClose,requireFreshServerPerpsFullClosePlan} from './perps-server-close-intent.js';
import {decodeServerPerpsEnvelope} from './perps-server-envelope.js';
import {inspectServerPerpsFullClosePreparation} from './perps-server-close-bindings.js';
import {simulateServerPerpsFullCloseEffects} from './perps-server-close-simulation.js';
import {checkServerPerpsFullCloseFunding} from './perps-server-close-funding.js';
import {checkServerPerpsFullCloseInstructionPolicy} from './perps-server-close-policy.js';
import {readServerPerpsCloseOracles} from './perps-close-oracle-context.js';
import {checkServerPerpsFullCloseVaults} from './perps-server-close-vaults.js';
import {checkServerPerpsFullCloseReserves} from './perps-server-close-reserves.js';
import {checkServerPerpsFullCloseOracleEffects} from './perps-server-close-oracle-effects.js';
const URL='https://perps-api.jup.ag/v1/positions/decrease';
function fail(){throw Error('PERPS_CLOSE_PREPARATION_UNAVAILABLE');}
function key(value){try{if(typeof value!=='string'||bs58.decode(value).length!==32||bs58.encode(bs58.decode(value))!==value)fail();return value;}catch{fail();}}
export async function buildUnsignedServerPerpsFullClose(plan,{fetchImpl=globalThis.fetch}={}){
 requireFreshServerPerpsFullClosePlan(plan);if(typeof fetchImpl!=='function')fail();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader;
 try{
  const response=await fetchImpl(URL,{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{'Content-Type':'application/json','Accept':'application/json','x-perps-api-version':'v2'},body:JSON.stringify(plan.body),signal:controller.signal});
  if(!response?.ok||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();
  const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>65536))fail();
  reader=response.body.getReader();const parts=[];let total=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>65536)fail();parts.push(Buffer.from(chunk.value));}
  if(controller.signal.aborted)fail();
  const value=JSON.parse(Buffer.concat(parts,total).toString('utf8'));
  if(value?.positionPubkey!==plan.positionAddress)fail();
  const blockhash=key(value.txMetadata?.blockhash),height=String(value.txMetadata?.lastValidBlockHeight);
  if(!/^[1-9][0-9]{0,19}$/.test(height)||BigInt(height)>18446744073709551615n)fail();
  const envelope=decodeServerPerpsEnvelope(value.serializedTxBase64,plan.walletAddress);
  if(envelope.blockhash!==blockhash)fail();
  requireFreshServerPerpsFullClosePlan(plan);
  // Ignore provider fee/rent/quote assertions: independent chain checks follow.
  return Object.freeze({positionPubkey:plan.positionAddress,serializedTxBase64:value.serializedTxBase64,
   txMetadata:Object.freeze({blockhash,lastValidBlockHeight:height})});
 }catch{fail();}
 finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
}
export async function prepareSimulatedServerPerpsFullClose(input,{request,fetchImpl=globalThis.fetch,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(typeof request!=='function'||typeof now!=='function'||typeof monotonicNow!=='function')fail();
 input=structuredClone(input);
 const at=now();if(!Number.isSafeInteger(at)||at<30000)fail();
 const account=await readServerPerpsAccount({walletAddress:input.walletAddress,minimumSlot:input.minimumSlot??0},{request,now,monotonicNow});
 const plan=planServerPerpsFullClose(account,input);
 const preparation=await buildUnsignedServerPerpsFullClose(plan,{fetchImpl});
 const current=now();if(!Number.isSafeInteger(current)||current<at)fail();
 const inspection=await inspectServerPerpsFullClosePreparation(preparation,plan,{request,nowSeconds:Math.floor(current/1000)});
 const oracleContext=await readServerPerpsCloseOracles(inspection,{request});
 const policy=checkServerPerpsFullCloseInstructionPolicy(inspection,{oracleContext});
 const simulation=await simulateServerPerpsFullCloseEffects(inspection,{request,monotonicNow,oracleContext,minimumSlot:oracleContext.observedSlot});
 const funding=await checkServerPerpsFullCloseFunding(simulation,{request,monotonicNow});
 const vaults=await checkServerPerpsFullCloseVaults(funding,policy);
 const reserves=checkServerPerpsFullCloseReserves(vaults);
 const oracleEffects=checkServerPerpsFullCloseOracleEffects(reserves,{nowSeconds:Math.floor(now()/1000)});
 requireFreshServerPerpsFullClosePlan(plan);
 return Object.freeze({stage:'FULL_CLOSE_SIMULATED_WALLET_ONLY',readyForSigning:false,tradingEnabled:false,
  plan,preparation,inspection,oracleContext,policy,simulation,funding,vaults,reserves,oracleEffects,requiresFullInstructionAndProtocolEffectsPolicy:true,
  requiresIndependentMinimumReturn:true,requiresDurableCloseAccounting:true,requiresNativeReviewAndConfirmation:true});
}
