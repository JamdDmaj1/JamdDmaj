// Operator-only consistent SQLite recovery snapshots. No signer, networking,
// SQL supplied by an archive, activation or release of custody quarantine.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,lstatSync,chmodSync,rmSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateServerPerpsAutomationSettings} from './perps-automation-controls.js';
import {checkPrivateRecoveryPath,readPrivateRecoveryFile,writePrivateRecoveryFile} from './perps-recovery-private-files.js';
const MAX=8*1024*1024,proofs=new WeakMap();
const SCHEMAS={controls:'03270dc01ead4f30609d9865ebb3aad80d0b0d48e3cc387e05fd2b9b155d22a7',journal:'0f4ab1216a89d4d32e97af1c98707943d2add7702150ba577f206fe19f9a41d7'};
const LEGACY_JOURNALS=new Set(['f4c79e669461914ff30fe59063f6ca11270d951600fc320c6ce87dcd616ca786','60e023d5a9fa36ae45b37402ad3956d2a9a8ab906b7df143f96d7ed89802591f']);
function fail(){throw Error('PERPS_RUNTIME_RECOVERY_UNAVAILABLE');}
function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function secure(path,directory,tests){
 return checkPrivateRecoveryPath(path,directory,tests).path;
}
function temporary(parent,tests){
 secure(parent,true,tests);const path=mkdtempSync(join(parent,'jamd-runtime-recovery-'));chmodSync(path,0o700);secure(path,true,tests);
 return {path,remove(){
  // Only our verified freshly-created private child can be recursively removed.
  if(dirname(path)!==resolve(parent)||!basename(path).startsWith('jamd-runtime-recovery-'))fail();secure(path,true,tests);rmSync(path,{recursive:true,force:false});
 }};
}
function open(path,readOnly=false){const db=new DatabaseSync(path,{readOnly,timeout:250,allowExtension:false});db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON;');return db;}
function verify(db,kind,{allowLegacyJournal=true}={}){
 const rows=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(r=>({...r,sql:r.sql?.replace(/\s+/g,' ').trim()}));
 const schema=hash(JSON.stringify(rows));if(schema!==SCHEMAS[kind]&&!(kind==='journal'&&allowLegacyJournal&&LEGACY_JOURNALS.has(schema)))fail();
 if(db.prepare('PRAGMA integrity_check').all().some(row=>Object.values(row)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)fail();
 const size=db.prepare('PRAGMA page_count').get().page_count*db.prepare('PRAGMA page_size').get().page_size;
 if(!Number.isSafeInteger(size)||size<512||size>MAX)fail();
}
// Startup preflight for the real worker: inspect EXISTING stores read-only
// before their constructors can create/migrate any table in a wrong database.
export function inspectExistingPerpsRuntimeDatabases({controlsPath,journalPath,allowNonPosixForTests=false}={}){
 const opened=[];
 try{
  const paths={controls:secure(controlsPath,false,allowNonPosixForTests),journal:secure(journalPath,false,allowNonPosixForTests)};
  const a=lstatSync(paths.controls,{bigint:true}),b=lstatSync(paths.journal,{bigint:true});
  if(a.ino===b.ino&&a.dev===b.dev)fail();
  for(const kind of ['controls','journal']){const db=open(paths[kind],true);opened.push(db);verify(db,kind,{allowLegacyJournal:false});}
  return Object.freeze({stage:'EXISTING_RUNTIME_STORES_VERIFIED',readyForSigning:false});
 }catch{fail();}finally{for(const db of opened.reverse())try{db.close();}catch{}}
}
function inventory(controls,journal,identities){
 const owners=new Map();
 for(const {walletAddress,ownerAccountHash}of identities){if(owners.has(walletAddress)&&owners.get(walletAddress)!==ownerAccountHash)fail();owners.set(walletAddress,ownerAccountHash);}
 const rows=controls.prepare('SELECT * FROM perps_automation_controls').all(),bound=new Set(),seenOwners=new Set();
 if(!rows.length||rows.length>256)fail();
 for(const row of rows){
  if(owners.get(row.wallet)!==row.owner||seenOwners.has(row.owner)||![0,1].includes(row.enabled)||![0,1].includes(row.paused)||!Number.isSafeInteger(row.updated)||row.updated<0)fail();
  const settings=validateServerPerpsAutomationSettings(JSON.parse(row.settings));if(JSON.stringify(settings)!==row.settings)fail();
  bound.add(row.wallet);seenOwners.add(row.owner);
 }
 // Every journal row, not only currently open positions, must remain bound.
 for(const row of journal.prepare('SELECT DISTINCT wallet FROM perps_reservations').all())if(!bound.has(row.wallet))fail();
 if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_exit_cancellations'").get()){
  const attempts=journal.prepare('SELECT c.wallet,c.reservation,c.address,r.wallet AS parent_wallet,b.reservation AS bound_reservation FROM perps_exit_cancellations c JOIN perps_reservations r ON r.reservation=c.reservation JOIN perps_exit_request_bindings b ON b.address=c.address').all();
  for(const row of attempts)if(!bound.has(row.wallet)||row.wallet!==row.parent_wallet||row.reservation!==row.bound_reservation)fail();
 }
 for(const row of controls.prepare('SELECT DISTINCT wallet FROM perps_automation_audit').all())if(!bound.has(row.wallet))fail();
 return rows;
}
function encoded(kind,data){return {kind,data:data.toString('base64'),sha256:hash(data)};}
function decode(input){
 if(!Array.isArray(input)||input.length!==2)fail();const result=new Map();
 for(const item of input){
  if(!item||Object.keys(item).sort().join(',')!=='data,kind,sha256'||!Object.hasOwn(SCHEMAS,item.kind)||result.has(item.kind)||typeof item.data!=='string'||item.data.length>Math.ceil(MAX/3)*4)fail();
  const bytes=Buffer.from(item.data,'base64');if(bytes.length<512||bytes.length>MAX||bytes.toString('base64')!==item.data||hash(bytes)!==item.sha256||bytes.subarray(0,16).toString()!=='SQLite format 3\u0000')fail();result.set(item.kind,bytes);
 }
 return result;
}
export async function withLockedPerpsRuntimeRecoverySnapshot({controlsPath,journalPath,temporaryDirectory,allowNonPosixForTests=false}={},fn){
 const opened=[],locked=[];let work;
 try{
  if(typeof fn!=='function'||controlsPath===journalPath)fail();
  const paths={controls:secure(controlsPath,false,allowNonPosixForTests),journal:secure(journalPath,false,allowNonPosixForTests)};
  const a=lstatSync(paths.controls,{bigint:true}),b=lstatSync(paths.journal,{bigint:true});
  if(paths.controls===paths.journal||a.ino===b.ino&&a.dev===b.dev)fail();
  for(const path of Object.values(paths))secure(dirname(path),true,allowNonPosixForTests);
  work=temporary(temporaryDirectory,allowNonPosixForTests);
  const records=[];
  // Stable path ordering avoids two backup coordinators acquiring opposite
  // locks. BEGIN IMMEDIATE prevents writers on BOTH live databases. Separate
  // read connections can use SQLite's WAL-aware online backup API while held.
  for(const path of Object.values(paths).sort()){
   const db=open(path);opened.push(db);db.exec('BEGIN IMMEDIATE');locked.push(db);
  }
  for(const kind of ['controls','journal']){
   const source=open(paths[kind],true);opened.push(source);verify(source,kind);
   const target=join(work.path,kind+'.sqlite');await backup(source,target);chmodSync(target,0o600);secure(target,false,allowNonPosixForTests);
   const bytes=readPrivateRecoveryFile(target,MAX,allowNonPosixForTests);records.push(encoded(kind,bytes));
  }
  const handle=Object.freeze({stage:'LOCKED_RUNTIME_RECOVERY_SNAPSHOT'});proofs.set(handle,records);
  try{return await fn(handle);}finally{proofs.delete(handle);}
 }catch{fail();}
 finally{for(const db of locked.reverse())try{db.exec('ROLLBACK');}catch{}for(const db of opened.reverse())try{db.close();}catch{}work?.remove();}
}
export function readPerpsRuntimeRecoverySnapshot(handle){const value=proofs.get(handle);if(!value)fail();return structuredClone(value);}
export function inspectPerpsRuntimeRecoveryDatabases(input,{temporaryDirectory,identities,restorePaused=false,now=Date.now,allowNonPosixForTests=false}={}){
 let work;const opened=[];
 try{
  const decoded=decode(input);work=temporary(temporaryDirectory,allowNonPosixForTests);const databases={};
  for(const kind of ['controls','journal']){
   const path=join(work.path,kind+'.sqlite');writePrivateRecoveryFile(path,decoded.get(kind),allowNonPosixForTests);
   const db=open(path);opened.push(db);verify(db,kind);databases[kind]=db;
  }
  const rows=inventory(databases.controls,databases.journal,identities);
  if(restorePaused){
   const at=now();if(!Number.isSafeInteger(at)||at<0)fail();const db=databases.controls;
   db.exec('BEGIN IMMEDIATE');
   try{
    for(const row of rows){
     const revision=randomUUID(),updated=Math.max(at,row.updated);
     db.prepare("UPDATE perps_automation_controls SET revision=?,enabled=0,paused=1,reason='RESTORE_REVIEW_REQUIRED',updated=?,challenge_hash=NULL,challenge_issued=NULL,challenge_expires=NULL WHERE wallet=?").run(revision,updated,row.wallet);
     db.prepare('INSERT INTO perps_automation_audit(wallet,revision,action,at,settings_hash) VALUES(?,?,?,?,?)').run(row.wallet,revision,'RESTORE_AND_PAUSE',updated,hash(row.settings));
    }
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
  }
  // Each returned file is standalone, including all committed WAL content.
  for(const db of opened){db.exec('PRAGMA wal_checkpoint(TRUNCATE);');db.exec('PRAGMA journal_mode=DELETE;');db.close();}opened.length=0;
  return ['controls','journal'].map(kind=>{
   const path=join(work.path,kind+'.sqlite'),fd=openSync(path,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
   const data=readPrivateRecoveryFile(path,MAX,allowNonPosixForTests);return encoded(kind,data);
  });
 }catch{fail();}
 finally{for(const db of opened)try{db.close();}catch{}work?.remove();}
}
