import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {databaseFingerprint} from '../ops/install-close-conservation-fix.mjs';
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
