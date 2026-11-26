// Durable association between an automatic signal and its Phoenix workflow.
// Separate from the strict manual journal: it never signs, sends or mutates a
// manual workflow, and it is the only source used to decide which Phoenix
// positions belong to automation.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute} from 'node:path';

const STATES = new Set(['OPENING', 'OPEN', 'CLOSING', 'CLOSED', 'FAILED']);
function fail() { throw Error('PHOENIX_AUTO_JOURNAL_UNAVAILABLE'); }
function text(value, max = 120) {
  if (typeof value !== 'string' || !value || value.length > max || /[\x00-\x1f]/.test(value)) fail();
  return value;
}
function units(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value)) fail();
  return value;
}

export function openPhoenixAutoJournal(path, {now = Date.now} = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || typeof now !== 'function') fail();
  const db = new DatabaseSync(path, {timeout: 5000});
  db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS phoenix_auto_signals(
   signal TEXT PRIMARY KEY,
   workflow TEXT,
   symbol TEXT NOT NULL,
   side TEXT NOT NULL CHECK(side IN('LONG','SHORT')),
   margin TEXT NOT NULL,
   entry TEXT NOT NULL,
   sl TEXT NOT NULL,
   tp1 TEXT NOT NULL,
   state TEXT NOT NULL CHECK(state IN('OPENING','OPEN','CLOSING','CLOSED','FAILED')),
   created INTEGER NOT NULL,
   updated INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS phoenix_auto_state ON phoenix_auto_signals(state);
  CREATE TABLE IF NOT EXISTS phoenix_auto_lessons(
   signal TEXT PRIMARY KEY,
   workflow TEXT,
   symbol TEXT NOT NULL,
   side TEXT NOT NULL CHECK(side IN('LONG','SHORT')),
   outcome TEXT NOT NULL CHECK(outcome IN('TP','SL','CLOSED','FAILED')),
   entry TEXT NOT NULL,
   exit TEXT,
   pnl TEXT,
   reason TEXT,
   created INTEGER NOT NULL,
   updated INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS phoenix_auto_lessons_updated ON phoenix_auto_lessons(updated);
  CREATE TABLE IF NOT EXISTS phoenix_auto_tracking(
   signal TEXT PRIMARY KEY,
   best TEXT NOT NULL,
   worst TEXT NOT NULL,
   updated INTEGER NOT NULL
  ) STRICT;`);
  const at = () => { const value = now(); if (!Number.isSafeInteger(value) || value < 0) fail(); return value; };
  function read(row) { return row ? Object.freeze({...row}) : null; }
  return Object.freeze({
    reserve({signal, symbol, side, margin, entry, sl, tp1}) {
      const time = at();
      db.prepare('INSERT INTO phoenix_auto_signals(signal,workflow,symbol,side,margin,entry,sl,tp1,state,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(text(signal, 180), null, text(symbol, 32), side === 'SHORT' ? 'SHORT' : side === 'LONG' ? 'LONG' : fail(),
          units(margin), units(entry), units(sl), units(tp1), 'OPENING', time, time);
      return read(db.prepare('SELECT * FROM phoenix_auto_signals WHERE signal=?').get(signal));
    },
    attach(signal, workflow) {
      const time = at();
      db.prepare('UPDATE phoenix_auto_signals SET workflow=?,state=?,updated=? WHERE signal=?').run(text(workflow, 64), 'OPEN', time, text(signal, 180));
      return read(db.prepare('SELECT * FROM phoenix_auto_signals WHERE signal=?').get(signal));
    },
    fail(signal) {
      db.prepare('UPDATE phoenix_auto_signals SET state=?,updated=? WHERE signal=?').run('FAILED', at(), text(signal, 180));
    },
    closing(signal) {
      db.prepare('UPDATE phoenix_auto_signals SET state=?,updated=? WHERE signal=? AND state=?').run('CLOSING', at(), text(signal, 180), 'OPEN');
    },
    markClosed(signal) {
      db.prepare('UPDATE phoenix_auto_signals SET state=?,updated=? WHERE signal=?').run('CLOSED', at(), text(signal, 180));
    },
    read(signal) { return read(db.prepare('SELECT * FROM phoenix_auto_signals WHERE signal=?').get(text(signal, 180))); },
    open() { return db.prepare("SELECT * FROM phoenix_auto_signals WHERE state IN('OPENING','OPEN','CLOSING') ORDER BY created").all().map(read); },
    byWorkflow(workflow) { return read(db.prepare('SELECT * FROM phoenix_auto_signals WHERE workflow=?').get(text(workflow, 64))); },
    lesson({signal, workflow = null, symbol, side, outcome, entry, exit = null, pnl = null, reason = null, ifMissing = false}) {
      if (!['TP', 'SL', 'CLOSED', 'FAILED'].includes(outcome)) fail();
      if (entry != null && !/^(0|[1-9][0-9]{0,19})$/.test(String(entry))) fail();
      if (exit != null && !/^(0|[1-9][0-9]{0,19})$/.test(String(exit))) fail();
      if (pnl != null && !/^-?(0|[1-9][0-9]{0,19})$/.test(String(pnl))) fail();
      const time = at();
      const conflict = ifMissing === true
        ? 'DO NOTHING'
        : `DO UPDATE SET workflow=excluded.workflow,symbol=excluded.symbol,side=excluded.side,outcome=excluded.outcome,
          entry=excluded.entry,exit=excluded.exit,pnl=excluded.pnl,reason=excluded.reason,updated=excluded.updated`;
      db.prepare(`INSERT INTO phoenix_auto_lessons(signal,workflow,symbol,side,outcome,entry,exit,pnl,reason,created,updated)
        VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(signal) ${conflict}`)
        .run(text(signal, 180), workflow == null ? null : text(workflow, 64), text(symbol, 32),
          side === 'SHORT' ? 'SHORT' : side === 'LONG' ? 'LONG' : fail(), outcome,
          String(entry), exit == null ? null : String(exit), pnl == null ? null : String(pnl),
          reason == null ? null : text(String(reason), 240), time, time);
      return read(db.prepare('SELECT * FROM phoenix_auto_lessons WHERE signal=?').get(signal));
    },
    lessons(limit = 50) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) fail();
      return db.prepare('SELECT * FROM phoenix_auto_lessons ORDER BY updated DESC LIMIT ?').all(limit).map(read);
    },
    track({signal, best, worst}) {
      const time = at();
      db.prepare(`INSERT INTO phoenix_auto_tracking(signal,best,worst,updated) VALUES(?,?,?,?)
        ON CONFLICT(signal) DO UPDATE SET best=excluded.best,worst=excluded.worst,updated=excluded.updated`)
        .run(text(signal, 180), units(String(best)), units(String(worst)), time);
      return read(db.prepare('SELECT * FROM phoenix_auto_tracking WHERE signal=?').get(signal));
    },
    tracking(signal) {
      return read(db.prepare('SELECT * FROM phoenix_auto_tracking WHERE signal=?').get(text(signal, 180)));
    },
    dispose() { try { db.close(); } catch {} }
  });
}

