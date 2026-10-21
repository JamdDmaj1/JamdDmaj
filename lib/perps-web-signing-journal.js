// Browser-local crash record. No automatic clearing, retry, send or terminal
// reconciliation exists here. A SIGNING row is held even after wallet rejection.
import {validateWebPerpsSigningPacket,webPerpsReviewBindingText,webPerpsSha256} from './perps-web-review-protocol.js';
import {verifyWebPerpsOwnerSignature} from './perps-web-envelope.js';
const journals=new WeakSet(),claims=new WeakMap();
const rowKeys=['operationId','walletAddress','activeWallet','state','packetJson','recordBinding','createdAt','updatedAt','signature','signedBase64'];
function fail(){throw Error('WEB_PERPS_SIGNING_JOURNAL_UNAVAILABLE');}
function id(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
export function requireWebPerpsSigningJournal(value){if(!journals.has(value))fail();return value;}
export function requireWebPerpsSigningClaim(value,journal){const proof=claims.get(value);if(!proof||proof.journal!==journal)fail();return proof;}
export async function openWebPerpsSigningJournal({indexedDB=globalThis.indexedDB,name='jamddmaj-web-perps-v1',now=Date.now}={}){
 if(typeof indexedDB?.open!=='function'||typeof now!=='function'||typeof name!=='string'||!/^jamddmaj-web-perps-[a-z0-9-]{1,80}$/.test(name))fail();
 let closed=false;
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open(name,1);
  request.onupgradeneeded=()=>{const store=request.result.createObjectStore('operations',{keyPath:'operationId'});store.createIndex('pendingWallet','activeWallet',{unique:true});};
  request.onerror=request.onblocked=()=>reject(Error('WEB_PERPS_SIGNING_JOURNAL_UNAVAILABLE'));
  request.onsuccess=()=>resolve(request.result);
 });
 db.onversionchange=()=>{closed=true;db.close();};
 function schema(){
  if(closed||db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains('operations'))fail();
  const store=db.transaction('operations').objectStore('operations');
  if(store.keyPath!=='operationId'||store.indexNames.length!==1||!store.indexNames.contains('pendingWallet')||store.index('pendingWallet').keyPath!=='activeWallet'||store.index('pendingWallet').unique!==true)fail();
 }
 try{schema();}catch(error){db.close();throw error;}
 const time=()=>{const value=now();if(!Number.isSafeInteger(value)||value<0)fail();return value;};
 function transaction(mode,run){schema();return new Promise((resolve,reject)=>{
  let result,tx;
  try{tx=db.transaction('operations',mode,...(mode==='readwrite'?[{durability:'strict'}]:[]));
   tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(Error('WEB_PERPS_SIGNING_JOURNAL_UNAVAILABLE'));
   run(tx.objectStore('operations'),value=>{result=value;},tx);
  }catch{try{tx?.abort();}catch{}reject(Error('WEB_PERPS_SIGNING_JOURNAL_UNAVAILABLE'));}
 });}
 async function facts(row){
  if(row===undefined)return null;
  if(!row||Object.keys(row).sort().join(',')!==[...rowKeys].sort().join(',')||row.operationId!==id(row.operationId)||row.activeWallet!==row.walletAddress
   ||!['SIGNING','OWNER_SIGNED'].includes(row.state)||!Number.isSafeInteger(row.createdAt)||!Number.isSafeInteger(row.updatedAt)||row.createdAt<0||row.updatedAt<row.createdAt
   ||typeof row.packetJson!=='string'||row.packetJson.length>8192)fail();
  const packet=JSON.parse(row.packetJson);
  if(packet.reviewId!==row.operationId||packet.review.walletAddress!==row.walletAddress||packet.recordBinding!==row.recordBinding||await webPerpsSha256(webPerpsReviewBindingText(packet))!==row.recordBinding)fail();
  // Historical facts only: expiry is NOT reset or promoted to current authority.
  if(row.state==='SIGNING'){if(row.signature!==null||row.signedBase64!==null)fail();}
  else if(verifyWebPerpsOwnerSignature(row.signedBase64,packet.preparation.serializedTxBase64,row.walletAddress).signature!==row.signature)fail();
  return structuredClone(row);
 }
 const journal=Object.freeze({
  close(){closed=true;db.close();},
  async read(operationId){return facts(await transaction('readonly',(store,set)=>{const request=store.get(id(operationId));request.onsuccess=()=>set(request.result);}));},
  async pending(walletAddress){const rows=await transaction('readonly',(store,set)=>{const request=store.index('pendingWallet').getAll(walletAddress);request.onsuccess=()=>set(request.result);});return Promise.all(rows.map(facts));},
  async beginSigning(packet){
   await validateWebPerpsSigningPacket(packet,{draft:packet.review?.draft,walletAddress:packet.review?.walletAddress,now:time()});
   const at=time(),packetJson=JSON.stringify(packet);if(packetJson.length>8192||at>=packet.review.expiresAt)fail();
   const row={operationId:packet.reviewId,walletAddress:packet.review.walletAddress,activeWallet:packet.review.walletAddress,state:'SIGNING',packetJson,recordBinding:packet.recordBinding,
    createdAt:at,updatedAt:at,signature:null,signedBase64:null};
   await transaction('readwrite',(store)=>{store.add(row);});
   const saved=await journal.read(packet.reviewId);if(JSON.stringify(saved)!==JSON.stringify(row))fail();
   const claim=Object.freeze({operationId:row.operationId,walletAddress:row.walletAddress,recordBinding:row.recordBinding,state:'SIGNING'});
   claims.set(claim,Object.freeze({journal,packetJson,packet:structuredClone(packet),operationId:row.operationId,walletAddress:row.walletAddress}));return claim;
  },
  async recordOwnerSignature(claim,signedBase64){
   const proof=requireWebPerpsSigningClaim(claim,journal),signed=verifyWebPerpsOwnerSignature(signedBase64,proof.packet.preparation.serializedTxBase64,proof.walletAddress),at=time();
   await transaction('readwrite',(store,set,tx)=>{
    const request=store.get(proof.operationId);request.onsuccess=()=>{try{
     const row=request.result;if(row?.state!=='SIGNING'||row.packetJson!==proof.packetJson||row.walletAddress!==proof.walletAddress||at<row.updatedAt)fail();
     store.put({...row,state:'OWNER_SIGNED',updatedAt:at,signature:signed.signature,signedBase64});set(signed.signature);
    }catch{tx.abort();}};
   });
   const saved=await journal.read(proof.operationId);if(saved?.state!=='OWNER_SIGNED'||saved.signedBase64!==signedBase64||saved.signature!==signed.signature)fail();return saved;
  }
 });journals.add(journal);return journal;
}
