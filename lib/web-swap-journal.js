// Public transaction IDs only. Atomic same-origin reservation across tabs.
export async function openWebSwapJournal(indexedDB=globalThis.indexedDB){
 if(!indexedDB)throw Error('WEB_WALLET_STORAGE_REQUIRED');
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('jamddmaj-web-wallet-operations-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending',{keyPath:'address'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('WEB_WALLET_STORAGE_REQUIRED'));});
 async function transact(mode,operation){return new Promise((resolve,reject)=>{const tx=db.transaction('pending',mode),store=tx.objectStore('pending');let result;tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(Error('WEB_SWAP_JOURNAL_FAILED'));operation(store,value=>{result=value;},tx);});}
 return Object.freeze({
  read:address=>transact('readonly',(s,done)=>{const r=s.get(address);r.onsuccess=()=>done(r.result||null);}),
  begin:record=>transact('readwrite',(s,done,tx)=>{if(!record||Object.keys(record).sort().join(',')!=='address,lastValidBlockHeight,signature'||typeof record.address!=='string'||typeof record.signature!=='string'||!(/^[1-9][0-9]{0,19}$/).test(record.lastValidBlockHeight)){tx.abort();return;}const r=s.get(record.address);r.onsuccess=()=>{if(r.result){tx.abort();return;}s.add({address:record.address,signature:record.signature,lastValidBlockHeight:record.lastValidBlockHeight,state:'UNKNOWN',createdAt:Date.now()});done(true);};}),
  resolve:(address,signature,state)=>transact('readwrite',(s,done,tx)=>{if(!['FINALIZED','FAILED'].includes(state)){tx.abort();return;}const r=s.get(address);r.onsuccess=()=>{if(r.result?.signature!==signature){tx.abort();return;}s.delete(address);done(true);};}),
  close:()=>db.close()
 });
}
