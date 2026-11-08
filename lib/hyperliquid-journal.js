// Testnet-only durable intent hold. No keys/signatures are stored. No fallback
// to memory/localStorage: unavailable storage or an exclusive lock blocks send.
import {hyperliquidAddress} from './hyperliquid-public.js';
import {isHyperliquidReceipt} from './hyperliquid-reconcile.js';
export function createHyperliquidTestnetJournal({indexedDB=globalThis.indexedDB,locks=globalThis.navigator?.locks}={}){
 if(!indexedDB?.open||!locks?.request)throw Error('hl-durable-storage-required');
 const opened=new Promise((resolve,reject)=>{const request=indexedDB.open('jamd-hyperliquid-testnet-journal',1);request.onupgradeneeded=()=>{request.result.createObjectStore('accounts');};request.onerror=()=>reject(Error('hl-storage-unavailable'));request.onblocked=()=>reject(Error('hl-storage-blocked'));request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};});
 const keyFor=owner=>{const key=hyperliquidAddress(owner);if(!key)throw Error('hl-account');return key;};
 async function transaction(owner,write,fn){const db=await opened,key=keyFor(owner);return new Promise((resolve,reject)=>{let value;const tx=db.transaction('accounts',write?'readwrite':'readonly'),store=tx.objectStore('accounts');tx.onerror=tx.onabort=()=>reject(Error('hl-storage-failed'));tx.oncomplete=()=>resolve(value);const read=store.get(key);read.onsuccess=()=>{try{value=fn(read.result||{lastNonce:0,pending:null},record=>store.put(record,key));}catch(error){tx.abort();reject(error);}};});}
 return Object.freeze({
  get:owner=>transaction(owner,false,record=>record.pending),
  async put(owner,pending){if(pending?.network!=='testnet'||pending.user!==keyFor(owner)||!/^0x[0-9a-f]{32}$/.test(pending.cloid))throw Error('hl-record');return transaction(owner,true,(record,save)=>{if(record.pending&&record.pending.cloid!==pending.cloid)throw Error('hl-pending-operation');save({...record,pending});});},
  async nonce(owner,now=Date.now()){if(!Number.isSafeInteger(now)||now<0)throw Error('hl-nonce');return transaction(owner,true,(record,save)=>{const next=Math.max(now,record.lastNonce+1);if(next>now+60000)throw Error('hl-nonce-clock');save({...record,lastNonce:next});return next;});},
  async release(owner,cloid,receipt){return transaction(owner,true,(record,save)=>{if(!record.pending||record.pending.cloid!==cloid)throw Error('hl-pending-mismatch');if(record.pending.phase!=='NOT_SUBMITTED'&&(!isHyperliquidReceipt(receipt)||receipt.network!=='testnet'||receipt.user!==keyFor(owner)||receipt.cloid!==cloid))throw Error('hl-reconcile-required');save({...record,pending:null});});},
  lock:async(name,fn)=>locks.request(name,{mode:'exclusive',ifAvailable:true},lock=>{if(!lock)throw Error('hl-another-tab-active');return fn();}),
  async dispose(){(await opened).close();}
 });
}
