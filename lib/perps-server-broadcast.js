// One attempt only. HTTP acknowledgement is NOT chain confirmation. The exact
// identity is durably UNCERTAIN before fetch; all failures require read-only
// reconciliation, never a replacement order or an automatic retry.
import {readOwnerSignedServerPerpsEnvelope} from './perps-server-signed-envelope.js';
import {requireFreshServerPerpsDailyAccount} from './perps-server-daily-account.js';
import {validateAutomationSettings} from './automation-panel.js';
const ENDPOINT='https://perps-api.jup.ag/v2/transaction/execute';
function fail(){throw Error('PERPS_BROADCAST_NOT_AUTHORIZED');}
function settings(value){return JSON.stringify(validateAutomationSettings(value));}
export function createServerPerpsBroadcaster({journal,controls,readAccount,fetchImpl}={}){
 // There is no implicit live transport: only the configured server coordinator
 // can inject it. Tests inject an in-memory transport, never the real endpoint.
 if(typeof journal?.read!=='function'||typeof journal?.revalidateSigning!=='function'||typeof journal?.recordBroadcastIntent!=='function'
  ||typeof controls?.read!=='function'||typeof readAccount!=='function'||typeof fetchImpl!=='function')fail();
 return async function submit(signed,{ownerAccountHash,controlRevision}={}){
  if(typeof ownerAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(ownerAccountHash))fail();
  const {evidence}=readOwnerSignedServerPerpsEnvelope(signed,{journal}),walletAddress=signed.walletAddress;
  const expected=settings(evidence.settings);
  function check(){
   const envelope=readOwnerSignedServerPerpsEnvelope(signed,{journal}),current=controls.read({ownerAccountHash,walletAddress});
   if(current.walletAddress!==walletAddress||current.revision!==controlRevision||current.enabled!==true||current.paused!==false||settings(current.settings)!==expected)fail();
   return envelope;
  }
  check();const account=await readAccount({walletAddress,ownerAccountHash,minimumSlot:evidence.observedSlot});
  requireFreshServerPerpsDailyAccount(account,{walletAddress,minimumSlot:evidence.observedSlot,journal});
  const envelope=check(),limits={capitalUsd:String(evidence.settings.capital),dailyLossUsd:String(evidence.settings.loss),positions:evidence.settings.positions,dailyTrades:evidence.settings.dailyTrades};
  journal.revalidateSigning(signed.reservationId,{limits,snapshot:account});
  check();
  // Failure to persist stops here; the transport is never called. A second
  // concurrent submit cannot pass the private SIGNING-bound envelope check.
  journal.recordBroadcastIntent(signed.reservationId,{wireHash:signed.wireHash,signature:signed.signature});
  const row=journal.read(signed.reservationId);
  if(row?.state!=='UNCERTAIN'||row.wallet!==walletAddress||row.signal!==signed.signalId||row.signature!==signed.signature||row.wire_hash!==signed.wireHash)fail();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let reader;
  let acknowledged=false;
  try{
   const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({action:'increase-position',serializedTxBase64:envelope.signedBase64})});
   if(response?.status!==200||response.redirected||!response.body||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error();
   const length=response.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||Number(length)>4096))throw Error();
   reader=response.body.getReader();const parts=[];let size=0;
   while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)throw Error();parts.push(Buffer.from(chunk.value));}
   if(controller.signal.aborted)throw Error();const result=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
   acknowledged=result?.action==='increase-position'&&result.txid===signed.signature;
  }catch{ /* A timeout, error or malformed response never frees reserved funds. */ }
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
  return Object.freeze({stage:acknowledged?'BROADCAST_ACKNOWLEDGED':'BROADCAST_UNKNOWN',walletAddress,reservationId:signed.reservationId,signature:signed.signature,
   state:'UNCERTAIN',requiresChainReconciliation:true,readyForRetry:false});
 };
}
