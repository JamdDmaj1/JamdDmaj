// Private single-host native order/settlement ledger. This stores reservations and exact
// attempts, but grants no signing permission and has no network/broadcast API.
// A workflow remains held across fill/close/withdrawal boundaries. No automatic
// release is implemented before a separately verified settlement boundary.
import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,createPublicKey,verify} from 'node:crypto';
import bs58 from 'bs58';
import {getCompiledTransactionMessageDecoder} from '@solana/kit';
import {requirePhoenixUnsignedWire} from './phoenix-order-wire.js';
import {requirePhoenixSimulatedOrder} from './phoenix-order-simulation.js';
import {capturePhoenixSignedOrder,archivePhoenixSignedOrder,restorePhoenixSignedOrder,requirePhoenixFinalizedOrder} from './phoenix-order-receipt.js';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write} from './perps-recovery-private-files.js';
import {quotePerpsPlatformFee} from './perps-platform-fee.js';
import {requirePhoenixCollateralWire,requirePhoenixCollateralSimulation} from './phoenix-collateral-simulation.js';
import {capturePhoenixSignedCollateral,archivePhoenixSignedCollateral,restorePhoenixSignedCollateral,requirePhoenixFinalizedCollateral,requirePhoenixCanonicalPayout} from './phoenix-collateral-receipt.js';
import {requirePhoenixFeePaymentReview,capturePhoenixSignedFee,revalidatePhoenixSignedFee,reconcilePhoenixFee,requirePhoenixFeeReceipt} from './phoenix-platform-fee-payment.js';
import {requirePhoenixPlatformFeeAssessment,assessPhoenixPlatformFee} from './phoenix-platform-fee-assessment.js';
import {requirePhoenixParentOnboarding,requirePhoenixParentSimulation} from './phoenix-parent-onboarding.js';
import {capturePhoenixParentSignature} from './phoenix-parent-signature.js';
import {verifyPhoenixStoredParentAttempt} from './phoenix-parent-stored.js';

