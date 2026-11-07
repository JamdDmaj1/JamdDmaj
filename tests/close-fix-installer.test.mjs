import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {databaseFingerprint} from '../ops/install-close-conservation-fix.mjs';
import {readReviewedBinaryFinancialState,reviewedDatabaseFingerprint} from '../ops/reviewed-financial-state.mjs';
test('installer fingerprint preserves open financial rows, schema, limits and exact large integers without writing state',t=>{
 const dir=mkdtempSync(join(tmpdir(),'close-fix-check-'));const path=join(dir,'state.sqlite'),db=new DatabaseSync(path);t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 db.exec("CREATE TABLE financial(id TEXT,state TEXT,units INTEGER);CREATE TABLE quota(n INTEGER);INSERT INTO financial VALUES('position','OPEN',9223372036854775807);INSERT INTO quota VALUES(1)");
 const before=databaseFingerprint(path,['quota']);assert.equal(databaseFingerprint(path,['quota']),before);
 db.exec('UPDATE quota SET n=2');assert.equal(databaseFingerprint(path,['quota']),before);
 db.exec("UPDATE financial SET state='CLOSED'");assert.notEqual(databaseFingerprint(path,['quota']),before);
 db.exec("UPDATE financial SET state='OPEN'");assert.equal(databaseFingerprint(path,['quota']),before);
 db.exec('UPDATE financial SET units=9223372036854775806');assert.notEqual(databaseFingerprint(path,['quota']),before);
 db.exec('CREATE TABLE unexpected(extra TEXT)');assert.notEqual(databaseFingerprint(path,['quota']),before);
});

test('binary update retains terminal unsigned history but refuses every live or signed hold',t=>{
 const directory=mkdtempSync(join(tmpdir(),'entry-update-guard-')),files={},dbs={};
 t.after(()=>{for(const db of Object.values(dbs))db.close();rmSync(directory,{recursive:true,force:true});});
 for(const name of ['controls','journal','policy','swaps','fees','payments','backup']){files[name]=join(directory,name+'.sqlite');dbs[name]=new DatabaseSync(files[name]);}
 dbs.controls.exec('CREATE TABLE perps_automation_controls(enabled INTEGER,paused INTEGER);INSERT INTO perps_automation_controls VALUES(0,1);CREATE TABLE perps_control_request_quota(n INTEGER)');
 dbs.journal.exec("CREATE TABLE perps_reservations(reservation TEXT,state TEXT);INSERT INTO perps_reservations VALUES('entry','CANCELLED');CREATE TABLE perps_position_closes(state TEXT);CREATE TABLE perps_close_conversions(state TEXT);CREATE TABLE perps_exit_cancellations(state TEXT);CREATE TABLE perps_platform_fee_locks(state TEXT);CREATE TABLE perps_entry_conversion_holds(reservation TEXT,conversion_id TEXT,state TEXT,signature TEXT,wire_hash TEXT);INSERT INTO perps_entry_conversion_holds VALUES('entry','swap','HELD',NULL,NULL)");
 dbs.swaps.exec("CREATE TABLE bot_wallet_swaps(id TEXT,state TEXT,signature TEXT,signed TEXT);INSERT INTO bot_wallet_swaps VALUES('swap','ABORTED',NULL,NULL)");
 dbs.fees.exec('CREATE TABLE perps_platform_fee_assessments(id TEXT)');dbs.payments.exec('CREATE TABLE perps_platform_fee_payments(assessment_id TEXT,state TEXT)');
 const before=reviewedDatabaseFingerprint(files.journal),state=readReviewedBinaryFinancialState({files});assert.equal(state.open,0);assert.equal(reviewedDatabaseFingerprint(files.journal),before);
 for(const status of ['RESERVED','SIGNING','UNCERTAIN','OPEN']){dbs.journal.prepare('UPDATE perps_reservations SET state=?').run(status);assert.throws(()=>readReviewedBinaryFinancialState({files}));}dbs.journal.exec("UPDATE perps_reservations SET state='CANCELLED'");
 for(const status of ['SIGNING','UNKNOWN','FAILED','FINALIZED']){dbs.swaps.prepare('UPDATE bot_wallet_swaps SET state=?').run(status);assert.throws(()=>readReviewedBinaryFinancialState({files}));}dbs.swaps.exec("UPDATE bot_wallet_swaps SET state='ABORTED'");
 for(const column of ['signature','signed']){dbs.swaps.exec('UPDATE bot_wallet_swaps SET '+column+"='not-empty'");assert.throws(()=>readReviewedBinaryFinancialState({files}));dbs.swaps.exec('UPDATE bot_wallet_swaps SET '+column+'=NULL');}
 for(const column of ['signature','wire_hash']){dbs.journal.exec('UPDATE perps_entry_conversion_holds SET '+column+"='not-empty'");assert.throws(()=>readReviewedBinaryFinancialState({files}));dbs.journal.exec('UPDATE perps_entry_conversion_holds SET '+column+'=NULL');}
 assert.equal(readReviewedBinaryFinancialState({files}).digest,state.digest);
});
