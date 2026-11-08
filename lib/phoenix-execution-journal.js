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

const tables={
 phoenix_workflows:"CREATE TABLE phoenix_workflows(id TEXT PRIMARY KEY,owner TEXT NOT NULL,wallet TEXT NOT NULL,child INTEGER NOT NULL,symbol TEXT NOT NULL,revision TEXT NOT NULL,margin TEXT NOT NULL,fee_terms TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('HELD','OPEN','SETTLING','RECOVERY_REQUIRED','ABORTED','PAYOUT_PENDING','CANONICAL_READY','COMPLETE')),created INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT",
 phoenix_order_attempts:"CREATE TABLE phoenix_order_attempts(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,workflow TEXT NOT NULL REFERENCES phoenix_workflows(id),owner TEXT NOT NULL,wallet TEXT NOT NULL,revision TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('OPEN','CLOSE','WITHDRAW','UNWRAP')),message TEXT NOT NULL,last_height TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('PREPARED','SIGNED','UNKNOWN','FINALIZED','CANCELLED')),signature TEXT UNIQUE,signed TEXT,archive TEXT,receipt TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT"
};
const indexes={phoenix_child_held:"CREATE UNIQUE INDEX phoenix_child_held ON phoenix_workflows(wallet,child) WHERE state NOT IN('ABORTED','COMPLETE')",phoenix_wallet_pending:"CREATE UNIQUE INDEX phoenix_wallet_pending ON phoenix_order_attempts(wallet) WHERE state IN('PREPARED','SIGNED','UNKNOWN')"};
export const PHOENIX_EXECUTION_SCHEMA_SQL=[...Object.values(tables),...Object.values(indexes)].join(';')+';';
export const PHOENIX_EXECUTION_SCHEMA_HASH=createHash('sha256').update(JSON.stringify([
 ...Object.entries(indexes).map(([name,sql])=>({type:'index',name,tbl_name:name==='phoenix_child_held'?'phoenix_workflows':'phoenix_order_attempts',sql})),
 ...Object.entries(tables).sort(([a],[b])=>a.localeCompare(b)).map(([name,sql])=>({type:'table',name,tbl_name:name,sql}))
])).digest('hex');
const journals=new WeakSet(),claims=new WeakMap();
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
    decoded.instructions.length!==({OPEN:6,CLOSE:3,WITHDRAW:4,UNWRAP:6}[row.kind])||row.last_height==='0'||!['PREPARED','SIGNED','UNKNOWN','FINALIZED','CANCELLED'].includes(row.state))fail();
 if(['PREPARED','CANCELLED'].includes(row.state)){
  if([row.signature,row.signed,row.archive,row.receipt].some(v=>v!==null))fail();
 }else{
  key(row.signature,64);const signed=b64(row.signed),archive=JSON.parse(row.archive);
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bs58.decode(row.wallet))]),format:'der',type:'spki'});
  if(signed.length!==message.length+65||signed[0]!==1||!signed.subarray(65).equals(message)||bs58.encode(signed.subarray(1,65))!==row.signature||
     !verify(null,message,publicKey,signed.subarray(1,65))||archive.walletAddress!==row.wallet||archive.serializedTxBase64!==row.signed||
     (['OPEN','CLOSE'].includes(row.kind)?archive.close!==(row.kind==='CLOSE'):archive.phase!==row.kind))fail();
  if(row.state==='FINALIZED'){
   const r=JSON.parse(row.receipt);if(r.stage!==(['OPEN','CLOSE'].includes(row.kind)?'PHOENIX_FINALIZED_ORDER':'PHOENIX_FINALIZED_COLLATERAL')||r.signature!==row.signature)fail();afterReceipt(row.kind,r);
  }else if(row.receipt!==null)fail();
 }
 return row;
}
export {workflow as verifyPhoenixStoredWorkflow,attempt as verifyPhoenixStoredOrderAttempt};
export function verifyPhoenixJournalInventory(db,identities=null){
 const owners=identities&&new Map(identities.map(v=>[v.ownerAccountHash,v.walletAddress]));
 const flows=db.prepare('SELECT * FROM phoenix_workflows').all();
 for(const f of flows){
  workflow(f);if(owners&&owners.get(f.owner)!==f.wallet)fail();
  const rows=db.prepare('SELECT * FROM phoenix_order_attempts WHERE workflow=? ORDER BY sequence').all(f.id);
  if(!rows.length)fail();let state='HELD',pending=false;
  for(let i=0;i<rows.length;i++){
   const a=attempt(rows[i]);if(a.owner!==f.owner||a.wallet!==f.wallet||pending||(i===0&&a.kind!=='OPEN')||state!==beforeKind[a.kind])fail();
   if(a.archive){const r=JSON.parse(a.archive);if(['OPEN','CLOSE'].includes(a.kind)?r.symbol!==f.symbol||r.isolatedSubaccountIndex!==f.child||a.kind==='OPEN'&&r.marginUsdcUnits!==f.margin:r.subaccountIndex!==f.child)fail();}
   if(a.state==='CANCELLED'){state=a.kind==='OPEN'?'ABORTED':beforeKind[a.kind];continue;}
   if(a.state!=='FINALIZED'){pending=true;continue;}
   const result=JSON.parse(a.receipt);
   if(a.kind==='UNWRAP'){
    const source=rows.slice(0,i).findLast(r=>r.kind==='WITHDRAW'&&r.state==='FINALIZED'&&JSON.parse(r.receipt).state==='CANONICAL_RECEIVED');
    if(!source||result.payoutSignature!==source.signature||JSON.parse(a.archive).payoutArchive?.serializedTxBase64!==source.signed||JSON.parse(a.archive).amountUnits!==JSON.parse(source.archive).amountUnits)fail();
   }
   state=afterReceipt(a.kind,result);
  }
  if(state!==f.state)fail();
 }
 if(db.prepare('SELECT 1 FROM phoenix_order_attempts a LEFT JOIN phoenix_workflows f ON a.workflow=f.id WHERE f.id IS NULL LIMIT 1').get())fail();
 return Object.freeze({stage:'PHOENIX_STORED_INVENTORY_VERIFIED',readyForSigning:false});
}
export function requirePhoenixExecutionJournal(value){if(!journals.has(value))fail();return value;}
export function requirePhoenixOrderClaim(value,journal){
 const p=claims.get(value);if(!p||p.journal!==requirePhoenixExecutionJournal(journal))fail();
 const row=journal.readAttempt(p.id,p.owner);if(!row||row.state!=='PREPARED'||row.message!==p.message)fail();return row;
}

