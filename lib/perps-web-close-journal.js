// Strict browser persistence for external closes. No automatic clear/retry.
import {validateWebClosePacket,verifyWebCloseSignature} from './perps-web-close-protocol.js';
import {consumeWebCloseRecoveryProof} from './perps-web-close-client.js';
const journals=new WeakSet(),claims=new WeakMap();
function fail(){throw Error('WEB_CLOSE_JOURNAL_UNAVAILABLE');}
function notify(){try{globalThis.dispatchEvent?.(new Event('jamd-wallet-operations'));if(typeof window!=='undefined'&&typeof BroadcastChannel==='function'){const c=new BroadcastChannel('jamddmaj-wallet-display');c.postMessage('invalidate');c.close();}}catch{}}
export function requireWebCloseJournal(value){if(!journals.has(value))fail();return value;}
function settlementMatches(row,status){
 const p=row.packet;
 if(status?.closeId!==p.closeId||status.walletAddress!==p.walletAddress||status.positionAddress!==p.positionAddress||status.readyForRetry!==false)fail();
 const finished=p.operation==='CLOSE'?status.firstLegSignature===row.signature&&['READY_FOR_NEXT_REVIEW','ACCOUNTING_REQUIRED','CONVERSION_FINALIZED','COMPLETED'].includes(status.phase):
  p.operation==='CONVERT'?status.conversionSignature===row.signature&&['CONVERSION_FINALIZED','COMPLETED'].includes(status.phase):
  status.cancellation?.reviewId===p.reviewId&&status.cancellation.signature===row.signature&&['CONFIRMED','FAILED'].includes(status.cancellation.state);
 return finished;
}
export async function openWebCloseJournal({indexedDB=globalThis.indexedDB,name='jamddmaj-web-close-v1',now=Date.now}={}){
 if(!/^jamddmaj-web-close-[a-z0-9-]{1,80}$/.test(name)||typeof indexedDB?.open!=='function'||typeof now!=='function')fail();
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('operations',{keyPath:'id'});store.createIndex('wallet','activeWallet',{unique:true});};request.onerror=request.onblocked=()=>reject(Error('WEB_CLOSE_JOURNAL_UNAVAILABLE'));request.onsuccess=()=>resolve(request.result);});
 let closed=false;db.onversionchange=()=>{closed=true;db.close();};
 function schema(){if(closed||db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains('operations'))fail();const store=db.transaction('operations').objectStore('operations');if(store.keyPath!=='id'||store.indexNames.length!==1||store.index('wallet').keyPath!=='activeWallet'||!store.index('wallet').unique)fail();}
 try{schema();}catch(error){db.close();throw error;}
 const transaction=(mode,run)=>new Promise((resolve,reject)=>{let result,tx;try{schema();tx=db.transaction('operations',mode,...(mode==='readwrite'?[{durability:'strict'}]:[]));tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('WEB_CLOSE_JOURNAL_UNAVAILABLE'));run(tx.objectStore('operations'),v=>{result=v;},tx);}catch{try{tx?.abort();}catch{}reject(Error('WEB_CLOSE_JOURNAL_UNAVAILABLE'));}});
 async function facts(row){if(row===undefined)return null;
  if(!row||Object.keys(row).sort().join(',')!=='activeWallet,created,id,packet,signature,signedBase64,state,status,updated'||row.id!==row.packet?.reviewId||!['SIGNING','OWNER_SIGNED','UNCERTAIN','RECONCILED'].includes(row.state)
   ||row.activeWallet!==(row.state==='RECONCILED'?null:row.packet.walletAddress)||!Number.isSafeInteger(row.created)||row.created<0||!Number.isSafeInteger(row.updated)||row.updated<row.created)fail();
  await validateWebClosePacket(row.packet,{walletAddress:row.packet.walletAddress,positionAddress:row.packet.positionAddress,now:now(),historical:true});
  if(row.state==='SIGNING'){if(row.signature!==null||row.signedBase64!==null)fail();}else if(verifyWebCloseSignature(row.packet,row.signedBase64).signature!==row.signature)fail();
  if(row.state==='RECONCILED'&&!settlementMatches(row,row.status))fail();
  else if(row.state!=='RECONCILED'&&row.status!==null)fail();return structuredClone(row);
 }
 async function update(id,mutate){return transaction('readwrite',(store,set,tx)=>{const request=store.get(id);request.onsuccess=()=>{try{const row=mutate(request.result);store.put(row);set(row);}catch{tx.abort();}};});}
 const journal=Object.freeze({close(){closed=true;db.close();},
  async read(id){return facts(await transaction('readonly',(store,set)=>{const r=store.get(id);r.onsuccess=()=>set(r.result);}));},
  async pending(wallet){const rows=await transaction('readonly',(store,set)=>{const r=store.index('wallet').getAll(wallet);r.onsuccess=()=>set(r.result);});return Promise.all(rows.map(facts));},
  async begin(packet){await validateWebClosePacket(packet,{walletAddress:packet.walletAddress,positionAddress:packet.positionAddress,now:now()});
   const at=now();const row={id:packet.reviewId,packet:structuredClone(packet),activeWallet:packet.walletAddress,state:'SIGNING',signature:null,signedBase64:null,status:null,created:at,updated:at};
   await transaction('readwrite',store=>store.add(row));if(JSON.stringify(await journal.read(row.id))!==JSON.stringify(row))fail();
   const claim=Object.freeze({reviewId:row.id});claims.set(claim,{journal,packet:JSON.stringify(packet)});notify();return claim;
  },
  async signed(claim,signedBase64){const p=claims.get(claim);if(!p||p.journal!==journal)fail();const packet=JSON.parse(p.packet),signature=verifyWebCloseSignature(packet,signedBase64).signature;
   await update(claim.reviewId,row=>{if(row?.state!=='SIGNING'||JSON.stringify(row.packet)!==p.packet||now()<row.updated)fail();return {...row,state:'OWNER_SIGNED',signedBase64,signature,updated:now()};});notify();return journal.read(claim.reviewId);
  },
  async uncertain(id){const before=await journal.read(id);if(before?.state!=='OWNER_SIGNED')fail();await validateWebClosePacket(before.packet,{walletAddress:before.packet.walletAddress,positionAddress:before.packet.positionAddress,now:now()});
   await update(id,row=>{if(JSON.stringify(row)!==JSON.stringify(before)||now()<row.updated)fail();return {...row,state:'UNCERTAIN',updated:now()};});notify();return journal.read(id);
  },
  async settle(proof){const p=consumeWebCloseRecoveryProof(proof,journal);
   await update(proof.reviewId,row=>{if(JSON.stringify(row)!==p.rowJson||!['OWNER_SIGNED','UNCERTAIN'].includes(row.state)||now()<row.updated||!settlementMatches(row,p.status))fail();return {...row,state:'RECONCILED',activeWallet:null,status:p.status,updated:now()};});notify();return journal.read(proof.reviewId);
  }
 });journals.add(journal);return journal;
}
