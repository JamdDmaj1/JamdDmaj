// Private durable operator restore attestation. No network/API, custody signer,
// activation, transfer, or automatic release of restored-wallet quarantine.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import bs58 from 'bs58';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write,readPrivateRecoveryFile as read} from './perps-recovery-private-files.js';
const proofs=new WeakMap(),HEX=/^[a-f0-9]{64}$/;
export const PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL='CREATE TABLE perps_backup_fee_scope(archive TEXT PRIMARY KEY REFERENCES perps_backup_challenges(archive),included INTEGER NOT NULL CHECK(included=1)) STRICT';
export const PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL='CREATE TABLE perps_backup_swap_scope(archive TEXT PRIMARY KEY REFERENCES perps_backup_challenges(archive),included INTEGER NOT NULL CHECK(included=1)) STRICT';
const TABLES={
 perps_backup_challenges:"CREATE TABLE perps_backup_challenges(sequence INTEGER PRIMARY KEY AUTOINCREMENT,archive TEXT NOT NULL UNIQUE,token_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,bindings TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('PENDING','ACCEPTED','REVOKED'))) STRICT",
 perps_verified_backups:'CREATE TABLE perps_verified_backups(owner TEXT PRIMARY KEY,wallet TEXT NOT NULL UNIQUE,archive TEXT NOT NULL REFERENCES perps_backup_challenges(archive),revision TEXT NOT NULL UNIQUE,verified INTEGER NOT NULL) STRICT'
};
const normalize=value=>value.replace(/\s+/g,' ').trim();
function fail(){throw Error('PERPS_CUSTODY_BACKUP_UNVERIFIED');}
function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function identity({ownerAccountHash,walletAddress}={}){
 if(typeof ownerAccountHash!=='string'||!HEX.test(ownerAccountHash)||typeof walletAddress!=='string'||walletAddress.length>44)fail();
 try{if(bs58.decode(walletAddress).length!==32||bs58.encode(bs58.decode(walletAddress))!==walletAddress)fail();}catch{fail();}
 return {ownerAccountHash,walletAddress};
}
function bindingList(value){
 if(!Array.isArray(value)||!value.length||value.length>256)fail();let previous='';const wallets=new Set();
 return value.map(row=>{
  if(!row||Object.keys(row).sort().join(',')!=='ownerAccountHash,walletAddress')fail();const result=identity(row);
  if(result.ownerAccountHash<=previous||wallets.has(result.walletAddress))fail();previous=result.ownerAccountHash;wallets.add(result.walletAddress);return result;
 });
}
export function requireVerifiedPerpsCustodyBackup(value,expected){
 const p=proofs.get(value),who=identity(expected);if(!p||value.ownerAccountHash!==who.ownerAccountHash||value.walletAddress!==who.walletAddress)fail();
 const elapsed=p.clock()-p.started;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>2000)fail();p.recheck();
 const after=p.clock()-p.started;if(!Number.isFinite(after)||after<0||after>2000)fail();return value;
}
export function openPerpsBackupRegistry(path,{now=Date.now,monotonicNow=()=>performance.now(),allowNonPosixForTests=false}={}){
 if(typeof now!=='function'||typeof monotonicNow!=='function')fail();check(dirname(path),true,allowNonPosixForTests);
 if(!existsSync(path))write(path,new Uint8Array(),allowNonPosixForTests);const openedFile=check(path,false,allowNonPosixForTests);path=openedFile.path;
 const db=new DatabaseSync(path,{timeout:5000});let closed=false;
 const schema=()=>db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
 function verifySchema(){const rows=schema();if(![2,3,4].includes(rows.length)||Object.keys(TABLES).some(name=>!rows.some(row=>row.name===name))||rows.some(row=>row.type!=='table'||normalize(row.sql)!==normalize(row.name==='perps_backup_fee_scope'?PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL:row.name==='perps_backup_swap_scope'?PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL:TABLES[row.name]??'')))fail();}
 try{
  // Never add recovery tables to a mistakenly supplied controls/journal DB.
  if(schema().length)verifySchema();
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  if(!schema().length)db.exec('BEGIN IMMEDIATE;'+Object.values(TABLES).join(';')+';COMMIT;');verifySchema();
 }catch{db.close();fail();}
 function time(){
  const n=now();if(closed||!Number.isSafeInteger(n)||n<0)fail();check(dirname(path),true,allowNonPosixForTests);
  const current=check(path,false,allowNonPosixForTests).stat;if(current.ino!==openedFile.stat.ino||current.dev!==openedFile.stat.dev)fail();verifySchema();return n;
 }
 function transaction(fn){time();db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}
 function verified(who){
  time();const row=db.prepare("SELECT v.*,c.status,c.bindings FROM perps_verified_backups v JOIN perps_backup_challenges c ON c.archive=v.archive WHERE v.owner=? AND v.wallet=?").get(who.ownerAccountHash,who.walletAddress);
  if(!row||row.status!=='ACCEPTED'||!HEX.test(row.archive)||!Number.isSafeInteger(row.verified)||row.verified<0||row.verified>time()+2000||!/^[a-f0-9-]{36}$/.test(row.revision))fail();
  let covered;try{covered=bindingList(JSON.parse(row.bindings));}catch{fail();}
  if(!covered.some(entry=>entry.ownerAccountHash===who.ownerAccountHash&&entry.walletAddress===who.walletAddress))fail();
  const hasScope=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_backup_fee_scope'").get();
  const swapScope=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_backup_swap_scope'").get();
  return {...row,platformFeeStateIncluded:!!(hasScope&&db.prepare('SELECT 1 FROM perps_backup_fee_scope WHERE archive=? AND included=1').get(row.archive)),botSwapStateIncluded:!!(swapScope&&db.prepare('SELECT 1 FROM perps_backup_swap_scope WHERE archive=? AND included=1').get(row.archive))};
 }
 return Object.freeze({
  close(){closed=true;db.close();},
  async registerArchive(archive,{explicitOperatorApproval}={}){
   if(explicitOperatorApproval!==true)fail();
   const {readPerpsCustodyRecoveryChallenge}=await import('./perps-custody-recovery.js'),value=readPerpsCustodyRecoveryChallenge(archive);
   return transaction(()=>{
    const at=time(),bindings=bindingList(value.bindings);
    if(!HEX.test(value.archiveSha256)||!HEX.test(value.verificationTokenHash)||!Number.isSafeInteger(value.createdAt)||value.createdAt<0||value.createdAt>at+2000||at-value.createdAt>86400000)fail();
    const old=db.prepare('SELECT * FROM perps_backup_challenges WHERE archive=?').get(value.archiveSha256),encoded=JSON.stringify(bindings);
    if(old){if(old.token_hash!==value.verificationTokenHash||old.bindings!==encoded||old.created!==value.createdAt||old.status==='REVOKED')fail();}
    else db.prepare("INSERT INTO perps_backup_challenges(archive,token_hash,created,expires,bindings,status) VALUES(?,?,?,?,?,'PENDING')").run(value.archiveSha256,value.verificationTokenHash,value.createdAt,value.createdAt+86400000,encoded);
    if(value.platformFeeStateIncluded===true){
     if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_backup_fee_scope'").get())db.exec(PERPS_BACKUP_FEE_SCOPE_SCHEMA_SQL);
     db.prepare('INSERT OR IGNORE INTO perps_backup_fee_scope VALUES(?,1)').run(value.archiveSha256);
    }
    if(value.botSwapStateIncluded===true){
     if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_backup_swap_scope'").get())db.exec(PERPS_BACKUP_SWAP_SCOPE_SCHEMA_SQL);
     db.prepare('INSERT OR IGNORE INTO perps_backup_swap_scope VALUES(?,1)').run(value.archiveSha256);
    }
    return Object.freeze({archiveSha256:value.archiveSha256,stage:old?.status==='ACCEPTED'?'RESTORE_PREVIOUSLY_VERIFIED':'RESTORE_PROOF_REQUIRED',backupVerified:old?.status==='ACCEPTED',readyForSigning:false});
   });
  },
  acceptRestoreProof({proofFile,expectedArchiveSha256=null,explicitOperatorApproval}={}){
   if(explicitOperatorApproval!==true)fail();
   let input;try{input=JSON.parse(read(proofFile,65536,allowNonPosixForTests).toString('utf8'));}catch{fail();}
   if(!input||Object.keys(input).sort().join(',')!=='archiveSha256,bindings,createdAt,format,restoredAt,verificationToken'||input.format!=='jamddmaj-perps-backup-proof/v1'||typeof input.verificationToken!=='string'||!HEX.test(input.verificationToken)||typeof input.archiveSha256!=='string'||!HEX.test(input.archiveSha256))fail();
   if(expectedArchiveSha256!==null&&(!HEX.test(expectedArchiveSha256)||input.archiveSha256!==expectedArchiveSha256))fail();
   const covered=bindingList(input.bindings),token=Buffer.from(input.verificationToken,'hex');
   try{return transaction(()=>{
    const row=db.prepare('SELECT rowid AS archive_sequence,* FROM perps_backup_challenges WHERE archive=?').get(input.archiveSha256),at=time();
    if(!row||row.status==='REVOKED'||!HEX.test(row.token_hash)||row.created!==input.createdAt||row.bindings!==JSON.stringify(covered)||!Number.isSafeInteger(input.restoredAt)||input.restoredAt<row.created-2000||input.restoredAt>at+2000
     ||row.status==='PENDING'&&at>=row.expires||!timingSafeEqual(Buffer.from(row.token_hash,'hex'),Buffer.from(hash(token),'hex')))fail();
    // A new proof must not silently reassign an existing owner's wallet.
    for(const who of covered){
     const old=db.prepare('SELECT v.*,c.rowid AS archive_sequence FROM perps_verified_backups v JOIN perps_backup_challenges c ON c.archive=v.archive WHERE owner=?').get(who.ownerAccountHash);
     if(old&&(old.wallet!==who.walletAddress||old.archive!==input.archiveSha256&&old.archive_sequence>=row.archive_sequence))fail();
    }
    db.prepare("UPDATE perps_backup_challenges SET status='ACCEPTED' WHERE archive=?").run(input.archiveSha256);
    for(const who of covered){
     const old=db.prepare('SELECT * FROM perps_verified_backups WHERE owner=?').get(who.ownerAccountHash);
     if(old?.archive===input.archiveSha256)continue;
     db.prepare('INSERT INTO perps_verified_backups(owner,wallet,archive,revision,verified) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET archive=excluded.archive,revision=excluded.revision,verified=excluded.verified').run(who.ownerAccountHash,who.walletAddress,input.archiveSha256,randomUUID(),at);
    }
    return Object.freeze({stage:'OPERATOR_RESTORE_VERIFIED',archiveSha256:input.archiveSha256,walletCount:covered.length,backupVerified:true,readyForSigning:false,activationRequested:false});
   });}finally{token.fill(0);}
  },
  readVerified(args){
   const who=identity(args),row=verified(who),started=monotonicNow();if(!Number.isFinite(started))fail();
   const result=Object.freeze({...who,stage:'RESTORE_PROVEN_CUSTODY_BACKUP',archiveSha256:row.archive,verifiedAt:row.verified,backupVerified:true,platformFeeStateIncluded:row.platformFeeStateIncluded,botSwapStateIncluded:row.botSwapStateIncluded,readyForSigning:false});
   proofs.set(result,{started,clock:monotonicNow,recheck(){const current=verified(who);if(current.revision!==row.revision||current.archive!==row.archive||current.platformFeeStateIncluded!==row.platformFeeStateIncluded||current.botSwapStateIncluded!==row.botSwapStateIncluded)fail();}});return requireVerifiedPerpsCustodyBackup(result,who);
  },
  revokeArchive({archiveSha256,explicitOperatorApproval}={}){
   if(explicitOperatorApproval!==true||!HEX.test(archiveSha256))fail();return transaction(()=>{
    const result=db.prepare("UPDATE perps_backup_challenges SET status='REVOKED' WHERE archive=? AND status!='REVOKED'").run(archiveSha256);
    if(!result.changes)fail();return Object.freeze({stage:'BACKUP_REVOKED',backupVerified:false,readyForSigning:false});
   });
  }
 });
}
