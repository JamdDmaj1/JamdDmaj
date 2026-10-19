// Server-only durable risk reservations. No key storage, signer or network calls.
// A caller must supply authenticated settings and a reconciled mainnet snapshot.
// This journal is not an authorization boundary or a substitute for chain validation.
// Requires Node 22.16+ and a single durable server filesystem shared by workers.
// Never place this database in Vercel /tmp or replicate it across separate hosts.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute} from 'node:path';
import bs58 from 'bs58';
import {exactUsdUnits} from './jupiter-perps-order.js';
import {isVerifiedPerpsBroadcastReceipt} from './perps-broadcast-receipt.js';
import {requireVerifiedServerPerpsPositionClosure} from './perps-position-closure.js';
const pending="('RESERVED','SIGNING','UNCERTAIN')";
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
    for(const [name,type]of [['position_address','TEXT'],['confirmed_slot','INTEGER'],['closed_slot','INTEGER']])if(!columns.has(name))db.exec(`ALTER TABLE perps_reservations ADD COLUMN ${name} ${type}`);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  const get=id=>db.prepare('SELECT * FROM perps_reservations WHERE reservation=?').get(identifier(id));
  function transaction(fn){
    db.exec('BEGIN IMMEDIATE');
    try{const result=fn();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  return {
    close(){db.close();},
    read(id){return plain(get(id));},
    readSignal(wallet,signal){return plain(db.prepare('SELECT * FROM perps_reservations WHERE wallet=? AND signal=?').get(key(wallet,32),identifier(signal)));},
    riskState(wallet){return transaction(()=>{
      key(wallet,32);const time=now(),today=day(time);
      const held=db.prepare(`SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(wallet);
      const active=db.prepare("SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state='OPEN'").get(wallet);
      const counted=db.prepare("SELECT COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND day=? AND state IN ('OPEN','CLOSED')").get(wallet,today).count;
      integer(held.margin,'INVALID_BALANCE');integer(active.margin,'INVALID_BALANCE');integer(counted,'INVALID_ACCOUNT');
      return Object.freeze({walletAddress:wallet,day:today,observedAt:time,pendingMarginUsdcUnits:String(held.margin),pendingCount:held.count,
        activeMarginUsdcUnits:String(active.margin),openReservationCount:active.count,executedToday:counted});
    });},
    pending(wallet){return db.prepare(`SELECT * FROM perps_reservations WHERE wallet=? AND state IN ${pending} ORDER BY created,reservation`).all(key(wallet,32)).map(plain);},
    openPositions(wallet){return db.prepare("SELECT * FROM perps_reservations WHERE wallet=? AND state='OPEN' ORDER BY created,reservation").all(key(wallet,32)).map(plain);},
    reserve({walletAddress,signalId,reservationId,marginUsd,limits,snapshot,positionAddress=null}){
      const wallet=key(walletAddress,32),signal=identifier(signalId),id=identifier(reservationId);
      const margin=amount(marginUsd),capital=amount(limits?.capitalUsd),loss=amount(limits?.dailyLossUsd);
      const positions=integer(limits?.positions,'INVALID_POSITION_LIMIT'),daily=integer(limits?.dailyTrades,'INVALID_DAILY_LIMIT');
      if(positionAddress!==null)key(positionAddress,32);
      if(positions<1||positions>10||daily<1||daily>100||margin<10000000||loss>capital)throw Error('INVALID_LIMITS');
      const time=now(),today=day(time);
      if(snapshot?.walletAddress!==wallet||snapshot?.network!=='solana-mainnet'||snapshot?.balancesComplete!==true
          ||!Number.isSafeInteger(snapshot?.observedAt)||time-snapshot.observedAt>10000||snapshot.observedAt>time+2000
          ||snapshot?.day!==today)throw Error('STALE_OR_UNRECONCILED_ACCOUNT');
      const available=units(snapshot.availableUsdcUnits),allocated=units(snapshot.allocatedUsdcUnits),lost=units(snapshot.lossTodayUsdcUnits);
      const open=integer(snapshot.openPositions,'INVALID_ACCOUNT'),trades=integer(snapshot.tradesToday,'INVALID_ACCOUNT');
      return transaction(()=>{
        if(db.prepare('SELECT 1 FROM perps_reservations WHERE wallet=? AND signal=?').get(wallet,signal))throw Error('DUPLICATE_SIGNAL');
        const held=db.prepare(`SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(wallet);
        const active=db.prepare("SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state='OPEN'").get(wallet);
        const counted=db.prepare("SELECT COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND day=? AND state IN ('OPEN','CLOSED')").get(wallet,today).count;
        if(margin>available-held.margin)throw Error('INSUFFICIENT_UNRESERVED_BALANCE');
        if(Math.max(allocated,active.margin)+held.margin+margin>capital)throw Error('CAPITAL_LIMIT');
        if(lost+Math.max(allocated,active.margin)+held.margin+margin>loss)throw Error('DAILY_LOSS_LIMIT');
        if(Math.max(open,active.count)+held.count>=positions)throw Error('POSITION_LIMIT');
        // Old-day unknown attempts may still land today. Midnight cannot free
        // their daily slots or their collateral without chain reconciliation.
        if(Math.max(trades,counted)+held.count>=daily)throw Error('DAILY_TRADE_LIMIT');
        db.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated,position_address) VALUES(?,?,?,?,?,'RESERVED',?,?,?)").run(wallet,signal,id,today,margin,time,time,positionAddress);
        return plain(get(id));
      });
    },
    // Persist before handing the request to any signer. A crash is not cancellation.
    revalidateSigning(id,{limits,snapshot}){return transaction(()=>{
      const row=get(id);if(row?.state!=='SIGNING')throw Error('INVALID_TRANSITION');
      const capital=amount(limits?.capitalUsd),loss=amount(limits?.dailyLossUsd),positions=integer(limits?.positions,'INVALID_POSITION_LIMIT'),daily=integer(limits?.dailyTrades,'INVALID_DAILY_LIMIT');
      if(positions<1||positions>10||daily<1||daily>100||loss>capital)throw Error('INVALID_LIMITS');
      const time=now(),today=day(time);
      if(snapshot?.walletAddress!==row.wallet||snapshot.network!=='solana-mainnet'||snapshot.balancesComplete!==true||snapshot.day!==today
        ||!Number.isSafeInteger(snapshot.observedAt)||time-snapshot.observedAt>10000||snapshot.observedAt>time+2000)throw Error('STALE_OR_UNRECONCILED_ACCOUNT');
      const available=units(snapshot.availableUsdcUnits),allocated=units(snapshot.allocatedUsdcUnits),lost=units(snapshot.lossTodayUsdcUnits);
      const open=integer(snapshot.openPositions,'INVALID_ACCOUNT'),trades=integer(snapshot.tradesToday,'INVALID_ACCOUNT');
      const held=db.prepare(`SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state IN ${pending}`).get(row.wallet);
      const active=db.prepare("SELECT COALESCE(SUM(margin),0) AS margin,COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND state='OPEN'").get(row.wallet);
      const counted=db.prepare("SELECT COUNT(*) AS count FROM perps_reservations WHERE wallet=? AND day=? AND state IN ('OPEN','CLOSED')").get(row.wallet,today).count;
      // The current SIGNING row is already in held: do not charge it twice or
      // subtract it from another process's reservation.
      if(held.margin>available)throw Error('INSUFFICIENT_UNRESERVED_BALANCE');
      if(Math.max(allocated,active.margin)+held.margin>capital)throw Error('CAPITAL_LIMIT');
      if(lost+Math.max(allocated,active.margin)+held.margin>loss)throw Error('DAILY_LOSS_LIMIT');
      if(Math.max(open,active.count)+held.count>positions)throw Error('POSITION_LIMIT');
      if(Math.max(trades,counted)+held.count>daily)throw Error('DAILY_TRADE_LIMIT');
      return plain(row);
    });},
    beginSigning(id){return transaction(()=>{
      const row=get(id);if(row?.state!=='RESERVED')throw Error('INVALID_TRANSITION');
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
      if(!isVerifiedPerpsBroadcastReceipt(receipt)||row?.state!=='UNCERTAIN'
          ||receipt.walletAddress!==row.wallet||receipt.signature!==row.signature||receipt.wireHash!==row.wire_hash
          ||time-receipt.observedAt>10000||receipt.observedAt>time+2000)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
      // Rejected chain transactions consume a conservative daily slot but no
      // open-position collateral. CLOSED here does not claim a profitable exit.
      const next=receipt.state==='CONFIRMED'?'OPEN':'CLOSED';
      db.prepare('UPDATE perps_reservations SET state=?,day=?,updated=?,confirmed_slot=? WHERE reservation=?').run(next,receipt.executionDay,time,receipt.slot,id);
      return plain(get(id));
    });},
    reconcileClosedPosition(id,closure){return transaction(()=>{
      const proof=requireVerifiedServerPerpsPositionClosure(closure),row=get(id),time=now();
      if(row?.state!=='OPEN'||row.wallet!==proof.walletAddress||row.signature!==proof.signature||row.wire_hash!==proof.wireHash||row.position_address!==proof.positionAddress
       ||row.reservation!==proof.reservationId||proof.day!==day(time)||time-proof.observedAt>10000||proof.observedAt>time+2000
       ||!Number.isSafeInteger(row.confirmed_slot)||proof.observedSlot<row.confirmed_slot)throw Error('VERIFIED_RECONCILIATION_REQUIRED');
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
  };
}