const tables={
 phoenix_setup_attempts:"CREATE TABLE phoenix_setup_attempts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase='PARENT'),parent TEXT NOT NULL,message TEXT NOT NULL,message_hash TEXT NOT NULL,last_height TEXT NOT NULL,maximum_lamports TEXT NOT NULL,expires INTEGER NOT NULL,preparation TEXT NOT NULL,simulation TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('PREPARED','SIGNED','UNKNOWN','CANCELLED')),signature TEXT UNIQUE,signed TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT",
 phoenix_workflows:"CREATE TABLE phoenix_workflows(id TEXT PRIMARY KEY,owner TEXT NOT NULL,wallet TEXT NOT NULL,child INTEGER NOT NULL,symbol TEXT NOT NULL,revision TEXT NOT NULL,margin TEXT NOT NULL,fee_terms TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('HELD','OPEN','SETTLING','RECOVERY_REQUIRED','ABORTED','PAYOUT_PENDING','CANONICAL_READY','COMPLETE')),created INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT",
 phoenix_order_attempts:"CREATE TABLE phoenix_order_attempts(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,workflow TEXT NOT NULL REFERENCES phoenix_workflows(id),owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('OPEN','CLOSE','WITHDRAW','UNWRAP','FEE')),message TEXT NOT NULL,last_height TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('PREPARED','SIGNED','UNKNOWN','FINALIZED','CANCELLED')),signature TEXT UNIQUE,signed TEXT,archive TEXT,receipt TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT",
 phoenix_close_consents:"CREATE TABLE phoenix_close_consents(attempt TEXT PRIMARY KEY REFERENCES phoenix_order_attempts(id),workflow TEXT NOT NULL REFERENCES phoenix_workflows(id),owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL,message_hash TEXT NOT NULL,maximum_lamports TEXT NOT NULL,accepted INTEGER NOT NULL,expires INTEGER NOT NULL) STRICT",
 phoenix_fee_consents:"CREATE TABLE phoenix_fee_consents(workflow TEXT PRIMARY KEY REFERENCES phoenix_workflows(id),attempt TEXT NOT NULL REFERENCES phoenix_order_attempts(id),owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL,terms TEXT NOT NULL,maximum_lamports TEXT NOT NULL,accepted INTEGER NOT NULL,expires INTEGER NOT NULL) STRICT"
};
const indexes={phoenix_setup_pending:"CREATE UNIQUE INDEX phoenix_setup_pending ON phoenix_setup_attempts(wallet) WHERE state IN('PREPARED','SIGNED','UNKNOWN')",phoenix_child_held:"CREATE UNIQUE INDEX phoenix_child_held ON phoenix_workflows(wallet,child) WHERE state NOT IN('ABORTED','COMPLETE')",phoenix_wallet_pending:"CREATE UNIQUE INDEX phoenix_wallet_pending ON phoenix_order_attempts(wallet) WHERE state IN('PREPARED','SIGNED','UNKNOWN')"};
const indexTable=name=>name==='phoenix_child_held'?'phoenix_workflows':name==='phoenix_setup_pending'?'phoenix_setup_attempts':'phoenix_order_attempts';
export const PHOENIX_EXECUTION_SCHEMA_SQL=[...Object.values(tables),...Object.values(indexes)].join(';')+';';
export const PHOENIX_EXECUTION_SCHEMA_HASH=createHash('sha256').update(JSON.stringify([
 ...Object.entries(indexes).sort(([a],[b])=>a.localeCompare(b)).map(([name,sql])=>({type:'index',name,tbl_name:indexTable(name),sql})),
 ...Object.entries(tables).sort(([a],[b])=>a.localeCompare(b)).map(([name,sql])=>({type:'table',name,tbl_name:name,sql}))
])).digest('hex');
const journals=new WeakSet(),claims=new WeakMap(),parentClaims=new WeakMap();
const fail=()=>{throw Error('PHOENIX_JOURNAL_UNAVAILABLE');};
const hash=b=>createHash('sha256').update(b).digest('hex');
function hex(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail();return v;}
function key(v,n=32){if(typeof v!=='string'||v.length>88)fail();try{if(bs58.decode(v).length!==n||bs58.encode(bs58.decode(v))!==v)fail();}catch{fail();}return v;}
function revision(v){if(typeof v!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(v))fail();return v;}
function units(v){if(typeof v!=='string'||!/^(0|[1-9]\d{0,19})$/.test(v)||BigInt(v)>18446744073709551615n)fail();return v;}
function b64(v,max=1232){if(typeof v!=='string'||v.length>Math.ceil(max/3)*4)fail();const b=Buffer.from(v,'base64');if(b.length<1||b.length>max||b.toString('base64')!==v)fail();return b;}
function times(row){if(!Number.isSafeInteger(row.created)||!Number.isSafeInteger(row.updated)||row.created<0||row.updated<row.created)fail();}
const beforeKind={OPEN:'HELD',CLOSE:'OPEN',WITHDRAW:'SETTLING',UNWRAP:'CANONICAL_READY'};
function afterReceipt(kind,r){
 if(kind==='FEE'){if(!['PAID','FAILED'].includes(r.state))fail();return null;}
 const allowed={OPEN:['POSITION_OPEN','FAILED','NO_FILL'],CLOSE:['POSITION_CLOSED','FAILED','NO_FILL'],WITHDRAW:['CANONICAL_RECEIVED','AWAITING_PAYOUT','FAILED'],UNWRAP:['USDC_RECEIVED','FAILED']};
 if(!allowed[kind]?.includes(r.state))fail();
 if(kind==='WITHDRAW')return r.state==='CANONICAL_RECEIVED'?'CANONICAL_READY':r.state==='FAILED'?'SETTLING':'PAYOUT_PENDING';
 if(kind==='UNWRAP')return r.state==='USDC_RECEIVED'?'COMPLETE':'CANONICAL_READY';
 return r.state==='POSITION_OPEN'?'OPEN':r.state==='POSITION_CLOSED'||r.state==='NO_FILL'&&kind==='OPEN'?'SETTLING':kind==='CLOSE'?'OPEN':'RECOVERY_REQUIRED';
}
function workflow(row){
 hex(row.id);hex(row.owner);key(row.wallet);revision(row.revision);units(row.margin);times(row);
 if(!Number.isInteger(row.child)||row.child<1||row.child>255||typeof row.symbol!=='string'||!/^[A-Za-z0-9_-]{1,16}$/.test(row.symbol)||
    !['HELD','OPEN','SETTLING','RECOVERY_REQUIRED','ABORTED','PAYOUT_PENDING','CANONICAL_READY','COMPLETE'].includes(row.state)||row.fee_terms!==JSON.stringify(quotePerpsPlatformFee(row.margin)))fail();return row;
}
function attempt(row){
 hex(row.id);hex(row.workflow);hex(row.owner);key(row.wallet);revision(row.revision);units(row.last_height);times(row);
 const message=b64(row.message,1167),decoded=getCompiledTransactionMessageDecoder().decode(message);
 if(!Number.isSafeInteger(row.sequence)||row.sequence<1||decoded.version!=='legacy'||decoded.header.numSignerAccounts!==1||decoded.staticAccounts[0]!==row.wallet||
    decoded.instructions.length!==({OPEN:6,CLOSE:3,WITHDRAW:4,UNWRAP:6,FEE:2}[row.kind])||row.last_height==='0'||!['PREPARED','SIGNED','UNKNOWN','FINALIZED','CANCELLED'].includes(row.state))fail();
 if(['PREPARED','CANCELLED'].includes(row.state)){
  if([row.signature,row.signed,row.archive,row.receipt].some(v=>v!==null))fail();
 }else{
  key(row.signature,64);const signed=b64(row.signed),archive=JSON.parse(row.archive);
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(row.wallet))]),format:'der',type:'spki'});
  if(signed.length!==message.length+65||signed[0]!==1||!signed.subarray(65).equals(message)||bs58.encode(signed.subarray(1,65))!==row.signature||
     !verify(null,message,publicKey,signed.subarray(1,65))||archive.walletAddress!==row.wallet||archive.serializedTxBase64!==row.signed||
     (['OPEN','CLOSE'].includes(row.kind)?archive.close!==(row.kind==='CLOSE'):archive.phase!==row.kind))fail();
  if(row.state==='FINALIZED'){
   const r=JSON.parse(row.receipt);if(r.stage!==(row.kind==='FEE'?'PHOENIX_FINALIZED_FEE':['OPEN','CLOSE'].includes(row.kind)?'PHOENIX_FINALIZED_ORDER':'PHOENIX_FINALIZED_COLLATERAL')||r.signature!==row.signature)fail();afterReceipt(row.kind,r);
  }else if(row.receipt!==null)fail();
 }
 return row;
}
export {workflow as verifyPhoenixStoredWorkflow,attempt as verifyPhoenixStoredOrderAttempt};
function closeConsent(row,source){
 hex(row.attempt);hex(row.workflow);hex(row.owner);key(row.wallet);revision(row.revision);hex(row.message_hash);units(row.maximum_lamports);
 if(!source||source.id!==row.attempt||source.workflow!==row.workflow||source.owner!==row.owner||source.wallet!==row.wallet||source.revision!==row.revision||source.kind!=='CLOSE'||
    hash(Buffer.from(source.message,'base64'))!==row.message_hash||!Number.isSafeInteger(row.accepted)||row.accepted<source.created||!Number.isSafeInteger(row.expires)||
    row.expires<=row.accepted||row.expires-row.accepted>900000||BigInt(row.maximum_lamports)<5000n||BigInt(row.maximum_lamports)>50000000n)fail();return row;
}
function feeConsent(row,source,f){
 hex(row.workflow);hex(row.attempt);hex(row.owner);key(row.wallet);revision(row.revision);units(row.maximum_lamports);
 if(!source||!f||source.kind!=='OPEN'||source.id!==row.attempt||source.workflow!==row.workflow||source.owner!==row.owner||source.wallet!==row.wallet||source.revision!==row.revision||
    row.terms!==f.fee_terms||!Number.isSafeInteger(row.accepted)||row.accepted<source.created||!Number.isSafeInteger(row.expires)||row.expires<=row.accepted||row.expires-row.accepted>900000||
    BigInt(row.maximum_lamports)<1n||BigInt(row.maximum_lamports)>10000000n)fail();return row;
}
export function verifyPhoenixJournalInventory(db,identities=null){
 const owners=identities&&new Map(identities.map(v=>[v.ownerAccountHash,v.walletAddress]));
 for(const row of db.prepare('SELECT * FROM phoenix_setup_attempts').all()){
  verifyPhoenixStoredParentAttempt(row);if(owners&&owners.get(row.owner)!==row.wallet)fail();
  if(row.state!=='CANCELLED'&&db.prepare("SELECT 1 FROM phoenix_order_attempts WHERE wallet=? AND state IN('PREPARED','SIGNED','UNKNOWN') LIMIT 1").get(row.wallet))fail();
 }
 const flows=db.prepare('SELECT * FROM phoenix_workflows').all();
 for(const f of flows){
  workflow(f);if(owners&&owners.get(f.owner)!==f.wallet)fail();
  const rows=db.prepare('SELECT * FROM phoenix_order_attempts WHERE workflow=? ORDER BY sequence').all(f.id);
  if(!rows.length)fail();let state='HELD',pending=false;
  for(let i=0;i<rows.length;i++){
   const a=attempt(rows[i]);if(a.owner!==f.owner||a.wallet!==f.wallet||pending||(i===0&&a.kind!=='OPEN')||a.kind!=='FEE'&&state!==beforeKind[a.kind])fail();
   if(a.archive){const r=JSON.parse(a.archive);if(['OPEN','CLOSE'].includes(a.kind)?r.symbol!==f.symbol||r.isolatedSubaccountIndex!==f.child||a.kind==='OPEN'&&r.marginUsdcUnits!==f.margin:r.subaccountIndex!==f.child)fail();}
   if(a.kind==='FEE'){
    const opening=rows.find(r=>r.kind==='OPEN'&&r.state==='FINALIZED'&&JSON.parse(r.receipt).state==='POSITION_OPEN'),c=db.prepare('SELECT * FROM phoenix_fee_consents WHERE workflow=?').get(f.id);
    if(!opening||!c||rows.slice(0,i).some(r=>r.kind==='FEE'&&r.state==='FINALIZED'&&JSON.parse(r.receipt).state==='PAID'))fail();
    if(a.archive){const ar=JSON.parse(a.archive),expected=hash(JSON.stringify(['phoenix',JSON.parse(f.fee_terms).version,f.wallet,opening.signature]));
     if(ar.openingSignature!==opening.signature||ar.assessmentId!==expected||ar.review?.feeUnits!==JSON.parse(f.fee_terms).feeUnits||ar.workflowId!==f.id)fail();}
   }
   if(a.state==='CANCELLED'){if(a.kind!=='FEE')state=a.kind==='OPEN'?'ABORTED':beforeKind[a.kind];continue;}
   if(a.state!=='FINALIZED'){pending=true;continue;}
   const result=JSON.parse(a.receipt);
   if(a.kind==='UNWRAP'){
    const source=rows.slice(0,i).findLast(r=>r.kind==='WITHDRAW'&&r.state==='FINALIZED'&&JSON.parse(r.receipt).state==='CANONICAL_RECEIVED');
    if(!source||result.payoutSignature!==source.signature||JSON.parse(a.archive).payoutArchive?.serializedTxBase64!==source.signed||JSON.parse(a.archive).amountUnits!==JSON.parse(source.archive).amountUnits)fail();
   }
   state=afterReceipt(a.kind,result)??state;
  }
  if(state!==f.state)fail();
 }
 if(db.prepare('SELECT 1 FROM phoenix_order_attempts a LEFT JOIN phoenix_workflows f ON a.workflow=f.id WHERE f.id IS NULL LIMIT 1').get())fail();
 for(const c of db.prepare('SELECT * FROM phoenix_close_consents').all())closeConsent(c,db.prepare('SELECT * FROM phoenix_order_attempts WHERE id=?').get(c.attempt));
 for(const c of db.prepare('SELECT * FROM phoenix_fee_consents').all())feeConsent(c,db.prepare('SELECT * FROM phoenix_order_attempts WHERE id=?').get(c.attempt),db.prepare('SELECT * FROM phoenix_workflows WHERE id=?').get(c.workflow));
 return Object.freeze({stage:'PHOENIX_STORED_INVENTORY_VERIFIED',readyForSigning:false});
}
export function requirePhoenixExecutionJournal(value){if(!journals.has(value))fail();return value;}
export function requirePhoenixOrderClaim(value,journal){
 const p=claims.get(value);if(!p||p.journal!==requirePhoenixExecutionJournal(journal))fail();
 const row=journal.readAttempt(p.id,p.owner);if(!row||row.state!=='PREPARED'||row.message!==p.message)fail();return row;
}
export function requirePhoenixParentClaim(value,journal){const p=parentClaims.get(value);
 if(!p||p.journal!==requirePhoenixExecutionJournal(journal))fail();const row=journal.readParentAttempt(p.id,p.owner);
 if(row?.state!=='PREPARED'||row.message!==p.preparation.messageBase64)fail();return row;
}

