// Operator-only consistent SQLite recovery snapshots. No signer, networking,
// SQL supplied by an archive, activation or release of custody quarantine.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,lstatSync,chmodSync,rmSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateServerPerpsAutomationSettings} from './perps-automation-controls.js';
import {checkPrivateRecoveryPath,readPrivateRecoveryFile,writePrivateRecoveryFile} from './perps-recovery-private-files.js';
import {canonicalPerpsCloseSettlement} from './perps-close-settlement.js';
import {validateStoredPerpsCloseExecution} from './perps-close-execution-record.js';
import {validateStoredPerpsCloseConversion} from './perps-close-conversion-record.js';
import {validateStoredPerpsCloseCompletion} from './perps-close-completion-record.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
import {BOT_SWAP_SCHEMA_HASH,verifyBotSwapStoredRecord} from './perps-bot-swap-journal.js';
const MAX=8*1024*1024,proofs=new WeakMap();
const SCHEMAS={controls:'03270dc01ead4f30609d9865ebb3aad80d0b0d48e3cc387e05fd2b9b155d22a7',journal:'505c96362bd65d613ca90ddd17f846c3bfca04d5f0ee69c732b9f3ebf05d91b9',fees:'e96ccf68b094190ad10733be6e8b1b4476068f102d129b9cf407313390dbc02b',payments:'c5c71be566fbfae724397f006dbbd23167571d44b71a565831715d191cfe459d'};
const LEGACY_JOURNALS=new Set(['d48b3b21a0aaa1addfa5735406f90e634f99f3b344cb418237de24938a9672e7','1657eaa7e4eb82efe0e045597e1ec06dd736b9bdc9f2b6a88125c987dc6ea563','8200534af55b955bb73f2dd8bd207eeac04b248381885f415e19584e5cebeddd','cba66ff21abc8f2dd3db1bbebbbc3908a9d8cda2fa24b41a2191e184c5477e54','f4c79e669461914ff30fe59063f6ca11270d951600fc320c6ce87dcd616ca786','60e023d5a9fa36ae45b37402ad3956d2a9a8ab906b7df143f96d7ed89802591f','0f4ab1216a89d4d32e97af1c98707943d2add7702150ba577f206fe19f9a41d7']);
LEGACY_JOURNALS.add('42653dcbee61271989264b68e8829787afc7d1b2c5e54ae759b100571088fbaf');
LEGACY_JOURNALS.add('e92bbd338ca88b8a85064ac669f0ae6ffb50641475b1bd62f78df48d06ccf145');
SCHEMAS.swaps=BOT_SWAP_SCHEMA_HASH;
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
export function inspectExistingPerpsFeeDatabases({feesPath,paymentsPath,allowNonPosixForTests=false}={}){
 const opened=[];try{
  const paths={fees:secure(feesPath,false,allowNonPosixForTests),payments:secure(paymentsPath,false,allowNonPosixForTests)};
  const ids=new Set();for(const [kind,path]of Object.entries(paths)){const stat=lstatSync(path,{bigint:true}),id=stat.dev+':'+stat.ino;if(ids.has(id))fail();ids.add(id);
   const db=open(path,true);opened.push(db);verify(db,kind);}
  return Object.freeze({stage:'EXISTING_PLATFORM_FEE_STORES_VERIFIED',readyForSigning:false});
 }finally{for(const db of opened.reverse())db.close();}
}
function inventory(controls,journal,identities,fees=null,payments=null){
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
 const hasFeeColumn=journal.prepare('PRAGMA table_info(perps_reservations)').all().some(r=>r.name==='platform_fee_units');
 if(hasFeeColumn)for(const row of journal.prepare('SELECT margin,platform_fee_units FROM perps_reservations').all()){
  if(!Number.isSafeInteger(row.platform_fee_units)||row.platform_fee_units<0||row.platform_fee_units!==0&&row.platform_fee_units!==Number(quotePerpsPlatformFee(String(row.margin)).feeUnits))fail();
 }
 const hasLocks=journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_platform_fee_locks'").get();
 if(!fees||!payments){
  if(fees||payments||hasLocks&&journal.prepare('SELECT COUNT(*) AS n FROM perps_platform_fee_locks').get().n
    ||hasFeeColumn&&journal.prepare('SELECT COUNT(*) AS n FROM perps_reservations WHERE platform_fee_units>0').get().n)fail();
 }else{
  for(const consent of fees.prepare('SELECT * FROM perps_platform_fee_consents').all()){
   const entry=journal.prepare('SELECT * FROM perps_reservations WHERE reservation=?').get(consent.reservation);
   if(!entry||!bound.has(consent.wallet)||entry.wallet!==consent.wallet||String(entry.margin)!==consent.margin||entry.created!==consent.entry_created
     ||consent.terms!==JSON.stringify(quotePerpsPlatformFee(consent.margin))||!Number.isSafeInteger(consent.accepted)||consent.accepted<0)fail();
  }
  for(const mandate of fees.prepare('SELECT * FROM perps_platform_fee_mandates').all()){
   if(owners.get(mandate.wallet)!==mandate.owner||!bound.has(mandate.wallet))fail();
   const terms=JSON.parse(mandate.terms);if(mandate.terms!==JSON.stringify(quotePerpsPlatformFee(terms.marginUnits)))fail();
  }
  for(const assessment of fees.prepare('SELECT * FROM perps_platform_fee_assessments').all()){
   const entry=journal.prepare('SELECT * FROM perps_reservations WHERE reservation=?').get(assessment.reservation),consent=fees.prepare('SELECT * FROM perps_platform_fee_consents WHERE reservation=?').get(assessment.reservation);
   const quote=quotePerpsPlatformFee(assessment.margin);
   if(!entry||!consent||entry.wallet!==assessment.wallet||!bound.has(assessment.wallet)||!['OPEN','CLOSED'].includes(entry.state)
    ||entry.signature!==assessment.opening_signature||entry.confirmed_slot!==assessment.opening_slot||String(entry.margin)!==assessment.margin
    ||consent.terms!==assessment.terms||assessment.terms!==JSON.stringify(quote)||assessment.fee!==quote.feeUnits
    ||assessment.id!==hash(JSON.stringify([quote.version,assessment.wallet,assessment.opening_signature])))fail();
  }
  for(const payment of payments.prepare('SELECT * FROM perps_platform_fee_payments').all()){
   const assessment=fees.prepare('SELECT * FROM perps_platform_fee_assessments WHERE id=?').get(payment.assessment_id),review=JSON.parse(payment.review_json);
   if(!assessment||payment.wallet!==assessment.wallet||review.walletAddress!==payment.wallet||review.assessmentId!==assessment.id
     ||review.feeUnits!==assessment.fee||review.marginUnits!==assessment.margin||review.reservationId!==assessment.reservation
     ||hash(Buffer.from(review.messageBase64,'base64'))!==review.messageHash)fail();
   const lock=hasLocks?journal.prepare('SELECT * FROM perps_platform_fee_locks WHERE assessment_id=?').get(payment.assessment_id):null;
   if(!lock||lock.wallet!==payment.wallet||lock.review_hash!==review.messageHash||String(lock.fee_units)!==review.feeUnits)fail();
   if(payment.state!=='SIGNING'&&(!payment.signed_base64||hash(Buffer.from(payment.signed_base64,'base64'))!==payment.wire_hash))fail();
  }
 }
 if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_platform_fee_locks'").get()){
  for(const row of journal.prepare('SELECT * FROM perps_platform_fee_locks').all()){
   const entry=journal.prepare('SELECT * FROM perps_reservations WHERE reservation=?').get(row.reservation);
   if(!bound.has(row.wallet)||!entry||entry.wallet!==row.wallet||!['OPEN','CLOSED'].includes(entry.state)
     ||!/^[a-f0-9]{64}$/.test(row.assessment_id)||!/^[a-f0-9]{64}$/.test(row.review_hash)
     ||!Number.isSafeInteger(row.fee_units)||row.fee_units!==Number(BigInt(entry.margin)*20n/10000n)
     ||!Number.isSafeInteger(row.created)||row.created<entry.created)fail();
   if(!fees?.prepare('SELECT 1 FROM perps_platform_fee_assessments WHERE id=? AND reservation=?').get(row.assessment_id,row.reservation))fail();
   if(row.state!=='HELD'){
    let receipt;try{receipt=JSON.parse(row.receipt_json);}catch{fail();}
    if(receipt.assessmentId!==row.assessment_id||receipt.walletAddress!==row.wallet||receipt.messageHash!==row.review_hash
      ||receipt.feeUnits!==String(row.fee_units)||receipt.signature!==row.signature||receipt.state!==row.state)fail();
   }
  }
 }
 if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_position_closes'").get()){
  for(const row of journal.prepare('SELECT * FROM perps_position_closes').all()){
   if(!bound.has(row.wallet))fail();
   const terminal=journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_close_completions'").get()
    ?journal.prepare('SELECT * FROM perps_close_completions WHERE close_id=?').get(row.id):null;
   if((row.state==='COMPLETED')!==!!terminal)fail();
   if(terminal){
    const execution=journal.prepare('SELECT * FROM perps_position_close_executions WHERE close_id=?').get(row.id);
    const conversion=journal.prepare('SELECT * FROM perps_close_conversions WHERE close_id=?').get(row.id)??null;
    const parents=JSON.parse(row.entries).map(e=>journal.prepare('SELECT * FROM perps_reservations WHERE reservation=?').get(e.reservation));
    validateStoredPerpsCloseCompletion(terminal,row,execution,conversion,parents);
   }
   // A recognized legacy archive may predate this column. New-schema rows
   // must retain the exact route/recipient and pending-conversion distinction.
   if(Object.hasOwn(row,'settlement')){
    let settlement;try{settlement=JSON.parse(row.settlement);}catch{fail();}
    if(canonicalPerpsCloseSettlement(settlement,{walletAddress:row.wallet,positionAddress:row.position})!==row.settlement)fail();
   }
   let entries;try{entries=JSON.parse(row.entries);}catch{fail();}
   if(!Array.isArray(entries)||!entries.length)fail();
   for(const entry of entries){
    const parent=journal.prepare('SELECT * FROM perps_reservations WHERE reservation=?').get(entry.reservation);
    if(!parent||parent.wallet!==row.wallet||parent.position_address!==row.position||entry.signature!==parent.signature
     ||entry.wire_hash!==parent.wire_hash||entry.confirmed_slot!==parent.confirmed_slot||entry.entry_exit_plan!==parent.entry_exit_plan)fail();
   }
  }
 }
 if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_exit_cancellations'").get()){
  const attempts=journal.prepare('SELECT c.wallet,c.reservation,c.address,r.wallet AS parent_wallet,b.reservation AS bound_reservation FROM perps_exit_cancellations c JOIN perps_reservations r ON r.reservation=c.reservation JOIN perps_exit_request_bindings b ON b.address=c.address').all();
  for(const row of attempts)if(!bound.has(row.wallet)||row.wallet!==row.parent_wallet||row.reservation!==row.bound_reservation)fail();
 }
 if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_position_close_executions'").get()){
  for(const execution of journal.prepare('SELECT * FROM perps_position_close_executions').all()){
   const parent=journal.prepare('SELECT * FROM perps_position_closes WHERE id=?').get(execution.close_id);
   if(!parent||!bound.has(parent.wallet))fail();validateStoredPerpsCloseExecution(execution,parent);
   for(const entry of JSON.parse(parent.entries)){
    if(journal.prepare('SELECT state FROM perps_reservations WHERE reservation=?').get(entry.reservation)?.state!==(parent.state==='COMPLETED'?'CLOSED':'OPEN'))fail();
   }
  }
 }
 if(journal.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='perps_close_conversions'").get()){
  for(const row of journal.prepare('SELECT * FROM perps_close_conversions').all()){
   const parent=journal.prepare('SELECT * FROM perps_position_closes WHERE id=?').get(row.close_id);
   const execution=journal.prepare('SELECT * FROM perps_position_close_executions WHERE close_id=?').get(row.close_id);
   if(!parent||!bound.has(parent.wallet))fail();validateStoredPerpsCloseConversion(row,parent,execution);
  }
 }
 for(const row of controls.prepare('SELECT DISTINCT wallet FROM perps_automation_audit').all())if(!bound.has(row.wallet))fail();
 return rows;
}
function encoded(kind,data){return {kind,data:data.toString('base64'),sha256:hash(data)};}
function decode(input){
 if(!Array.isArray(input)||![2,3,4,5].includes(input.length))fail();const result=new Map();
 for(const item of input){
  if(!item||Object.keys(item).sort().join(',')!=='data,kind,sha256'||!Object.hasOwn(SCHEMAS,item.kind)||result.has(item.kind)||typeof item.data!=='string'||item.data.length>Math.ceil(MAX/3)*4)fail();
  const bytes=Buffer.from(item.data,'base64');if(bytes.length<512||bytes.length>MAX||bytes.toString('base64')!==item.data||hash(bytes)!==item.sha256||bytes.subarray(0,16).toString()!=='SQLite format 3\u0000')fail();result.set(item.kind,bytes);
 }
 if(!result.has('controls')||!result.has('journal')||result.has('fees')!==result.has('payments'))fail();return result;
}
export async function withLockedPerpsRuntimeRecoverySnapshot({controlsPath,journalPath,feesPath,paymentsPath,swapsPath,temporaryDirectory,allowNonPosixForTests=false}={},fn){
 const opened=[],locked=[];let work;
 try{
  if(typeof fn!=='function'||controlsPath===journalPath)fail();
  const paths={controls:secure(controlsPath,false,allowNonPosixForTests),journal:secure(journalPath,false,allowNonPosixForTests)};
  if((feesPath===undefined)!==(paymentsPath===undefined))fail();
  if(feesPath!==undefined){paths.fees=secure(feesPath,false,allowNonPosixForTests);paths.payments=secure(paymentsPath,false,allowNonPosixForTests);}
  if(swapsPath!==undefined)paths.swaps=secure(swapsPath,false,allowNonPosixForTests);
  const fileIds=new Set();for(const path of Object.values(paths)){const stat=lstatSync(path,{bigint:true}),identity=stat.dev+':'+stat.ino;if(fileIds.has(identity))fail();fileIds.add(identity);}
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
  for(const kind of Object.keys(paths)){
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
  for(const kind of decoded.keys()){
   const path=join(work.path,kind+'.sqlite');writePrivateRecoveryFile(path,decoded.get(kind),allowNonPosixForTests);
   const db=open(path);opened.push(db);verify(db,kind);databases[kind]=db;
  }
  const rows=inventory(databases.controls,databases.journal,identities,databases.fees,databases.payments);
  if(databases.swaps){
   const owners=new Map(identities.map(who=>[who.ownerAccountHash,who.walletAddress]));
   for(const row of databases.swaps.prepare('SELECT * FROM bot_wallet_swaps').all()){
    verifyBotSwapStoredRecord(row);if(owners.get(row.owner)!==row.wallet)fail();
   }
  }
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
  return [...decoded.keys()].map(kind=>{
   const path=join(work.path,kind+'.sqlite'),fd=openSync(path,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
   const data=readPrivateRecoveryFile(path,MAX,allowNonPosixForTests);return encoded(kind,data);
  });
 }catch{fail();}
 finally{for(const db of opened)try{db.close();}catch{}work?.remove();}
}
