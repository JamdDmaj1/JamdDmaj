// Server-only durable risk reservations. No key storage, signer or network calls.
// A caller must supply authenticated settings and a reconciled mainnet snapshot.
// This journal is not an authorization boundary or a substitute for chain validation.
// Requires Node 22.16+ and a single durable server filesystem shared by workers.
// Never place this database in Vercel /tmp or replicate it across separate hosts.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import bs58 from 'bs58';
import {exactUsdUnits} from './jupiter-perps-order.js';
import {consumeWebPerpsRiskAuthorization} from './perps-web-risk-authorization.js';
import {consumeWebPerpsRiskSettlement} from './perps-web-risk-recovery.js';
import {isVerifiedPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {requireVerifiedServerPerpsPositionClosure,requireVerifiedServerPerpsExitCleanup,readVerifiedServerPerpsCloseCleanupBinding} from './perps-position-closure.js';
import {canonicalServerPerpsEntryExitPlan} from './perps-entry-exit-plan.js';
import {readSimulatedPerpsExitCancellationEvidence} from './perps-exit-cancellation-simulation.js';
import {readInspectedPerpsExitCancellationEvidence,perpsCancellationUnsignedWireHash} from './perps-exit-cancellation.js';
import {readServerPerpsFullCloseReserves} from './perps-server-close-reserves.js';
import {readServerPerpsFullCloseVaults} from './perps-server-close-vaults.js';
import {readServerPerpsFullCloseFunding} from './perps-server-close-funding.js';
import {readServerPerpsFullCloseSimulation} from './perps-server-close-simulation.js';
import {readInspectedServerPerpsFullClose} from './perps-server-close-bindings.js';
import {readServerPerpsFullCloseOracleEffects} from './perps-server-close-oracle-effects.js';
import {describeSimulatedPerpsCloseSettlement,canonicalPerpsCloseSettlement} from './perps-close-settlement.js';
import {readSimulatedPerpsCloseReturn} from './perps-close-return-policy.js';
import {readVerifiedPerpsCloseOwnerIntent,storeVerifiedPerpsClosePayout,validateStoredPerpsCloseExecution,perpsCloseExecutionParentBinding} from './perps-close-execution-record.js';
import {prepareJournaledPerpsCloseConversion,readJournaledPerpsCloseConversion} from './perps-journal-close-conversion.js';
import {readSimulatedPerpsCloseConversion} from './perps-close-conversion-simulation.js';
import {storedPerpsCloseConversionWire,inspectStoredPerpsCloseConversionWire,perpsCloseConversionPayoutBinding,validateStoredPerpsCloseConversion,readVerifiedPerpsCloseConversionIntent,storeVerifiedPerpsConversionReceipt} from './perps-close-conversion-record.js';
import {recoverRecordedPerpsCloseConversion} from './perps-close-conversion-recovery.js';
import {requireVerifiedPerpsCloseCompletion} from './perps-close-completion.js';
import {storedPerpsCloseCompletion,validateStoredPerpsCloseCompletion} from './perps-close-completion-record.js';
import {readPerpsPlatformFeePaymentReview,requirePerpsPlatformFeePaymentReceipt} from './perps-platform-fee-payment.js';
const pending="('RESERVED','SIGNING','UNCERTAIN')";
export const PERPS_PLATFORM_FEE_LOCK_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS perps_platform_fee_locks (
      assessment_id TEXT PRIMARY KEY, reservation TEXT NOT NULL UNIQUE REFERENCES perps_reservations(reservation),
      wallet TEXT NOT NULL, fee_units INTEGER NOT NULL CHECK(fee_units>0), review_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('HELD','PAID','FAILED')), created INTEGER NOT NULL,
      signature TEXT UNIQUE, receipt_json TEXT,
      CHECK((state='HELD' AND receipt_json IS NULL) OR (state!='HELD' AND signature IS NOT NULL AND receipt_json IS NOT NULL))
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS perps_platform_fee_wallet_lock ON perps_platform_fee_locks(wallet) WHERE state='HELD';`;
const executionJournals=new WeakSet();
export function requirePerpsExecutionJournal(value){if(!executionJournals.has(value))throw Error('DURABLE_EXECUTION_JOURNAL_REQUIRED');return value;}
// Only the explicitly approved, locked, verified-empty migration may use this
// fixed rebuild. The regular journal constructor never invokes it.
export const PERPS_EMPTY_CLOSE_REBUILD_SQL='DROP TABLE IF EXISTS perps_close_completions; DROP TABLE IF EXISTS perps_close_conversions; DROP TABLE IF EXISTS perps_position_close_executions; DROP TABLE IF EXISTS perps_position_closes;';
// Preparation is durable but cannot authorize custody signing. Later signing
// and reconciliation must be distinct reviewed capabilities, not state setters.
export const PERPS_POSITION_CLOSE_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS perps_position_closes (
 id TEXT PRIMARY KEY, wallet TEXT NOT NULL, position TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PREPARED','CANCELLED','COMPLETED')),
 created INTEGER NOT NULL, updated INTEGER NOT NULL, observed_slot INTEGER NOT NULL,
 fee_lamports INTEGER NOT NULL CHECK(fee_lamports>0 AND fee_lamports<=1000000),
 unsigned_wire_hash TEXT NOT NULL, entries TEXT NOT NULL, settlement TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS perps_wallet_prepared_close ON perps_position_closes(wallet) WHERE state='PREPARED';
CREATE UNIQUE INDEX IF NOT EXISTS perps_close_wire_once ON perps_position_closes(unsigned_wire_hash) WHERE state!='CANCELLED';
CREATE TABLE IF NOT EXISTS perps_position_close_executions (
 close_id TEXT PRIMARY KEY REFERENCES perps_position_closes(id),
 parent_binding TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('SIGNING','UNCERTAIN','FIRST_LEG_FINALIZED')),
 created INTEGER NOT NULL, updated INTEGER NOT NULL,
 signature TEXT UNIQUE, wire_hash TEXT UNIQUE, owner_signed_wire TEXT,
 confirmed_slot INTEGER, payout_json TEXT,
 CHECK((state='SIGNING' AND signature IS NULL AND wire_hash IS NULL AND owner_signed_wire IS NULL AND confirmed_slot IS NULL AND payout_json IS NULL)
 OR (state='UNCERTAIN' AND signature IS NOT NULL AND wire_hash IS NOT NULL AND owner_signed_wire IS NOT NULL AND confirmed_slot IS NULL AND payout_json IS NULL)
 OR (state='FIRST_LEG_FINALIZED' AND signature IS NOT NULL AND wire_hash IS NOT NULL AND owner_signed_wire IS NOT NULL AND confirmed_slot IS NOT NULL AND payout_json IS NOT NULL))
) STRICT;
CREATE TABLE IF NOT EXISTS perps_close_conversions (
 close_id TEXT PRIMARY KEY REFERENCES perps_position_close_executions(close_id),
 parent_binding TEXT NOT NULL, payout_binding TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PREPARED','SIGNING','UNCERTAIN','FINALIZED')),
 created INTEGER NOT NULL, updated INTEGER NOT NULL, prepared_slot INTEGER NOT NULL,
 fee_lamports INTEGER NOT NULL CHECK(fee_lamports>0 AND fee_lamports<=1000000),
 unsigned_wire_hash TEXT NOT NULL UNIQUE, wire_json TEXT NOT NULL,
 signature TEXT UNIQUE, wire_hash TEXT UNIQUE, owner_signed_wire TEXT, confirmed_slot INTEGER, receipt_json TEXT,
 CHECK((state IN ('PREPARED','SIGNING') AND signature IS NULL AND wire_hash IS NULL AND owner_signed_wire IS NULL AND confirmed_slot IS NULL AND receipt_json IS NULL)
 OR (state='UNCERTAIN' AND signature IS NOT NULL AND wire_hash IS NOT NULL AND owner_signed_wire IS NOT NULL AND confirmed_slot IS NULL AND receipt_json IS NULL)
 OR (state='FINALIZED' AND signature IS NOT NULL AND wire_hash IS NOT NULL AND owner_signed_wire IS NOT NULL AND confirmed_slot IS NOT NULL AND receipt_json IS NOT NULL))
) STRICT;
CREATE TABLE IF NOT EXISTS perps_close_completions (
 close_id TEXT PRIMARY KEY REFERENCES perps_position_closes(id),
 parent_binding TEXT NOT NULL, completed_at INTEGER NOT NULL,
 observed_slot INTEGER NOT NULL, record_json TEXT NOT NULL
) STRICT;`;
// Shared reviewed DDL for the explicitly gated empty legacy upgrade. Never
// accept migration SQL from an HTTP request, archive or caller-supplied string.
export const PERPS_EXIT_CANCELLATION_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS perps_exit_cancellations (
      id TEXT PRIMARY KEY, address TEXT NOT NULL REFERENCES perps_exit_request_bindings(address),
      reservation TEXT NOT NULL REFERENCES perps_reservations(reservation), wallet TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('PREPARED','SIGNING','UNCERTAIN','CONFIRMED','FAILED','CANCELLED')),
      created INTEGER NOT NULL, updated INTEGER NOT NULL, fee_lamports INTEGER NOT NULL CHECK(fee_lamports>0 AND fee_lamports<=1000000),
      wire_hash TEXT UNIQUE, signature TEXT UNIQUE, confirmed_slot INTEGER, unsigned_wire_hash TEXT NOT NULL
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS perps_live_exit_cancellation ON perps_exit_cancellations(address) WHERE state NOT IN ('FAILED','CANCELLED');
    CREATE UNIQUE INDEX IF NOT EXISTS perps_cancellation_wire_once ON perps_exit_cancellations(unsigned_wire_hash) WHERE state!='CANCELLED';
    CREATE UNIQUE INDEX IF NOT EXISTS perps_wallet_pending_cancellation ON perps_exit_cancellations(wallet) WHERE state IN ('PREPARED','SIGNING','UNCERTAIN');`;
function integer(value,name){if(!Number.isSafeInteger(value)||value<0)throw Error(name);return value;}
function amount(value){const n=BigInt(exactUsdUnits(value));if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('AMOUNT_OVERFLOW');return Number(n);}
function units(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(value))throw Error('INVALID_BALANCE');const n=Number(value);return integer(n,'INVALID_BALANCE');}
function key(value,length){try{if(typeof value!=='string'||bs58.decode(value).length!==length)throw Error();return value;}catch{throw Error('INVALID_PUBLIC_IDENTIFIER');}}
function identifier(value){if(typeof value!=='string'||!value||value.length>180||/[\x00-\x1f]/.test(value))throw Error('INVALID_ID');return value;}
function day(now){integer(now,'INVALID_TIME');return new Date(now).toISOString().slice(0,10);}
function plain(row){return row?Object.freeze({...row}):null;}

export function openPerpsExecutionJournal(path,{now=Date.now}={}){
  if(typeof path!=='string'||!isAbsolute(path))throw Error('DURABLE_ABSOLUTE_PATH_REQUIRED');
  const db=new DatabaseSync(path,{timeout:5000});
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS perps_reservations (
      wallet TEXT NOT NULL, signal TEXT NOT NULL, reservation TEXT NOT NULL UNIQUE,
      day TEXT NOT NULL, margin INTEGER NOT NULL CHECK(margin>0),
      state TEXT NOT NULL CHECK(state IN ('RESERVED','SIGNING','UNCERTAIN','OPEN','CLOSED','CANCELLED')),
      created INTEGER NOT NULL, updated INTEGER NOT NULL,
      wire_hash TEXT, signature TEXT UNIQUE,
      PRIMARY KEY(wallet,signal)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS perps_wallet_state ON perps_reservations(wallet,state);`);
  db.exec('BEGIN IMMEDIATE');
  try{
    const columns=new Set(db.prepare('PRAGMA table_info(perps_reservations)').all().map(row=>row.name));
    for(const [name,type]of [['position_address','TEXT'],['confirmed_slot','INTEGER'],['closed_slot','INTEGER'],['entry_exit_plan','TEXT'],['platform_fee_units','INTEGER NOT NULL DEFAULT 0 CHECK(platform_fee_units>=0)']])if(!columns.has(name))db.exec(`ALTER TABLE perps_reservations ADD COLUMN ${name} ${type}`);
    db.exec(`CREATE TABLE IF NOT EXISTS perps_exit_request_bindings (
      address TEXT PRIMARY KEY, reservation TEXT NOT NULL REFERENCES perps_reservations(reservation)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS perps_consumed_exit_events (
      signature TEXT NOT NULL, instruction_index INTEGER NOT NULL, inner_index INTEGER NOT NULL,
      reservation TEXT NOT NULL UNIQUE REFERENCES perps_reservations(reservation),
      PRIMARY KEY(signature,instruction_index,inner_index)
    ) STRICT;
    ${PERPS_EXIT_CANCELLATION_SCHEMA_SQL}
    ${PERPS_POSITION_CLOSE_SCHEMA_SQL}`);
    db.exec(PERPS_PLATFORM_FEE_LOCK_SCHEMA_SQL);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  const get=id=>db.prepare('SELECT * FROM perps_reservations WHERE reservation=?').get(identifier(id));
  const getCancellation=id=>db.prepare('SELECT * FROM perps_exit_cancellations WHERE id=?').get(identifier(id));
  const getClose=id=>db.prepare('SELECT * FROM perps_position_closes WHERE id=?').get(identifier(id));
  const getCloseExecution=id=>db.prepare('SELECT * FROM perps_position_close_executions WHERE close_id=?').get(identifier(id));
  const getConversion=id=>db.prepare('SELECT * FROM perps_close_conversions WHERE close_id=?').get(identifier(id));
  const getCompletion=id=>db.prepare('SELECT * FROM perps_close_completions WHERE close_id=?').get(identifier(id));
  function closeParents(row){
    if(row?.state!=='PREPARED')throw Error('RECONCILIATION_REQUIRED');
    const parents=db.prepare("SELECT reservation,signature,wire_hash,confirmed_slot,entry_exit_plan FROM perps_reservations WHERE wallet=? AND position_address=? AND state='OPEN' ORDER BY reservation").all(row.wallet,row.position);
    if(!parents.length||parents.some(p=>!p.signature||!p.wire_hash||!Number.isSafeInteger(p.confirmed_slot)||p.confirmed_slot>row.observed_slot||p.entry_exit_plan===null)
      ||JSON.stringify(parents)!==row.entries)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
    return row;
  }
  function assertNoParallelConversion(wallet){
    noFeePayment(wallet);
    if(db.prepare(`SELECT 1 FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(wallet)
     ||db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(wallet))throw Error('RECONCILIATION_REQUIRED');
  }
  function conversionParents(id){
    const parent=closeParents(getClose(id)),execution=getCloseExecution(id);assertNoParallelConversion(parent.wallet);
    perpsCloseConversionPayoutBinding(parent,execution);return {parent,execution};
  }
  function completionSnapshot(id){
    const close=getClose(id),execution=getCloseExecution(id),conversion=getConversion(id)??null,completion=getCompletion(id)??null;
    if(!close||!execution)throw Error('RECONCILIATION_REQUIRED');
    const entries=JSON.parse(close.entries).map(e=>get(e.reservation));
    validateStoredPerpsCloseExecution(execution,close);
    if(conversion)validateStoredPerpsCloseConversion(conversion,close,execution);
    if(close.state==='COMPLETED')validateStoredPerpsCloseCompletion(completion,close,execution,conversion,entries);
    else {closeParents(close);if(completion)throw Error('VERIFIED_RECONCILIATION_REQUIRED');}
    for(const e of entries)for(const exit of JSON.parse(e.entry_exit_plan).exits)
      if(db.prepare('SELECT reservation FROM perps_exit_request_bindings WHERE address=?').get(exit.address)?.reservation!==e.reservation)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
    return Object.freeze({close:plain(close),execution:plain(execution),conversion:plain(conversion),completion:plain(completion),entries:Object.freeze(entries.map(plain)),
      pendingEntries:Object.freeze(db.prepare(`SELECT reservation,state FROM perps_reservations WHERE wallet=? AND state IN ${pending} ORDER BY reservation`).all(close.wallet).map(plain)),
      pendingCancellations:Object.freeze(db.prepare("SELECT id,state FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN') ORDER BY id").all(close.wallet).map(plain))});
  }
  const hasClose=wallet=>db.prepare("SELECT 1 FROM perps_position_closes WHERE wallet=? AND state='PREPARED'").get(wallet);
  function noFeePayment(wallet){if(db.prepare("SELECT 1 FROM perps_platform_fee_locks WHERE wallet=? AND state='HELD'").get(wallet))throw Error('PLATFORM_FEE_RECONCILIATION_REQUIRED');}
  function outstandingFees(wallet){return db.prepare("SELECT COALESCE(SUM(r.platform_fee_units),0) AS fee FROM perps_reservations r WHERE r.wallet=? AND r.state IN ('OPEN','CLOSED') AND NOT EXISTS (SELECT 1 FROM perps_platform_fee_locks f WHERE f.reservation=r.reservation AND f.state='PAID')").get(wallet).fee;}
  function closeCleanupSnapshot({walletAddress,positionAddress,reservationId}){
    const close=db.prepare("SELECT id FROM perps_position_closes WHERE wallet=? AND state='PREPARED'").get(key(walletAddress,32));
    if(!close)return null;
    const s=completionSnapshot(close.id);
    if(s.close.position!==positionAddress||s.execution.state!=='FIRST_LEG_FINALIZED'||s.pendingEntries.length
     ||s.conversion!==null&&s.conversion.state!=='FINALIZED'||!s.entries.some(e=>e.reservation===reservationId))throw Error('RECONCILIATION_REQUIRED');
    return Object.freeze({close:s.close,execution:s.execution,conversion:s.conversion,entries:s.entries});
  }
  function assertCloseCleanupAllowed(cleanup){
    requireVerifiedServerPerpsExitCleanup(cleanup);
    const active=db.prepare("SELECT id FROM perps_position_closes WHERE wallet=? AND state='PREPARED'").get(cleanup.walletAddress);if(!active)return true;
    const p=readVerifiedServerPerpsCloseCleanupBinding(cleanup),s=closeCleanupSnapshot(p.identity);
    if(p.journal!==api||!s||s.close.id!==active.id||s.close.id!==p.closeId||s.close.wallet!==cleanup.walletAddress||s.close.position!==cleanup.positionAddress
     ||p.identity.reservationId!==cleanup.reservationId||JSON.stringify(s)!==p.encoded)throw Error('VERIFIED_RECONCILIATION_REQUIRED');return true;
  }
  let transactionDepth=0;
  function transaction(fn){
    const nested=transactionDepth>0,point='perps_nested_'+transactionDepth;
    db.exec(nested?'SAVEPOINT '+point:'BEGIN IMMEDIATE');transactionDepth++;
    try{const result=fn();db.exec(nested?'RELEASE '+point:'COMMIT');return result;}
    catch(error){db.exec(nested?'ROLLBACK TO '+point:'ROLLBACK');if(nested)db.exec('RELEASE '+point);throw error;}
    finally{transactionDepth--;}
  }
  const api={
    close(){db.close();},
    read(id){return plain(get(id));},
    readPlatformFeeLock(id){return plain(db.prepare('SELECT * FROM perps_platform_fee_locks WHERE assessment_id=?').get(identifier(id)));},
    pendingPlatformFeePayments(wallet){return db.prepare("SELECT * FROM perps_platform_fee_locks WHERE wallet=? AND state='HELD' ORDER BY created,assessment_id").all(key(wallet,32)).map(plain);},
    claimPlatformFeePayment(review){return transaction(()=>{
      readPerpsPlatformFeePaymentReview(review);const row=get(review.reservationId);
      if(!['OPEN','CLOSED'].includes(row?.state)||row.wallet!==review.walletAddress||String(row.margin)!==review.marginUnits)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      noFeePayment(row.wallet);
      if(hasClose(row.wallet)||db.prepare(`SELECT 1 FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(row.wallet)
        ||db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      db.prepare("INSERT INTO perps_platform_fee_locks(assessment_id,reservation,wallet,fee_units,review_hash,state,created) VALUES(?,?,?,?,?,'HELD',?)")
        .run(review.assessmentId,row.reservation,row.wallet,units(review.feeUnits),review.messageHash,integer(now(),'INVALID_TIME'));
      readPerpsPlatformFeePaymentReview(review);return api.readPlatformFeeLock(review.assessmentId);
    });},
    revalidatePlatformFeeLock(review){return transaction(()=>{
      readPerpsPlatformFeePaymentReview(review);const lock=api.readPlatformFeeLock(review.assessmentId),row=get(review.reservationId);
      if(lock?.state!=='HELD'||lock.reservation!==review.reservationId||lock.wallet!==review.walletAddress||String(lock.fee_units)!==review.feeUnits
        ||lock.review_hash!==review.messageHash||!['OPEN','CLOSED'].includes(row?.state)||row.wallet!==review.walletAddress)throw Error('PLATFORM_FEE_RECONCILIATION_REQUIRED');
      return lock;
    });},
    settlePlatformFeePayment(id,receipt){return transaction(()=>{
      requirePerpsPlatformFeePaymentReceipt(receipt);const row=api.readPlatformFeeLock(id),at=integer(now(),'INVALID_TIME');
      if(!row||receipt.assessmentId!==id||receipt.walletAddress!==row.wallet||receipt.feeUnits!==String(row.fee_units)||receipt.messageHash!==row.review_hash
        ||!['PAID','FAILED'].includes(receipt.state)||receipt.observedAt>at+2000||at-receipt.observedAt>10000)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      if(row.state!=='HELD'){if(row.state!==receipt.state||row.signature!==receipt.signature)throw Error('VERIFIED_RECONCILIATION_REQUIRED');return row;}
      // Receipt is branded by the exact fee validator; retain it permanently.
      db.prepare('UPDATE perps_platform_fee_locks SET state=?,signature=?,receipt_json=? WHERE assessment_id=?')
        .run(receipt.state,receipt.signature,JSON.stringify(receipt),id);return api.readPlatformFeeLock(id);
    });},
    readSignal(wallet,signal){return plain(db.prepare('SELECT * FROM perps_reservations WHERE wallet=? AND signal=?').get(key(wallet,32),identifier(signal)));},
    riskState(wallet){return transaction(()=>{
      key(wallet,32);const time=now(),today=day(time);
      const held=db.prepare(`SELECT COALESCE(SUM(margin+platform_fee_units),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(wallet);
      const active=db.prepare("SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state='OPEN'").get(wallet);
      const counted=db.prepare("SELECT COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND day=? AND state IN ('OPEN','CLOSED')").get(wallet,today).count;
      integer(held.margin,'INVALID_BALANCE');integer(active.margin,'INVALID_BALANCE');integer(counted,'INVALID_ACCOUNT');
      return Object.freeze({walletAddress:wallet,day:today,observedAt:time,pendingMarginUsdcUnits:String(held.margin),pendingCount:held.count,
        activeMarginUsdcUnits:String(active.margin+outstandingFees(wallet)),openReservationCount:active.count,executedToday:counted});
    });},
    pending(wallet){return db.prepare(`SELECT * FROM perps_reservations WHERE wallet=? AND state IN ${pending} ORDER BY created,reservation`).all(key(wallet,32)).map(plain);},
    openPositions(wallet){return db.prepare("SELECT * FROM perps_reservations WHERE wallet=? AND state='OPEN' ORDER BY created,reservation").all(key(wallet,32)).map(plain);},
    readPositionClose(id){return plain(getClose(id));},
    readPositionCloseExecution(id){return plain(getCloseExecution(id));},
    readPositionCloseSettlement(id){return transaction(()=>{
      const row=closeParents(getClose(id)),execution=getCloseExecution(id);
      if(!execution)throw Error('RECONCILIATION_REQUIRED');validateStoredPerpsCloseExecution(execution,row);
      return Object.freeze({close:plain(row),execution:plain(execution)});
    });},
    preparePositionCloseConversion(id,options){
      try{assertNoParallelConversion(closeParents(getClose(id)).wallet);}catch(e){return Promise.reject(e);}
      if(getConversion(id)&&getConversion(id).state!=='PREPARED')return Promise.reject(Error('RECONCILIATION_REQUIRED'));
      return prepareJournaledPerpsCloseConversion(api,id,options);
    },
    readPositionCloseConversion(id){return plain(getConversion(id));},
    readPositionCloseConversionBySignature({walletAddress,signature}){return plain(db.prepare('SELECT c.* FROM perps_close_conversions c JOIN perps_position_closes p ON p.id=c.close_id WHERE p.wallet=? AND c.signature=?').get(key(walletAddress,32),key(signature,64)));},
    pendingPositionCloseConversions(wallet){return db.prepare('SELECT c.* FROM perps_close_conversions c JOIN perps_position_closes p ON p.id=c.close_id WHERE p.wallet=? ORDER BY c.created,c.close_id').all(key(wallet,32)).map(plain);},
    readPositionCloseConversionSettlement(id){const read=()=>{
      const s=completionSnapshot(id);if(!s.conversion)throw Error('RECONCILIATION_REQUIRED');
      return Object.freeze({close:s.close,execution:s.execution,conversion:s.conversion});
    };return db.isTransaction?read():transaction(read);},
    readPositionCloseCompletionSnapshot(id){return db.isTransaction?completionSnapshot(id):transaction(()=>completionSnapshot(id));},
    readPositionCloseCompletion(id){return plain(getCompletion(id));},
    readPositionCloseCleanupSettlement(identity){return db.isTransaction?closeCleanupSnapshot(identity):transaction(()=>closeCleanupSnapshot(identity));},
    assertExitCancellationCloseAllowed(cleanup){return db.isTransaction?assertCloseCleanupAllowed(cleanup):transaction(()=>assertCloseCleanupAllowed(cleanup));},
    reconcilePositionCloseCompletion(id,completion){return transaction(()=>{
      const proof=requireVerifiedPerpsCloseCompletion(completion,{journal:api}),s=completionSnapshot(id),time=integer(now(),'INVALID_TIME');
      if(proof.closeId!==id||proof.walletAddress!==s.close.wallet||proof.positionAddress!==s.close.position||proof.day!==day(time)
       ||time-proof.observedAt>10000||proof.observedAt>time+2000||proof.observedSlot<proof.financialSlot||s.pendingEntries.length||s.pendingCancellations.length)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      if(s.close.state==='COMPLETED')return s.completion;
      if(s.close.state!=='PREPARED'||JSON.stringify(proof.reservationIds)!==JSON.stringify(s.entries.map(e=>e.reservation).sort()))throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      for(const e of s.entries)db.prepare("UPDATE perps_reservations SET state='CLOSED',closed_slot=?,updated=? WHERE reservation=? AND state='OPEN'").run(proof.observedSlot,time,e.reservation);
      db.prepare('INSERT INTO perps_close_completions(close_id,parent_binding,completed_at,observed_slot,record_json) VALUES(?,?,?,?,?)')
        .run(id,s.execution.parent_binding,time,proof.observedSlot,storedPerpsCloseCompletion(proof));
      db.prepare("UPDATE perps_position_closes SET state='COMPLETED',updated=? WHERE id=? AND state='PREPARED'").run(time,id);
      return completionSnapshot(id).completion;
    });},
    recoverPositionCloseConversion(id,options){return recoverRecordedPerpsCloseConversion(api,id,options);},
    preparePositionCloseConversionRecord(id,prepared){const p=readJournaledPerpsCloseConversion(prepared,api);return transaction(()=>{
      const {parent,execution}=conversionParents(id),time=integer(now(),'INVALID_TIME');
      if(p.id!==id||p.encoded!==JSON.stringify({close:plain(parent),execution:plain(execution)})||getConversion(id)||time<execution.updated)throw Error('RECONCILIATION_REQUIRED');
      readSimulatedPerpsCloseConversion(p.prepared.simulation);const sim=p.prepared.simulation;
      if(time-sim.observedAt>10000||sim.observedAt>time+2000||sim.observedSlot<execution.confirmed_slot)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      const text=storedPerpsCloseConversionWire(p.prepared.wire),{unsignedWireHash}=inspectStoredPerpsCloseConversionWire(text,parent,execution),fee=Number(sim.networkFeeLamports);
      if(!Number.isSafeInteger(fee)||fee<1||fee>1000000)throw Error('INVALID_FEE');
      db.prepare("INSERT INTO perps_close_conversions(close_id,parent_binding,payout_binding,state,created,updated,prepared_slot,fee_lamports,unsigned_wire_hash,wire_json) VALUES(?,?,?,'PREPARED',?,?,?,?,?,?)")
       .run(id,execution.parent_binding,perpsCloseConversionPayoutBinding(parent,execution),time,time,sim.observedSlot,fee,unsignedWireHash,text);
      return plain(getConversion(id));
    });},
    beginPositionCloseConversionSigning(id,prepared){const p=readJournaledPerpsCloseConversion(prepared,api);return transaction(()=>{
      const {parent,execution}=conversionParents(id),row=getConversion(id),time=integer(now(),'INVALID_TIME');
      if(row?.state!=='PREPARED'||time<row.updated)throw Error('RECONCILIATION_REQUIRED');validateStoredPerpsCloseConversion(row,parent,execution);
      if(p.id!==id||p.encoded!==JSON.stringify({close:plain(parent),execution:plain(execution)})||storedPerpsCloseConversionWire(p.prepared.wire)!==row.wire_json
       ||time-p.prepared.simulation.observedAt>10000||p.prepared.simulation.observedAt>time+2000)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_close_conversions SET state='SIGNING',updated=? WHERE close_id=?").run(time,id);return plain(getConversion(id));
    });},
    recordPositionCloseConversionBroadcast(id,intent){return transaction(()=>{
      const {parent,execution}=conversionParents(id),row=getConversion(id),time=integer(now(),'INVALID_TIME');
      if(row?.state!=='SIGNING'||time<row.updated)throw Error('RECONCILIATION_REQUIRED');validateStoredPerpsCloseConversion(row,parent,execution);
      const encoded=readVerifiedPerpsCloseConversionIntent(intent,row.wire_json);
      for(const table of ['perps_reservations','perps_exit_cancellations','perps_position_close_executions'])if(db.prepare('SELECT 1 FROM '+table+' WHERE signature=?').get(intent.signature))throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_close_conversions SET state='UNCERTAIN',signature=?,wire_hash=?,owner_signed_wire=?,updated=? WHERE close_id=?")
       .run(intent.signature,intent.wireHash,encoded,time,id);return plain(getConversion(id));
    });},
    reconcilePositionCloseConversion(id,payout){return transaction(()=>{
      const {parent,execution}=conversionParents(id),row=getConversion(id),time=integer(now(),'INVALID_TIME');
      if(!row||!['UNCERTAIN','FINALIZED'].includes(row.state)||time<row.updated)throw Error('RECONCILIATION_REQUIRED');validateStoredPerpsCloseConversion(row,parent,execution);
      const text=storeVerifiedPerpsConversionReceipt(payout,row,parent,execution);
      if(time-payout.observedAt>10000||payout.observedAt>time+2000)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      if(row.state==='FINALIZED'){if(row.receipt_json!==text)throw Error('VERIFIED_RECONCILIATION_REQUIRED');return plain(row);}
      db.prepare("UPDATE perps_close_conversions SET state='FINALIZED',confirmed_slot=?,receipt_json=?,updated=? WHERE close_id=?")
       .run(payout.slot,text,time,id);return plain(getConversion(id));
    });},
    pendingPositionCloseExecutions(wallet){return db.prepare('SELECT e.* FROM perps_position_close_executions e JOIN perps_position_closes p ON p.id=e.close_id WHERE p.wallet=? ORDER BY e.created,e.close_id').all(key(wallet,32)).map(plain);},
    // Bookkeeping claim only. It cannot authorize custody key use or transport.
    beginPositionCloseSigning(id){return transaction(()=>{
      const row=closeParents(getClose(id)),time=integer(now(),'INVALID_TIME');
      if(getCloseExecution(id)||time<row.created)throw Error('RECONCILIATION_REQUIRED');
      if(db.prepare(`SELECT 1 FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(row.wallet)
       ||db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      db.prepare("INSERT INTO perps_position_close_executions(close_id,parent_binding,state,created,updated) VALUES(?,?,'SIGNING',?,?)")
        .run(id,perpsCloseExecutionParentBinding(row),time,time);return plain(getCloseExecution(id));
    });},
    recordPositionCloseBroadcast(id,intent){return transaction(()=>{
      const row=closeParents(getClose(id)),execution=getCloseExecution(id),time=integer(now(),'INVALID_TIME');
      if(execution?.state!=='SIGNING'||time<execution.updated)throw Error('RECONCILIATION_REQUIRED');
      validateStoredPerpsCloseExecution(execution,row);const encoded=readVerifiedPerpsCloseOwnerIntent(intent,row);
      if(intent.recordBinding!==execution.parent_binding
       ||db.prepare('SELECT 1 FROM perps_reservations WHERE signature=?').get(intent.signature)
       ||db.prepare('SELECT 1 FROM perps_exit_cancellations WHERE signature=?').get(intent.signature))throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_position_close_executions SET state='UNCERTAIN',signature=?,wire_hash=?,owner_signed_wire=?,updated=? WHERE close_id=?")
        .run(intent.signature,intent.wireHash,encoded,time,id);return plain(getCloseExecution(id));
    });},
    reconcilePositionClosePayout(id,payout){return transaction(()=>{
      const row=closeParents(getClose(id)),execution=getCloseExecution(id),time=integer(now(),'INVALID_TIME');
      if(!execution||!['UNCERTAIN','FIRST_LEG_FINALIZED'].includes(execution.state)||time<execution.updated)throw Error('RECONCILIATION_REQUIRED');
      validateStoredPerpsCloseExecution(execution,row);const encoded=storeVerifiedPerpsClosePayout(payout,row);
      if(payout.signature!==execution.signature||payout.wireHash!==execution.wire_hash||time-payout.observedAt>10000||payout.observedAt>time+2000)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      if(execution.state==='FIRST_LEG_FINALIZED'){
        if(execution.payout_json!==encoded)throw Error('VERIFIED_RECONCILIATION_REQUIRED');return plain(execution);
      }
      db.prepare("UPDATE perps_position_close_executions SET state='FIRST_LEG_FINALIZED',confirmed_slot=?,payout_json=?,updated=? WHERE close_id=?")
        .run(payout.slot,encoded,time,id);return plain(getCloseExecution(id));
    });},
    pendingPositionCloses(wallet){return db.prepare("SELECT * FROM perps_position_closes WHERE wallet=? AND state='PREPARED' ORDER BY created,id").all(key(wallet,32)).map(plain);},
    preparePositionClose(id,oracleEffects,{returnPolicy=null}={}){return transaction(()=>{
      identifier(id);
      const {reserves}=readServerPerpsFullCloseOracleEffects(oracleEffects);
      const {vaults}=readServerPerpsFullCloseReserves(reserves),{funding}=readServerPerpsFullCloseVaults(vaults);
      const {simulation}=readServerPerpsFullCloseFunding(funding),{inspection}=readServerPerpsFullCloseSimulation(simulation);
      const {plan}=readInspectedServerPerpsFullClose(inspection),{envelope}=inspection,wallet=plan.walletAddress,time=integer(now(),'INVALID_TIME');
      noFeePayment(wallet);
      const settlement=describeSimulatedPerpsCloseSettlement(oracleEffects);
      const returnProof=returnPolicy===null?null:readSimulatedPerpsCloseReturn(returnPolicy,{oracleEffects});
      const settlementText=returnProof?canonicalPerpsCloseSettlement({...JSON.parse(settlement.encoded),returnLimits:returnProof.limits},plan):settlement.encoded;
      if(hasClose(wallet)||db.prepare(`SELECT 1 FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(wallet)
       ||db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(wallet))throw Error('RECONCILIATION_REQUIRED');
      const entries=db.prepare("SELECT reservation,signature,wire_hash,confirmed_slot,entry_exit_plan FROM perps_reservations WHERE wallet=? AND position_address=? AND state='OPEN' ORDER BY reservation").all(wallet,plan.positionAddress);
      if(!entries.length||entries.some(row=>!row.signature||!row.wire_hash||!Number.isSafeInteger(row.confirmed_slot)||row.confirmed_slot>simulation.observedSlot||row.entry_exit_plan===null))throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      const fee=Number(simulation.feeLamports);if(!Number.isSafeInteger(fee)||fee<1||fee>1000000)throw Error('INVALID_FEE');
      const hash=createHash('sha256').update(Buffer.from(envelope.serializedTxBase64,'base64')).digest('hex');
      db.prepare("INSERT INTO perps_position_closes(id,wallet,position,state,created,updated,observed_slot,fee_lamports,unsigned_wire_hash,entries,settlement) VALUES(?,?,?,'PREPARED',?,?,?,?,?,?,?)")
        .run(id,wallet,plan.positionAddress,time,time,simulation.observedSlot,fee,hash,JSON.stringify(entries),settlementText);
      // Neither collateral, daily loss nor OPEN parents are released here.
      return plain(getClose(id));
    });},
    cancelPreparedPositionClose(id){return transaction(()=>{
      const row=getClose(id);if(row?.state!=='PREPARED'||getCloseExecution(id))throw Error('RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_position_closes SET state='CANCELLED',updated=? WHERE id=?").run(integer(now(),'INVALID_TIME'),id);
      return plain(getClose(id));
    });},
    readExitCancellation(id){return plain(getCancellation(id));},
    readExitCancellationBySignature({walletAddress,signature}){return plain(db.prepare('SELECT * FROM perps_exit_cancellations WHERE wallet=? AND signature=?').get(key(walletAddress,32),key(signature,64)));},
    pendingExitCancellations(wallet){return db.prepare("SELECT * FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN') ORDER BY created,id").all(key(wallet,32)).map(plain);},
    // A separate durable attempt, never an entry reservation or signing grant.
    // PREPARED is provably unsigned. Only successful authorization can advance
    // it to SIGNING before any key use; a crash afterward requires review.
    beginExitCancellation(id,simulation){return transaction(()=>{
      identifier(id);const {inspection}=readSimulatedPerpsExitCancellationEvidence(simulation),{cleanup}=readInspectedPerpsExitCancellationEvidence(inspection);
      const row=get(inspection.reservationId),time=now();integer(time,'INVALID_TIME');
      noFeePayment(inspection.walletAddress);
      assertCloseCleanupAllowed(cleanup);
      if(row?.state!=='OPEN'||row.wallet!==cleanup.walletAddress||row.position_address!==cleanup.positionAddress||row.entry_exit_plan!==cleanup.entryExitPlan
        ||row.signature!==cleanup.signature||row.wire_hash!==cleanup.wireHash||row.reservation!==cleanup.reservationId
        ||cleanup.day!==day(time)||time-cleanup.observedAt>10000||cleanup.observedAt>time+2000
        ||!Number.isSafeInteger(row.confirmed_slot)||cleanup.observedSlot<row.confirmed_slot
        ||db.prepare('SELECT reservation FROM perps_exit_request_bindings WHERE address=?').get(inspection.exitAddress)?.reservation!==row.reservation)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      if(db.prepare("SELECT 1 FROM perps_reservations WHERE wallet=? AND state IN ('SIGNING','UNCERTAIN')").get(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      const fee=Number(simulation.feeLamports);if(!Number.isSafeInteger(fee)||fee<1||fee>1000000)throw Error('INVALID_FEE');
      db.prepare("INSERT INTO perps_exit_cancellations(id,address,reservation,wallet,state,created,updated,fee_lamports,unsigned_wire_hash) VALUES(?,?,?,?,'PREPARED',?,?,?,?)")
        .run(id,inspection.exitAddress,row.reservation,row.wallet,time,time,fee,perpsCancellationUnsignedWireHash(inspection));
      return plain(getCancellation(id));
    });},
    beginExitCancellationSigning(id,simulation){return transaction(()=>{
      const {inspection}=readSimulatedPerpsExitCancellationEvidence(simulation),{cleanup}=readInspectedPerpsExitCancellationEvidence(inspection);
      const attempt=getCancellation(id),entry=get(inspection.reservationId);
      assertCloseCleanupAllowed(cleanup);
      if(attempt?.state!=='PREPARED'||attempt.signature!==null||attempt.wire_hash!==null||attempt.wallet!==inspection.walletAddress
       ||attempt.address!==inspection.exitAddress||attempt.reservation!==inspection.reservationId||String(attempt.fee_lamports)!==simulation.feeLamports
       ||attempt.unsigned_wire_hash!==perpsCancellationUnsignedWireHash(inspection)
       ||entry?.state!=='OPEN'||entry.wallet!==cleanup.walletAddress||entry.signature!==cleanup.signature||entry.wire_hash!==cleanup.wireHash
       ||entry.position_address!==cleanup.positionAddress||entry.entry_exit_plan!==cleanup.entryExitPlan
       ||db.prepare("SELECT 1 FROM perps_reservations WHERE wallet=? AND state IN ('SIGNING','UNCERTAIN')").get(attempt.wallet))throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_exit_cancellations SET state='SIGNING',updated=? WHERE id=?").run(now(),id);return plain(getCancellation(id));
    });},
    cancelPreparedExitCancellation(id){return transaction(()=>{
      const attempt=getCancellation(id);if(attempt?.state!=='PREPARED'||attempt.signature!==null||attempt.wire_hash!==null)throw Error('RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_exit_cancellations SET state='CANCELLED',updated=? WHERE id=?").run(now(),id);return plain(getCancellation(id));
    });},
    recordExitCancellationBroadcastIntent(id,{walletAddress,signature,wireHash}={}){return transaction(()=>{
      const row=getCancellation(id);if(row?.state!=='SIGNING'||row.wallet!==walletAddress)throw Error('INVALID_TRANSITION');
      if(typeof wireHash!=='string'||!/^[a-f0-9]{64}$/.test(wireHash))throw Error('INVALID_WIRE_HASH');key(signature,64);
      db.prepare("UPDATE perps_exit_cancellations SET state='UNCERTAIN',signature=?,wire_hash=?,updated=? WHERE id=?")
        .run(signature,wireHash,now(),id);return plain(getCancellation(id));
    });},
    reconcileExitCancellation(id,receipt){return transaction(()=>{
      const row=getCancellation(id),time=now();
      if(row?.state!=='UNCERTAIN'||!isVerifiedPerpsBroadcastReceipt(receipt)||receipt.confirmationStatus!=='finalized'
       ||receipt.walletAddress!==row.wallet||receipt.signature!==row.signature||receipt.wireHash!==row.wire_hash
       ||time-receipt.observedAt>10000||receipt.observedAt>time+2000)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      db.prepare('UPDATE perps_exit_cancellations SET state=?,confirmed_slot=?,updated=? WHERE id=?')
        .run(receipt.state==='CONFIRMED'?'CONFIRMED':'FAILED',receipt.slot,time,id);return plain(getCancellation(id));
    });},
    reserve({walletAddress,signalId,reservationId,marginUsd,limits,snapshot,positionAddress=null,entryExitPlan=null,platformFeeUnits='0'}){
      const wallet=key(walletAddress,32),signal=identifier(signalId),id=identifier(reservationId);
      const margin=amount(marginUsd),capital=amount(limits?.capitalUsd),loss=amount(limits?.dailyLossUsd);
      const fee=units(platformFeeUnits);if(fee!==0&&fee!==Number(BigInt(margin)*20n/10000n))throw Error('INVALID_PLATFORM_FEE');
      const positions=integer(limits?.positions,'INVALID_POSITION_LIMIT'),daily=integer(limits?.dailyTrades,'INVALID_DAILY_LIMIT');
      if(positionAddress!==null)key(positionAddress,32);
      const exitPlan=entryExitPlan===null?null:canonicalServerPerpsEntryExitPlan(entryExitPlan);
      if(exitPlan!==null&&(positionAddress===null||entryExitPlan.exits.some(exit=>[positionAddress,wallet].includes(exit.address))))throw Error('INVALID_PERPS_ENTRY_EXIT_PLAN');
      if(positions<1||positions>10||daily<1||daily>100||margin<10000000||loss>capital)throw Error('INVALID_LIMITS');
      const time=now(),today=day(time);
      if(snapshot?.walletAddress!==wallet||snapshot?.network!=='solana-mainnet'||snapshot?.balancesComplete!==true
          ||!Number.isSafeInteger(snapshot?.observedAt)||time-snapshot.observedAt>10000||snapshot.observedAt>time+2000
          ||snapshot?.day!==today)throw Error('STALE_OR_UNRECONCILED_ACCOUNT');
      const available=units(snapshot.availableUsdcUnits),allocated=units(snapshot.allocatedUsdcUnits),lost=units(snapshot.lossTodayUsdcUnits);
      const open=integer(snapshot.openPositions,'INVALID_ACCOUNT'),trades=integer(snapshot.tradesToday,'INVALID_ACCOUNT');
      return transaction(()=>{
        // The reserved web: namespace identifies an owner-signed external
        // attempt. Every entry path shares this held-collateral barrier.
        noFeePayment(wallet);
        if(db.prepare(`SELECT 1 FROM perps_reservations WHERE wallet=? AND signal LIKE 'web:%' AND state IN ${pending}`).get(wallet))throw Error('RECONCILIATION_REQUIRED');
        if(hasClose(wallet))throw Error('RECONCILIATION_REQUIRED');
        if(db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(wallet))throw Error('RECONCILIATION_REQUIRED');
        if(db.prepare('SELECT 1 FROM perps_reservations WHERE wallet=? AND signal=?').get(wallet,signal))throw Error('DUPLICATE_SIGNAL');
        const held=db.prepare(`SELECT COALESCE(SUM(margin+platform_fee_units),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(wallet);
        const active=db.prepare("SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state='OPEN'").get(wallet);
        const counted=db.prepare("SELECT COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND day=? AND state IN ('OPEN','CLOSED')").get(wallet,today).count;
        const due=outstandingFees(wallet);
        if(margin+fee>available-held.margin-due)throw Error('INSUFFICIENT_UNRESERVED_BALANCE');
        if(Math.max(allocated,active.margin+due)+held.margin+margin+fee>capital)throw Error('CAPITAL_LIMIT');
        if(lost+Math.max(allocated,active.margin+due)+held.margin+margin+fee>loss)throw Error('DAILY_LOSS_LIMIT');
        if(Math.max(open,active.count)+held.count>=positions)throw Error('POSITION_LIMIT');
        // Old-day unknown attempts may still land today. Midnight cannot free
        // their daily slots or their collateral without chain reconciliation.
        if(Math.max(trades,counted)+held.count>=daily)throw Error('DAILY_TRADE_LIMIT');
        db.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated,position_address,entry_exit_plan) VALUES(?,?,?,?,?,'RESERVED',?,?,?,?)").run(wallet,signal,id,today,margin,time,time,positionAddress,exitPlan);
        db.prepare('UPDATE perps_reservations SET platform_fee_units=? WHERE reservation=?').run(fee,id);
        for(const exit of exitPlan===null?[]:JSON.parse(exitPlan).exits)db.prepare('INSERT INTO perps_exit_request_bindings(address,reservation) VALUES(?,?)').run(exit.address,id);
        return plain(get(id));
      });
    },
    // Import an already owner-signed web attempt atomically. No intermediate
    // RESERVED/SIGNING row can be mistaken for an unsigned cancellable order.
    reserveWebSubmission(authorization){return transaction(()=>{
      const proof=consumeWebPerpsRiskAuthorization(authorization,{journal:api});proof.check();
      if(db.prepare(`SELECT 1 FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(proof.request.walletAddress))throw Error('RECONCILIATION_REQUIRED');
      const id=proof.request.reservationId;api.reserve(proof.request);api.beginSigning(id);
      api.revalidateSigning(id,{limits:proof.request.limits,snapshot:proof.request.snapshot});
      api.recordBroadcastIntent(id,proof.identity);proof.check();return plain(get(id));
    });},
    // Persist before handing the request to any signer. A crash is not cancellation.
    revalidateSigning(id,{limits,snapshot}){return transaction(()=>{
      const row=get(id);if(row?.state!=='SIGNING')throw Error('INVALID_TRANSITION');
      if(hasClose(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      if(db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      const capital=amount(limits?.capitalUsd),loss=amount(limits?.dailyLossUsd),positions=integer(limits?.positions,'INVALID_POSITION_LIMIT'),daily=integer(limits?.dailyTrades,'INVALID_DAILY_LIMIT');
      if(positions<1||positions>10||daily<1||daily>100||loss>capital)throw Error('INVALID_LIMITS');
      const time=now(),today=day(time);
      if(snapshot?.walletAddress!==row.wallet||snapshot.network!=='solana-mainnet'||snapshot.balancesComplete!==true||snapshot.day!==today
        ||!Number.isSafeInteger(snapshot.observedAt)||time-snapshot.observedAt>10000||snapshot.observedAt>time+2000)throw Error('STALE_OR_UNRECONCILED_ACCOUNT');
      const available=units(snapshot.availableUsdcUnits),allocated=units(snapshot.allocatedUsdcUnits),lost=units(snapshot.lossTodayUsdcUnits);
      const open=integer(snapshot.openPositions,'INVALID_ACCOUNT'),trades=integer(snapshot.tradesToday,'INVALID_ACCOUNT');
      const held=db.prepare(`SELECT COALESCE(SUM(margin+platform_fee_units),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(row.wallet);
      const active=db.prepare("SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state='OPEN'").get(row.wallet);
      const counted=db.prepare("SELECT COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND day=? AND state IN ('OPEN','CLOSED')").get(row.wallet,today).count;
      // The current SIGNING row is already in held: do not charge it twice or
      // subtract it from another process's reservation.
      const due=outstandingFees(row.wallet);
      if(held.margin+due>available)throw Error('INSUFFICIENT_UNRESERVED_BALANCE');
      if(Math.max(allocated,active.margin+due)+held.margin>capital)throw Error('CAPITAL_LIMIT');
      if(lost+Math.max(allocated,active.margin+due)+held.margin>loss)throw Error('DAILY_LOSS_LIMIT');
      if(Math.max(open,active.count)+held.count>positions)throw Error('POSITION_LIMIT');
      if(Math.max(trades,counted)+held.count>daily)throw Error('DAILY_TRADE_LIMIT');
      return plain(row);
    });},
    beginSigning(id){return transaction(()=>{
      const row=get(id);if(row?.state!=='RESERVED')throw Error('INVALID_TRANSITION');
      noFeePayment(row.wallet);
      if(hasClose(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      if(db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE wallet=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_reservations SET state='SIGNING',updated=? WHERE reservation=?").run(now(),id);
      return plain(get(id));
    });},
    // Persist exact signed identity BEFORE the first send attempt. Timeout/restart
    // must reconcile this signature, never prepare and sign a replacement order.
    recordBroadcastIntent(id,{wireHash,signature}){return transaction(()=>{
      const row=get(id);if(row?.state!=='SIGNING')throw Error('INVALID_TRANSITION');
      if(typeof wireHash!=='string'||!/^[a-f0-9]{64}$/.test(wireHash))throw Error('INVALID_WIRE_HASH');
      key(signature,64);
      db.prepare("UPDATE perps_reservations SET state='UNCERTAIN',wire_hash=?,signature=?,updated=? WHERE reservation=?").run(wireHash,signature,now(),id);
      return plain(get(id));
    });},
    reconcileBroadcast(id,receipt){return transaction(()=>{
      const row=get(id),time=now();
      if(row?.signal?.startsWith('web:'))throw Error('WEB_PERPS_SETTLEMENT_REQUIRED');
      if(!isVerifiedPerpsBroadcastReceipt(receipt)||row?.state!=='UNCERTAIN'
          ||receipt.walletAddress!==row.wallet||receipt.signature!==row.signature||receipt.wireHash!==row.wire_hash
          ||time-receipt.observedAt>10000||receipt.observedAt>time+2000)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      // Rejected chain transactions consume a conservative daily slot but no
      // open-position collateral. CLOSED here does not claim a profitable exit.
      const next=receipt.state==='CONFIRMED'?'OPEN':'CLOSED';
      db.prepare('UPDATE perps_reservations SET state=?,day=?,updated=?,confirmed_slot=? WHERE reservation=?').run(next,receipt.executionDay,time,receipt.slot,id);
      return plain(get(id));
    });},
    reconcileWebSubmission(value,{webJournal}={}){return transaction(()=>{
      const proof=consumeWebPerpsRiskSettlement(value,{riskJournal:api,webJournal}),row=get(value.reservationId),time=now();
      if(JSON.stringify(plain(row))!==proof.parentJson||row.wallet!==value.walletAddress||row.signature!==value.signature
       ||row.signature!==proof.receipt.signature||row.wire_hash!==proof.receipt.wireHash||!['UNCERTAIN','OPEN','CLOSED'].includes(row.state))throw Error('WEB_PERPS_SETTLEMENT_REQUIRED');
      const next=proof.receipt.state==='CONFIRMED'?'OPEN':'CLOSED';
      if(row.state!=='UNCERTAIN'){
        if(row.state!==next||row.confirmed_slot!==proof.receipt.slot||row.day!==proof.receipt.executionDay)throw Error('WEB_PERPS_SETTLEMENT_REQUIRED');return plain(row);
      }
      db.prepare('UPDATE perps_reservations SET state=?,day=?,updated=?,confirmed_slot=? WHERE reservation=?').run(next,proof.receipt.executionDay,time,proof.receipt.slot,value.reservationId);
      proof.check();return plain(get(value.reservationId));
    });},
    reconcileClosedPosition(id,closure){return transaction(()=>{
      const proof=requireVerifiedServerPerpsPositionClosure(closure),row=get(id),time=now();
      if(row&&hasClose(row.wallet))throw Error('RECONCILIATION_REQUIRED');
      if(row?.state!=='OPEN'||row.wallet!==proof.walletAddress||row.signature!==proof.signature||row.wire_hash!==proof.wireHash||row.position_address!==proof.positionAddress
       ||row.reservation!==proof.reservationId||row.entry_exit_plan!==proof.entryExitPlan||proof.day!==day(time)||time-proof.observedAt>10000||proof.observedAt>time+2000
       ||!Number.isSafeInteger(row.confirmed_slot)||proof.observedSlot<row.confirmed_slot
       ||db.prepare("SELECT 1 FROM perps_exit_cancellations WHERE reservation=? AND state IN ('PREPARED','SIGNING','UNCERTAIN')").get(id)
       ||proof.observedSlot<(db.prepare('SELECT MAX(confirmed_slot) AS slot FROM perps_exit_cancellations WHERE reservation=?').get(id).slot??0))throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      if(proof.stage==='FINALIZED_INDIVIDUAL_ENTRY_CLOSED'){
       if(row.entry_exit_plan!==proof.entryExitPlan||db.prepare('SELECT reservation FROM perps_exit_request_bindings WHERE address=?').get(proof.exitRequestAddress)?.reservation!==id)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
       db.prepare('INSERT INTO perps_consumed_exit_events(signature,instruction_index,inner_index,reservation) VALUES(?,?,?,?)')
        .run(proof.exitSignature,proof.exitInstructionIndex,proof.exitInnerInstructionIndex,id);
      }
      db.prepare("UPDATE perps_reservations SET state='CLOSED',closed_slot=?,updated=? WHERE reservation=?").run(proof.observedSlot,time,id);
      return plain(get(id));
    });},
    // Only unsigned reservations may be cancelled. No age-based cleanup is safe
    // once signing has started; those rows need independently verified chain facts.
    cancelUnsigned(id){return transaction(()=>{
      const row=get(id);if(row?.state!=='RESERVED')throw Error('RECONCILIATION_REQUIRED');
      db.prepare("UPDATE perps_reservations SET state='CANCELLED',updated=? WHERE reservation=?").run(now(),id);
      return plain(get(id));
    });}
  };executionJournals.add(api);return api;
}
