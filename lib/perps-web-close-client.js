import bs58 from 'bs58';
import {selectedWalletAccount} from './wallet-portfolio-store.js';
import {readWebPerpsWalletSession,requireWebPerpsWalletSigningBinding} from './perps-web-wallet-session.js';
import {validateWebClosePacket,verifyWebCloseSignature} from './perps-web-close-protocol.js';
import {requireWebCloseJournal} from './perps-web-close-journal.js';
import {requireWebPerpsSigningJournal} from './perps-web-signing-journal.js';
const reviews=new WeakMap(),grants=new WeakMap(),signatures=new WeakMap(),recoveries=new WeakMap();
function fail(code='WEB_CLOSE_APPROVAL_UNAVAILABLE'){throw Error(code);}
function selected(doc,wallet){if(selectedWalletAccount(doc)?.source!=='external'||selectedWalletAccount(doc)?.address!==wallet)fail();}
function foreground(doc){if(doc.hidden===true||doc.visibilityState!=='visible'||doc.hasFocus?.()!==true)fail();}
function session(p){selected(p.doc,p.packet.walletAddress);foreground(p.doc);const current=readWebPerpsWalletSession(p.doc);
 if(!current||current.address!==p.packet.walletAddress||!current.transactionVersions.includes(p.version)||p.readSessionToken()!==p.token)fail();
 const elapsed=p.monotonicNow()-p.started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>15000||p.now()>=p.packet.expiresAt||p.now()<p.receivedAt-2000)fail();
}
async function request(fetchImpl,readSessionToken,input){
 const token=readSessionToken();if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('LOGIN_REQUIRED');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let reader;
 try{const response=await fetchImpl('/api/perps-close',{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(input)});
  if(response.redirected||!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail();reader=response.body?.getReader();if(!reader)fail();
  let size=0;const parts=[];while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>12000)fail();parts.push(p.value);}
  if(controller.signal.aborted||readSessionToken()!==token)fail();const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(response.status!==200||value?.ok!==true)fail(['WEB_CLOSE_EXECUTION_DISABLED','WEB_CLOSE_RECONCILIATION_REQUIRED','MANUAL_PERPS_LIMITS_REQUIRED','WEB_CLOSE_UNTRACKED_POSITION'].includes(value?.error)?value.error:'WEB_CLOSE_UNAVAILABLE');return value;
 }finally{clearTimeout(timer);controller.abort();try{await reader?.cancel();}catch{}}
}
function status(value,{wallet,closeId,position=null}){
 if(!value||Object.keys(value).sort().join(',')!=='cancellation,closeId,conversionSignature,firstLegSignature,phase,positionAddress,readyForRetry,receivedTokenUnits,receivedUsdcUnits,walletAddress'
  ||value.walletAddress!==wallet||value.closeId!==closeId||position!==null&&value.positionAddress!==position||value.readyForRetry!==false
  ||!['COMPLETED','RECONCILIATION_REQUIRED','AWAITING_FIRST_LEG','READY_FOR_NEXT_REVIEW','AWAITING_CONVERSION','ACCOUNTING_REQUIRED','CONVERSION_FINALIZED'].includes(value.phase))fail();
 for(const sig of [value.firstLegSignature,value.conversionSignature,value.cancellation?.signature])if(sig!==null&&sig!==undefined&&(typeof sig!=='string'||bs58.decode(sig).length!==64||bs58.encode(bs58.decode(sig))!==sig))fail();return value;
}
export function createWebCloseClient({doc,fetchImpl,readSessionToken,now=Date.now,monotonicNow=()=>performance.now()}={}){
 if(!doc||[fetchImpl,readSessionToken,now,monotonicNow].some(v=>typeof v!=='function'))fail();
 return Object.freeze({
  async prepare(input,{positionAddress=input.positionAddress}={}){
   if(!['prepare','next'].includes(input.action))fail();selected(doc,input.walletAddress);foreground(doc);const connected=readWebPerpsWalletSession(doc);if(!connected||connected.address!==input.walletAddress)fail();
   const token=readSessionToken(),started=monotonicNow(),value=await request(fetchImpl,readSessionToken,input);
   if(Object.keys(value).sort().join(',')!=='ok,packet')fail();const checked=await validateWebClosePacket(value.packet,{walletAddress:input.walletAddress,positionAddress,now:now()});
   if(input.action==='prepare'&&value.packet.operation!=='CLOSE'||input.action==='next'&&(value.packet.closeId!==input.closeId||value.packet.operation==='CLOSE'))fail();
   const result=Object.freeze(structuredClone(value.packet)),proof={packet:structuredClone(value.packet),doc,fetchImpl,readSessionToken,token,now,monotonicNow,started,receivedAt:now(),version:checked.version};session(proof);reviews.set(result,proof);return result;
  },
  async list(wallet){selected(doc,wallet);const value=await request(fetchImpl,readSessionToken,{action:'list',walletAddress:wallet});selected(doc,wallet);
   if(Object.keys(value).sort().join(',')!=='closes,ok'||!Array.isArray(value.closes)||value.closes.length>10)fail();return value.closes.map(v=>status(v,{wallet,closeId:v.closeId}));},
  async recover(wallet,closeId,{journal=null,reviewId=null}={}){
   selected(doc,wallet);const row=journal?await requireWebCloseJournal(journal).read(reviewId):null;
   if(row&&(row.packet.walletAddress!==wallet||row.packet.closeId!==closeId))fail();
   const value=await request(fetchImpl,readSessionToken,{action:'recover',walletAddress:wallet,closeId,reviewId});selected(doc,wallet);
   if(Object.keys(value).sort().join(',')!=='ok,status')fail();const verified=status(value.status,{wallet,closeId,position:row?.packet.positionAddress??null});
   if(row&&['OWNER_SIGNED','UNCERTAIN'].includes(row.state)){
    const proof=Object.freeze({reviewId});recoveries.set(proof,{journal,rowJson:JSON.stringify(row),status:structuredClone(verified),used:false});
    // The journal validates the operation-specific terminal identity. A
    // pending status cannot retire a local signing hold or free shared risk.
    try{await journal.settle(proof);}catch{}
   }return verified;
  }
 });
}
export async function authorizeWebCloseSignature(review,{doc,journal,entryJournal,explicitApproval}={}){
 const p=reviews.get(review);requireWebCloseJournal(journal);requireWebPerpsSigningJournal(entryJournal);if(!p||p.doc!==doc||explicitApproval!==true)fail();session(p);
 if((await journal.pending(p.packet.walletAddress)).length||(await entryJournal.pending(p.packet.walletAddress)).length)fail('WEB_CLOSE_RECONCILIATION_REQUIRED');session(p);
 const claim=await journal.begin(p.packet);session(p);const grant=Object.freeze({reviewId:p.packet.reviewId});grants.set(grant,{p,journal,claim,used:false});return grant;
}
export function consumeWebCloseSignatureAuthorization(grant,doc){
 const value=grants.get(grant);if(!value||value.used||value.p.doc!==doc)fail();value.used=true;session(value.p);
 return Object.freeze({packet:structuredClone(value.p.packet),version:value.p.version,
  async revalidate(){session(value.p);const row=await value.journal.read(value.p.packet.reviewId);if(row?.state!=='SIGNING'||JSON.stringify(row.packet)!==JSON.stringify(value.p.packet))fail();session(value.p);},
  async record(encoded,binding){
   if(requireWebPerpsWalletSigningBinding(binding,doc,{current:false}).address!==value.p.packet.walletAddress)fail();
   verifyWebCloseSignature(value.p.packet,encoded);const row=await value.journal.signed(value.claim,encoded),signed=Object.freeze({reviewId:row.id,signature:row.signature});
   signatures.set(signed,{...value,binding,row,submitted:false});return signed;
  }
 });
}
export async function submitSignedWebClose(signed,{doc,journal}={}){
 const proof=signatures.get(signed);if(!proof||proof.submitted||proof.p.doc!==doc||proof.journal!==journal)fail();proof.submitted=true;session(proof.p);requireWebPerpsWalletSigningBinding(proof.binding,doc);
 const row=await journal.uncertain(signed.reviewId);session(proof.p);requireWebPerpsWalletSigningBinding(proof.binding,doc);
 try{const value=await request(proof.p.fetchImpl,proof.p.readSessionToken,{action:'submit',reviewId:signed.reviewId,signedBase64:row.signedBase64,explicitApproval:true});
  const r=value.result;if(Object.keys(value).sort().join(',')!=='ok,result'||!r||r.reviewId!==signed.reviewId||r.closeId!==proof.p.packet.closeId||r.walletAddress!==proof.p.packet.walletAddress
   ||r.signature!==signed.signature||r.operation!==proof.p.packet.operation||r.state!=='UNCERTAIN'||r.readyForRetry!==false||typeof r.acknowledged!=='boolean')fail();return r;
 }catch{return {closeId:proof.p.packet.closeId,reviewId:signed.reviewId,operation:proof.p.packet.operation,walletAddress:proof.p.packet.walletAddress,signature:signed.signature,state:'UNCERTAIN',acknowledged:false,readyForRetry:false};}
}
export function consumeWebCloseRecoveryProof(proof,journal){const p=recoveries.get(proof);if(!p||p.used||p.journal!==journal)fail();p.used=true;return p;}
