// Durable assessment ONLY. No signer, transport, balance debit or paid setter.
// Authenticated entry adapters must capture consent before signing. A finalized
// entry proof is not spending authority. Collection needs its own reviewed path.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute,dirname,resolve} from 'node:path';
import {lstatSync,realpathSync,openSync,closeSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {requirePerpsExecutionJournal} from './perps-execution-journal.js';
import {requireVerifiedServerPerpsTradeTransaction} from './perps-server-trade-transaction.js';
import {PERPS_PLATFORM_FEE,quotePerpsPlatformFee} from './perps-platform-fee.js';
function fail(){throw Error('PLATFORM_FEE_ASSESSMENT_REJECTED');}
function id(value){if(typeof value!=='string'||!value.length||value.length>180||/[\x00-\x1f\x7f]/.test(value))fail();return value;}
function time(value){if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function copy(row){return row?Object.freeze({...row}):null;}
const assessments=new WeakMap();
export function readPerpsPlatformFeeAssessment(value){
  const binding=assessments.get(value);if(!binding)fail();
  const current=binding.read();if(JSON.stringify(current)!==binding.snapshot)fail();
  return value;
}
export function openPerpsPlatformFeeJournal(path,{entryJournal,now=Date.now}={}){
  if(typeof path!=='string'||!isAbsolute(path)||typeof now!=='function')fail();
  requirePerpsExecutionJournal(entryJournal);
  const parent=lstatSync(dirname(path));
  if(parent.isSymbolicLink()||!parent.isDirectory()||realpathSync(dirname(path))!==resolve(dirname(path))
    ||process.platform!=='win32'&&((parent.mode&0o077)!==0||parent.uid!==process.getuid()))fail();
  try{const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);closeSync(fd);}
  catch(error){if(error?.code!=='EEXIST')throw error;}
  const file=lstatSync(path);
  if(file.isSymbolicLink()||!file.isFile()||file.nlink!==1
    ||process.platform!=='win32'&&((file.mode&0o077)!==0||file.uid!==process.getuid()))fail();
  const db=new DatabaseSync(path,{timeout:5000});
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  if(tables.some(row=>!['perps_platform_fee_consents','perps_platform_fee_assessments'].includes(row.name))){db.close();fail();}
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS perps_platform_fee_consents (
      reservation TEXT PRIMARY KEY, wallet TEXT NOT NULL, margin TEXT NOT NULL,
      terms TEXT NOT NULL, accepted INTEGER NOT NULL, entry_created INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS perps_platform_fee_assessments (
      id TEXT PRIMARY KEY, reservation TEXT NOT NULL UNIQUE, wallet TEXT NOT NULL,
      opening_signature TEXT NOT NULL, opening_slot INTEGER NOT NULL,
      margin TEXT NOT NULL, fee TEXT NOT NULL, terms TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state='AWAITING_PAYMENT_REVIEW'), created INTEGER NOT NULL,
      UNIQUE(wallet,opening_signature)
    ) STRICT;`);
  const readConsent=reservation=>db.prepare('SELECT * FROM perps_platform_fee_consents WHERE reservation=?').get(id(reservation));
  const read=reservation=>db.prepare('SELECT * FROM perps_platform_fee_assessments WHERE reservation=?').get(id(reservation));
  const assessment=row=>{const value=copy(row);if(value)assessments.set(value,{read:()=>copy(read(value.reservation)),snapshot:JSON.stringify(value)});return value;};
  function transaction(run){db.exec('BEGIN IMMEDIATE');try{const value=run();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
  return Object.freeze({
    // The caller's authenticated account and explicit UI consent must already
    // be bound to this reservation; a checkbox boolean alone is not account auth.
    recordConsent({reservationId,walletAddress,termsVersion,explicitConsent}={}){return transaction(()=>{
      const row=entryJournal.read(id(reservationId)),at=time(now());
      if(explicitConsent!==true||termsVersion!==PERPS_PLATFORM_FEE.version
        ||row?.wallet!==walletAddress||row.state!=='RESERVED'||time(row.created)>at)fail();
      const quote=quotePerpsPlatformFee(String(row.margin)),terms=JSON.stringify(quote);
      const previous=readConsent(reservationId);
      if(previous){if(previous.wallet!==walletAddress||previous.margin!==String(row.margin)||previous.terms!==terms||previous.entry_created!==row.created)fail();return copy(previous);}
      db.prepare('INSERT INTO perps_platform_fee_consents VALUES(?,?,?,?,?,?)').run(reservationId,walletAddress,String(row.margin),terms,at,row.created);
      return copy(readConsent(reservationId));
    });},
    assessFinalizedOpen(reservationId,receipt){return transaction(()=>{
      requireVerifiedServerPerpsTradeTransaction(receipt);
      const row=entryJournal.read(id(reservationId)),consent=readConsent(reservationId),at=time(now());
      if(!row||!consent||row.state!=='OPEN'||row.wallet!==receipt.walletAddress
        ||row.signature!==receipt.signature||row.position_address==null
        ||row.confirmed_slot!==receipt.slot||receipt.failed!==false||receipt.unknownPerpsEvents!==0
        ||!Number.isSafeInteger(receipt.observedAt)||at-receipt.observedAt>10000||receipt.observedAt>at+2000
        ||!Number.isSafeInteger(receipt.blockTime)||receipt.blockTime<0
        ||receipt.blockTime*1000+999<consent.accepted||receipt.blockTime*1000>at+2000
        ||consent.wallet!==row.wallet||consent.margin!==String(row.margin)||consent.entry_created!==row.created
        ||!Array.isArray(receipt.events)||receipt.events.length!==1
        ||receipt.events[0].action!=='Increase'||receipt.events[0].positionAddress!==row.position_address
        ||!/^[1-9][0-9]*$/.test(receipt.events[0].fields.sizeUsdDelta))fail();
      const quote=quotePerpsPlatformFee(consent.margin),terms=JSON.stringify(quote);
      if(consent.terms!==terms)fail();
      const previous=read(reservationId);
      if(previous){if(previous.wallet!==row.wallet||previous.opening_signature!==receipt.signature||previous.opening_slot!==receipt.slot||previous.terms!==terms)fail();return assessment(previous);}
      const assessmentId=createHash('sha256').update(JSON.stringify([quote.version,row.wallet,receipt.signature])).digest('hex');
      db.prepare('INSERT INTO perps_platform_fee_assessments VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(assessmentId,reservationId,row.wallet,receipt.signature,receipt.slot,consent.margin,quote.feeUnits,terms,'AWAITING_PAYMENT_REVIEW',at);
      return assessment(read(reservationId));
    });},
    read(reservationId){return assessment(read(reservationId));},
    close(){db.close();}
  });
}