export function openPhoenixExecutionJournal(path,{initialize=false,explicitOperatorApproval=false,allowNonPosixForTests=false,now=Date.now}={}){
 if(typeof now!=='function')fail();check(dirname(path),true,allowNonPosixForTests);
 if(!existsSync(path)){if(!initialize||explicitOperatorApproval!==true)fail();write(path,new Uint8Array(),allowNonPosixForTests);}
 const original=check(path,false,allowNonPosixForTests).stat,db=new DatabaseSync(path,{timeout:5000});let closed=false;
 const normalize=s=>s.replace(/\s+/g,' ').trim();
 const expected=[...Object.entries(tables).map(([name,sql])=>({type:'table',name,tbl_name:name,sql:normalize(sql)})),
  ...Object.entries(indexes).map(([name,sql])=>({type:'index',name,tbl_name:indexTable(name),sql:normalize(sql)}))].sort((a,b)=>a.name.localeCompare(b.name));
 const schema=()=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>({...r,sql:normalize(r.sql)}));
 const verifySchema=()=>{if(hash(JSON.stringify(schema()))!==hash(JSON.stringify(expected)))fail();};
 try{
  if(schema().length)verifySchema();
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  if(!schema().length){if(!initialize||explicitOperatorApproval!==true)fail();db.exec('BEGIN IMMEDIATE;'+PHOENIX_EXECUTION_SCHEMA_SQL+'COMMIT;');}
  verifySchema();if(db.prepare('PRAGMA integrity_check').all().some(r=>Object.values(r)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)fail();
  verifyPhoenixJournalInventory(db);
 }catch(error){db.close();throw error;}
 function time(){
  if(closed)fail();check(dirname(path),true,allowNonPosixForTests);const stat=check(path,false,allowNonPosixForTests).stat;
  if(stat.ino!==original.ino||stat.dev!==original.dev)fail();verifySchema();const at=now();if(!Number.isSafeInteger(at)||at<0)fail();return at;
 }
 function transaction(fn){time();db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 const api={
  close(){if(!closed){closed=true;db.close();}},
  readParentAttempt(id,owner){time();const row=db.prepare('SELECT * FROM phoenix_setup_attempts WHERE id=? AND owner=?').get(hex(id),hex(owner));return row?verifyPhoenixStoredParentAttempt({...row}):null;},
  pendingParent(wallet){time();return db.prepare("SELECT * FROM phoenix_setup_attempts WHERE wallet=? AND state IN('PREPARED','SIGNED','UNKNOWN') ORDER BY created,id").all(key(wallet)).map(r=>verifyPhoenixStoredParentAttempt({...r}));},
  prepareParent({id,ownerAccountHash,controlRevision,preparation,simulation,request,maximumLamports,expiresAt,explicitApproval}={}){return transaction(()=>{
   hex(id);hex(ownerAccountHash);revision(controlRevision);requirePhoenixParentOnboarding(preparation);requirePhoenixParentSimulation(simulation,{preparation,request});
   if(explicitApproval!==true||api.pending(preparation.walletAddress).length)fail();const at=time();
   const row=verifyPhoenixStoredParentAttempt({id,owner:ownerAccountHash,wallet:preparation.walletAddress,revision:controlRevision,phase:'PARENT',parent:preparation.parentAddress,
    message:preparation.messageBase64,message_hash:preparation.messageHash,last_height:String(preparation.lastValidBlockHeight),maximum_lamports:units(maximumLamports),expires:expiresAt,
    preparation:JSON.stringify(preparation),simulation:JSON.stringify(simulation),state:'PREPARED',signature:null,signed:null,created:at,updated:at});
   db.prepare('INSERT INTO phoenix_setup_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.owner,row.wallet,row.revision,row.phase,row.parent,row.message,row.message_hash,
    row.last_height,row.maximum_lamports,row.expires,row.preparation,row.simulation,row.state,row.signature,row.signed,row.created,row.updated);
   const claim=Object.freeze({id});parentClaims.set(claim,{id,owner:ownerAccountHash,journal:api,preparation,simulation,request});return claim;
  });},
  persistSignedParent(claim,encoded){return transaction(()=>{
   const row=requirePhoenixParentClaim(claim,api),p=parentClaims.get(claim);if(row.expires<=time())fail();
   const proof=capturePhoenixParentSignature(p.preparation,p.simulation,encoded,{request:p.request});
   db.prepare("UPDATE phoenix_setup_attempts SET state='SIGNED',signature=?,signed=?,updated=? WHERE id=?").run(proof.signature,proof.serializedTxBase64,time(),row.id);
   return api.readParentAttempt(row.id,row.owner);
  });},
  markParentBroadcast(id,owner){return transaction(()=>{
   const row=api.readParentAttempt(id,owner);if(row?.state!=='SIGNED'||row.expires<=time())fail();
   db.prepare("UPDATE phoenix_setup_attempts SET state='UNKNOWN',updated=? WHERE id=?").run(time(),row.id);return api.readParentAttempt(id,owner);
  });},
  recoverUnsignedParent(id,owner){return transaction(()=>{
   const row=api.readParentAttempt(id,owner);if(row?.state!=='PREPARED')fail();db.prepare("UPDATE phoenix_setup_attempts SET state='CANCELLED',updated=? WHERE id=?").run(time(),row.id);return api.readParentAttempt(id,owner);
  });},
  readAttempt(id,owner){time();const r=db.prepare('SELECT * FROM phoenix_order_attempts WHERE id=? AND owner=?').get(hex(id),hex(owner));return r?attempt({...r}):null;},
  readWorkflow(id,owner){time();const r=db.prepare('SELECT * FROM phoenix_workflows WHERE id=? AND owner=?').get(hex(id),hex(owner));return r?workflow({...r}):null;},
  workflows(owner,wallet,limit=50){time();if(!Number.isInteger(limit)||limit<1||limit>50)fail();return db.prepare('SELECT * FROM phoenix_workflows WHERE owner=? AND wallet=? ORDER BY created DESC,id LIMIT ?').all(hex(owner),key(wallet),limit).map(r=>workflow({...r}));},
  workflowAttempts(id,owner){time();if(!api.readWorkflow(id,owner))fail();return db.prepare('SELECT * FROM phoenix_order_attempts WHERE workflow=? AND owner=? ORDER BY sequence').all(hex(id),hex(owner)).map(r=>attempt({...r}));},
  recordCloseConsent({id,ownerAccountHash,maximumLamports,expiresAt,explicitApproval}={}){return transaction(()=>{
   const row=api.readAttempt(id,ownerAccountHash);if(explicitApproval!==true||row?.state!=='PREPARED'||row.kind!=='CLOSE')fail();
   const consent=closeConsent({attempt:row.id,workflow:row.workflow,owner:row.owner,wallet:row.wallet,revision:row.revision,
    message_hash:hash(Buffer.from(row.message,'base64')),maximum_lamports:units(maximumLamports),accepted:time(),expires:expiresAt},row);
   db.prepare('INSERT INTO phoenix_close_consents VALUES(?,?,?,?,?,?,?,?,?)').run(consent.attempt,consent.workflow,consent.owner,consent.wallet,consent.revision,consent.message_hash,consent.maximum_lamports,consent.accepted,consent.expires);return {...consent};
  });},
  closeConsent(id,owner){time();if(!api.readWorkflow(id,owner))fail();const row=db.prepare('SELECT c.* FROM phoenix_close_consents c JOIN phoenix_order_attempts a ON c.attempt=a.id WHERE c.workflow=? AND c.owner=? ORDER BY a.sequence DESC LIMIT 1').get(hex(id),hex(owner));return row?closeConsent({...row},api.readAttempt(row.attempt,owner)):null;},
  recordFeeConsent({id,ownerAccountHash,termsVersion,maximumLamports,expiresAt,explicitApproval}={}){return transaction(()=>{
   const row=api.readAttempt(id,ownerAccountHash);if(explicitApproval!==true||row?.state!=='PREPARED'||row.kind!=='OPEN')fail();
   const f=api.readWorkflow(row.workflow,ownerAccountHash);if(JSON.parse(f.fee_terms).version!==termsVersion)fail();
   const c=feeConsent({workflow:f.id,attempt:row.id,owner:row.owner,wallet:row.wallet,revision:row.revision,terms:f.fee_terms,
    maximum_lamports:units(maximumLamports),accepted:time(),expires:expiresAt},row,f);
   db.prepare('INSERT INTO phoenix_fee_consents VALUES(?,?,?,?,?,?,?,?,?)').run(c.workflow,c.attempt,c.owner,c.wallet,c.revision,c.terms,c.maximum_lamports,c.accepted,c.expires);return {...c};
  });},
  feeConsent(id,owner){time();const f=api.readWorkflow(id,owner);if(!f)fail();const row=db.prepare('SELECT * FROM phoenix_fee_consents WHERE workflow=? AND owner=?').get(hex(id),hex(owner));return row?feeConsent({...row},api.readAttempt(row.attempt,owner),f):null;},
  pending(wallet){time();return [...db.prepare("SELECT * FROM phoenix_order_attempts WHERE wallet=? AND state IN('PREPARED','SIGNED','UNKNOWN') ORDER BY sequence").all(key(wallet)).map(r=>attempt({...r})),
   ...api.pendingParent(wallet).map(r=>({...r,kind:'PARENT',workflow:null}))];},
  heldWorkflows(wallet){time();return db.prepare("SELECT * FROM phoenix_workflows WHERE wallet=? AND state NOT IN('ABORTED','COMPLETE') ORDER BY created,id").all(key(wallet)).map(r=>workflow({...r}));},
  prepareOrder({id,workflowId,ownerAccountHash,controlRevision,wire,simulation,request}={}){return transaction(()=>{
   hex(id);hex(workflowId);hex(ownerAccountHash);revision(controlRevision);
   const {review}=requirePhoenixUnsignedWire(wire),plan=review.plan;
   if(api.pendingParent(plan.walletAddress).length)fail();
   requirePhoenixSimulatedOrder(simulation,{wire,request});
   const at=time(),f=api.readWorkflow(workflowId,ownerAccountHash);
   if(f){
    if(!plan.close||f.state!=='OPEN'||f.wallet!==plan.walletAddress||f.child!==plan.isolatedSubaccountIndex||f.symbol!==plan.symbol)fail();
   }else{
    if(plan.close)fail();
    db.prepare("INSERT INTO phoenix_workflows VALUES(?,?,?,?,?,?,?,?,'HELD',?,?)").run(workflowId,ownerAccountHash,plan.walletAddress,plan.isolatedSubaccountIndex,plan.symbol,controlRevision,plan.marginUsdcUnits,JSON.stringify(quotePerpsPlatformFee(plan.marginUsdcUnits)),at,at);
   }
   db.prepare("INSERT INTO phoenix_order_attempts VALUES(NULL,?,?,?,?,?,?,?,?,'PREPARED',NULL,NULL,NULL,NULL,?,?)").run(id,workflowId,ownerAccountHash,plan.walletAddress,controlRevision,plan.close?'CLOSE':'OPEN',wire.messageBase64,String(wire.lastValidBlockHeight),at,at);
   const claim=Object.freeze({id});claims.set(claim,{id,owner:ownerAccountHash,journal:api,message:wire.messageBase64,wire,simulation,request});return claim;
  });},
  prepareCollateral({id,workflowId,ownerAccountHash,controlRevision,wire,simulation,request,payout}={}){return transaction(()=>{
   hex(id);hex(workflowId);hex(ownerAccountHash);revision(controlRevision);
   const {preparation:p}=requirePhoenixCollateralWire(wire);requirePhoenixCollateralSimulation(simulation,{wire,request});
   if(api.pendingParent(p.walletAddress).length)fail();
   const f=api.readWorkflow(workflowId,ownerAccountHash);
   if(!f||f.state!==beforeKind[p.phase]||f.wallet!==p.walletAddress||f.child!==p.subaccountIndex)fail();
   if(p.phase==='UNWRAP'){
    requirePhoenixCanonicalPayout(payout,{walletAddress:f.wallet,subaccountIndex:f.child,amountUnits:p.amountUnits});
    const source=db.prepare("SELECT * FROM phoenix_order_attempts WHERE workflow=? AND kind='WITHDRAW' AND state='FINALIZED' ORDER BY sequence DESC LIMIT 1").get(f.id);
    if(!source||source.signature!==payout.signature||JSON.parse(source.receipt).state!=='CANONICAL_RECEIVED'||p.observedSlot<payout.slot)fail();
   }
   const at=time();db.prepare("INSERT INTO phoenix_order_attempts VALUES(NULL,?,?,?,?,?,?,?,?,'PREPARED',NULL,NULL,NULL,NULL,?,?)").run(id,workflowId,ownerAccountHash,p.walletAddress,controlRevision,p.phase,wire.messageBase64,String(wire.lastValidBlockHeight),at,at);
   const claim=Object.freeze({id});claims.set(claim,{id,owner:ownerAccountHash,journal:api,message:wire.messageBase64,wire,simulation,request,collateral:true,payout});return claim;
  });},
  prepareFee({id,ownerAccountHash,controlRevision,review}={}){return transaction(()=>{
   hex(id);hex(ownerAccountHash);revision(controlRevision);const p=requirePhoenixFeePaymentReview(review),a=requirePhoenixPlatformFeeAssessment(p.assessment);
   const f=api.readWorkflow(a.reservation,ownerAccountHash),c=f&&api.feeConsent(f.id,ownerAccountHash);
   if(api.pendingParent(review.walletAddress).length)fail();
   const spent=f?api.workflowAttempts(f.id,ownerAccountHash).filter(r=>r.kind==='FEE'&&r.state==='FINALIZED').reduce((n,r)=>n+BigInt(JSON.parse(r.receipt).networkFeeLamports),0n):0n;
   if(!f||f.wallet!==review.walletAddress||!c||c.revision!==controlRevision||c.expires<=time()||spent+BigInt(review.networkFeeLamports)>BigInt(c.maximum_lamports))fail();
   const at=time();db.prepare("INSERT INTO phoenix_order_attempts VALUES(NULL,?,?,?,?,?,?,?,?,'PREPARED',NULL,NULL,NULL,NULL,?,?)").run(id,f.id,ownerAccountHash,f.wallet,controlRevision,'FEE',review.messageBase64,String(review.lastValidBlockHeight),at,at);
   const claim=Object.freeze({id});claims.set(claim,{id,owner:ownerAccountHash,journal:api,message:review.messageBase64,fee:true,review});return claim;
  });},
  persistSigned(claim,signedBase64){return transaction(()=>{
   const row=requirePhoenixOrderClaim(claim,api),p=claims.get(claim);
   let value,archive;
   if(p.fee){archive=capturePhoenixSignedFee(p.review,signedBase64);value={signature:archive.signature};p.feeArchive=archive;}
   else if(p.collateral){requirePhoenixCollateralSimulation(p.simulation,{wire:p.wire,request:p.request});value=capturePhoenixSignedCollateral(p.wire,signedBase64,{payout:p.payout});archive=archivePhoenixSignedCollateral(value);}
   else{requirePhoenixSimulatedOrder(p.simulation,{wire:p.wire,request:p.request});value=capturePhoenixSignedOrder(p.wire,signedBase64);archive=archivePhoenixSignedOrder(value);}
   db.prepare("UPDATE phoenix_order_attempts SET state='SIGNED',signature=?,signed=?,archive=?,updated=? WHERE id=?").run(value.signature,signedBase64,JSON.stringify(archive),time(),row.id);
   return api.readAttempt(row.id,row.owner);
  });},
  markBroadcast(id,owner){return transaction(()=>{
   const row=api.readAttempt(id,owner);if(row?.state!=='SIGNED')fail();
   // Commit UNKNOWN before the caller is allowed to attempt a network send.
   db.prepare("UPDATE phoenix_order_attempts SET state='UNKNOWN',updated=? WHERE id=?").run(time(),row.id);return api.readAttempt(id,owner);
  });},
  recoverUnsignedOrder(id,owner){return transaction(()=>{
   const row=api.readAttempt(id,owner);if(row?.state!=='PREPARED'||row.signed!==null)fail();
   db.prepare("UPDATE phoenix_order_attempts SET state='CANCELLED',updated=? WHERE id=?").run(time(),row.id);
   if(row.kind!=='FEE')db.prepare('UPDATE phoenix_workflows SET state=?,updated=? WHERE id=?').run(row.kind==='OPEN'?'ABORTED':beforeKind[row.kind],time(),row.workflow);
   return api.readAttempt(id,owner);
  });},
  async revalidateFeeBeforeBroadcast(claim,options){const p=claims.get(claim);if(!p||p.journal!==api||!p.feeArchive||api.readAttempt(p.id,p.owner)?.state!=='SIGNED')fail();return revalidatePhoenixSignedFee(p.feeArchive,options);},
  async feeReceipt(id,owner,options){const row=api.readAttempt(id,owner);if(row?.kind!=='FEE'||!row.archive)fail();return reconcilePhoenixFee(JSON.parse(row.archive),options);},
  async recoveryEvidence(id,owner){const row=api.readAttempt(id,owner);if(!row||!row.archive||row.kind==='FEE')fail();return ['OPEN','CLOSE'].includes(row.kind)?restorePhoenixSignedOrder(JSON.parse(row.archive)):restorePhoenixSignedCollateral(JSON.parse(row.archive));},
  recordFinalized(id,owner,result){return transaction(()=>{
   const row=api.readAttempt(id,owner);if(row?.state!=='UNKNOWN')fail();requirePhoenixFinalizedOrder(result,{signature:row.signature});
   if((row.kind==='CLOSE'&&result.state==='POSITION_OPEN')||(row.kind==='OPEN'&&result.state==='POSITION_CLOSED'))fail();
   const state=afterReceipt(row.kind,result);
   db.prepare("UPDATE phoenix_order_attempts SET state='FINALIZED',receipt=?,updated=? WHERE id=?").run(JSON.stringify(result),time(),id);
   db.prepare('UPDATE phoenix_workflows SET state=?,updated=? WHERE id=?').run(state,time(),row.workflow);return api.readWorkflow(row.workflow,owner);
  });},
  recordFinalizedCollateral(id,owner,result){return transaction(()=>{
   const row=api.readAttempt(id,owner);if(row?.state!=='UNKNOWN'||!['WITHDRAW','UNWRAP'].includes(row.kind))fail();
   requirePhoenixFinalizedCollateral(result,{walletAddress:row.wallet,phase:row.kind,signature:row.signature});
   const f=api.readWorkflow(row.workflow,owner),archive=JSON.parse(row.archive);
   if(!f||f.state!==beforeKind[row.kind]||result.subaccountIndex!==f.child||result.amountUnits!==archive.amountUnits)fail();
   if(row.kind==='UNWRAP'){
    const source=db.prepare("SELECT * FROM phoenix_order_attempts WHERE workflow=? AND kind='WITHDRAW' AND state='FINALIZED' ORDER BY sequence DESC LIMIT 1").get(f.id);
    if(!source||result.payoutSignature!==source.signature||archive.payoutArchive?.serializedTxBase64!==source.signed)fail();
   }
   db.prepare("UPDATE phoenix_order_attempts SET state='FINALIZED',receipt=?,updated=? WHERE id=?").run(JSON.stringify(result),time(),id);
   db.prepare('UPDATE phoenix_workflows SET state=?,updated=? WHERE id=?').run(afterReceipt(row.kind,result),time(),f.id);return api.readWorkflow(f.id,owner);
  });},
  recordFinalizedFee(id,owner,result){return transaction(()=>{
   const row=api.readAttempt(id,owner);if(row?.state!=='UNKNOWN'||row.kind!=='FEE')fail();requirePhoenixFeeReceipt(result);
   const assessment=assessPhoenixPlatformFee({journal:api,workflowId:row.workflow,ownerAccountHash:owner});
   if(result.workflowId!==row.workflow||result.assessmentId!==assessment.id||result.signature!==row.signature||result.openingSignature!==assessment.opening_signature||
      result.walletAddress!==row.wallet||result.feeUnits!==assessment.fee)fail();
   db.prepare("UPDATE phoenix_order_attempts SET state='FINALIZED',receipt=?,updated=? WHERE id=?").run(JSON.stringify(result),time(),id);return api.readAttempt(id,owner);
  });}
 };
 journals.add(api);return Object.freeze(api);
}
