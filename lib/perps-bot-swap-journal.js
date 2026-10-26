// Durable private single-host wallet exclusion. No keys, network or auto retry.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write} from './perps-recovery-private-files.js';
const journals=new WeakSet(),claims=new WeakMap();
export const BOT_SWAP_SCHEMA_SQL=`CREATE TABLE bot_wallet_swaps(id TEXT PRIMARY KEY,owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL,review TEXT NOT NULL,message TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('SIGNING','UNKNOWN','FINALIZED','FAILED','ABORTED')),signature TEXT,signed TEXT,last_height TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT;
CREATE UNIQUE INDEX bot_wallet_swaps_pending ON bot_wallet_swaps(wallet) WHERE state IN('SIGNING','UNKNOWN');`;
export const BOT_SWAP_SCHEMA_HASH='c15f589350af61e721bba2510264a1f0f9f8776a71af1071ab728f01fc48df7e';
function fail(){throw Error('BOT_SWAP_JOURNAL_UNAVAILABLE');}
const hash=v=>createHash('sha256').update(v).digest('hex');
function key(v,n){try{if(typeof v!=='string'||bs58.decode(v).length!==n||bs58.encode(bs58.decode(v))!==v)fail();return v;}catch{fail();}}
function hex(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail();return v;}
export function verifyBotSwapStoredRecord(row){
 hex(row.id);hex(row.owner);key(row.wallet,32);
 const message=Buffer.from(row.message,'base64'),review=JSON.parse(row.review);
 if(message.length<1||message.length>1167||message.toString('base64')!==row.message||review.id!==row.id||review.walletAddress!==row.wallet||review.controlRevision!==row.revision
  ||!Number.isSafeInteger(row.created)||!Number.isSafeInteger(row.updated)||row.created<0||row.updated<row.created)fail();
 if(row.signature!==null||row.signed!==null){
  key(row.signature,64);const wire=Buffer.from(row.signed,'base64');
  if(wire.toString('base64')!==row.signed||wire.length!==message.length+65||wire[0]!==1||!wire.subarray(65).equals(message)
   ||bs58.encode(wire.subarray(1,65))!==row.signature||!ed25519.verify(wire.subarray(1,65),message,bs58.decode(row.wallet),{zip215:false}))fail();
 }
 if(['UNKNOWN','FINALIZED','FAILED'].includes(row.state)&&(row.signature===null||! /^[1-9][0-9]{0,19}$/.test(row.last_height)))fail();
 if(!['SIGNING','UNKNOWN','FINALIZED','FAILED','ABORTED'].includes(row.state))fail();return row;
}
export function requireBotSwapJournal(value){if(!journals.has(value))fail();return value;}
export function requireBotSwapClaim(claim,journal){const p=claims.get(claim);if(!p||p.journal!==requireBotSwapJournal(journal))fail();const row=journal.read(p.id);if(!row||row.state!=='SIGNING'||row.message!==p.message)fail();return row;}
export function openBotSwapJournal(path,{initialize=false,explicitOperatorApproval=false,allowNonPosixForTests=false,now=Date.now}={}){
 check(dirname(path),true,allowNonPosixForTests);
 if(!existsSync(path)){if(!initialize||explicitOperatorApproval!==true)fail();write(path,new Uint8Array(),allowNonPosixForTests);}
 const original=check(path,false,allowNonPosixForTests).stat,db=new DatabaseSync(path,{timeout:5000});let closed=false;
 const schema=()=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(r=>({...r,sql:r.sql?.replace(/\s+/g,' ').trim()}));
 try{
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  if(!schema().length){if(!initialize||explicitOperatorApproval!==true)fail();db.exec('BEGIN IMMEDIATE;'+BOT_SWAP_SCHEMA_SQL+'COMMIT;');}
  // Schema text is fixed; reject any unrelated or partially migrated database.
  const expected=[['index','bot_wallet_swaps_pending','bot_wallet_swaps',"CREATE UNIQUE INDEX bot_wallet_swaps_pending ON bot_wallet_swaps(wallet) WHERE state IN('SIGNING','UNKNOWN')"],['table','bot_wallet_swaps','bot_wallet_swaps',BOT_SWAP_SCHEMA_SQL.split(';')[0]]].map(([type,name,tbl_name,sql])=>({type,name,tbl_name,sql:sql.replace(/\s+/g,' ').trim()}));
  if(hash(JSON.stringify(schema()))!==hash(JSON.stringify(expected)))fail();
  if(db.prepare('PRAGMA integrity_check').all().some(r=>Object.values(r)[0]!=='ok'))fail();
  for(const row of db.prepare('SELECT * FROM bot_wallet_swaps').all())verifyBotSwapStoredRecord(row);
 }catch(error){db.close();throw error;}
 function time(){if(closed)fail();const stat=check(path,false,allowNonPosixForTests).stat;if(stat.ino!==original.ino||stat.dev!==original.dev)fail();const at=now();if(!Number.isSafeInteger(at)||at<0)fail();return at;}
 function transaction(fn){time();db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 const api={
  close(){closed=true;db.close();},
  read(id){time();const row=db.prepare('SELECT * FROM bot_wallet_swaps WHERE id=?').get(hex(id));return row?verifyBotSwapStoredRecord({...row}):null;},
  pending(wallet){time();return db.prepare("SELECT * FROM bot_wallet_swaps WHERE wallet=? AND state IN('SIGNING','UNKNOWN') ORDER BY created,id").all(key(wallet,32)).map(r=>verifyBotSwapStoredRecord({...r}));},
  recent(owner,wallet){time();return db.prepare('SELECT * FROM bot_wallet_swaps WHERE owner=? AND wallet=? ORDER BY created DESC,id LIMIT 20').all(hex(owner),key(wallet,32)).map(r=>verifyBotSwapStoredRecord({...r}));},
  claim({id,ownerAccountHash,walletAddress,revision,review,message}){return transaction(()=>{
   hex(id);hex(ownerAccountHash);key(walletAddress,32);if(!(message instanceof Uint8Array)||message.length>1167||review.walletAddress!==walletAddress||review.controlRevision!==revision)fail();
   const encoded=Buffer.from(message).toString('base64'),at=time();
   db.prepare("INSERT INTO bot_wallet_swaps VALUES(?,?,?,?,?,?,'SIGNING',NULL,NULL,NULL,?,?)").run(id,ownerAccountHash,walletAddress,revision,JSON.stringify(review),encoded,at,at);
   const claim=Object.freeze({id});claims.set(claim,{id,journal:api,message:encoded});return claim;
  });},
  signed(claim,encoded){return transaction(()=>{
   const row=requireBotSwapClaim(claim,api),wire=Buffer.from(encoded,'base64');if(row.signed!==null||wire.length<66)fail();
   const signature=bs58.encode(wire.subarray(1,65)),updated=time();verifyBotSwapStoredRecord({...row,signed:encoded,signature,updated});
   db.prepare("UPDATE bot_wallet_swaps SET signed=?,signature=?,updated=? WHERE id=? AND state='SIGNING'").run(encoded,signature,updated,row.id);return api.read(row.id);
  });},
  beginBroadcast(claim,{address,signature,lastValidBlockHeight}){return transaction(()=>{
   const row=requireBotSwapClaim(claim,api);if(row.wallet!==address||row.signature!==signature||row.signed===null||! /^[1-9][0-9]{0,19}$/.test(lastValidBlockHeight))fail();
   db.prepare("UPDATE bot_wallet_swaps SET state='UNKNOWN',last_height=?,updated=? WHERE id=?").run(lastValidBlockHeight,time(),row.id);return api.read(row.id);
  });},
  abortUnsignedOrUnsent(claim){return transaction(()=>{const row=requireBotSwapClaim(claim,api);db.prepare("UPDATE bot_wallet_swaps SET state='ABORTED',updated=? WHERE id=?").run(time(),row.id);return api.read(row.id);});},
  recoverNeverBroadcast(id,owner){return transaction(()=>{const row=api.read(id);if(row?.state!=='SIGNING'||row.owner!==hex(owner))fail();db.prepare("UPDATE bot_wallet_swaps SET state='ABORTED',updated=? WHERE id=? AND state='SIGNING'").run(time(),row.id);return api.read(row.id);});},
  settle(id,signature,state){return transaction(()=>{const row=api.read(id);if(row?.state!=='UNKNOWN'||row.signature!==signature||!['FINALIZED','FAILED'].includes(state))fail();db.prepare('UPDATE bot_wallet_swaps SET state=?,updated=? WHERE id=?').run(state,time(),row.id);return api.read(row.id);});}
 };journals.add(api);return Object.freeze(api);
}