export function openPhoenixExecutionJournal(path,{initialize=false,explicitOperatorApproval=false,allowNonPosixForTests=false,now=Date.now}={}){
 if(typeof now!=='function')fail();check(dirname(path),true,allowNonPosixForTests);
 if(!existsSync(path)){if(!initialize||explicitOperatorApproval!==true)fail();write(path,new Uint8Array(),allowNonPosixForTests);}
 const original=check(path,false,allowNonPosixForTests).stat,db=new DatabaseSync(path,{timeout:5000});let closed=false;
 const normalize=s=>s.replace(/\s+/g,' ').trim();
 const expected=[...Object.entries(tables).map(([name,sql])=>({type:'table',name,tbl_name:name,sql:normalize(sql)})),
  ...Object.entries(indexes).map(([name,sql])=>({type:'index',name,tbl_name:name==='phoenix_child_held'?'phoenix_workflows':'phoenix_order_attempts',sql:normalize(sql)}))].sort((a,b)=>a.name.localeCompare(b.name));
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
  readAttempt(id,owner){time();const r=db.prepare('SELECT * FROM phoenix_order_attempts WHERE id=? AND owner=?').get(hex(id),hex(owner));return r?attempt({...r}):null;},
  readWorkflow(id,owner){time();const r=db.prepare('SELECT * FROM phoenix_workflows WHERE id=? AND owner=?').get(hex(id),hex(owner));return r?workflow({...r}):null;},
  pending(wallet){time();return db.prepare("SELECT * FROM phoenix_order_attempts WHERE wallet=? AND state IN('PREPARED','SIGNED','UNKNOWN') ORDER BY sequence").all(key(wallet)).map(r=>attempt({...r}));},
  heldWorkflows(wallet){time();return db.prepare("SELECT * FROM phoenix_workflows WHERE wallet=? AND state NOT IN('ABORTED','COMPLETE') ORDER BY created,id").all(key(wallet)).map(r=>workflow({...r}));},
  prepareOrder({id,workflowId,ownerAccountHash,controlRevision,wire,simulation,request}={}){return transaction(()=>{
   hex(id);hex(workflowId);hex(ownerAccountHash);revision(controlRevision);
   const {review}=requirePhoenixUnsignedWire(wire),plan=review.plan;
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
  persistSigned(claim,signedBase64){return transaction(()=>{
   const row=requirePhoenixOrderClaim(claim,api),p=claims.get(claim);
   let value,archive;
   if(p.collateral){requirePhoenixCollateralSimulation(p.simulation,{wire:p.wire,request:p.request});value=capturePhoenixSignedCollateral(p.wire,signedBase64,{payout:p.payout});archive=archivePhoenixSignedCollateral(value);}
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
   db.prepare('UPDATE phoenix_workflows SET state=?,updated=? WHERE id=?').run(row.kind==='OPEN'?'ABORTED':beforeKind[row.kind],time(),row.workflow);
   return api.readAttempt(id,owner);
  });},
  async recoveryEvidence(id,owner){const row=api.readAttempt(id,owner);if(!row||!row.archive)fail();return ['OPEN','CLOSE'].includes(row.kind)?restorePhoenixSignedOrder(JSON.parse(row.archive)):restorePhoenixSignedCollateral(JSON.parse(row.archive));},
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
  });}
 };
 journals.add(api);return Object.freeze(api);
}
