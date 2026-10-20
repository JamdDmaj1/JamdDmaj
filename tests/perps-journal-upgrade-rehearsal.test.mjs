import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,chmodSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {rehearsePausedEmptyPerpsJournalUpgrade} from '../lib/perps-journal-upgrade-rehearsal.js';
const wallet='11111111111111111111111111111111',owner='a'.repeat(64),now=1792454400000;
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'jamd-upgrade-test-'));chmodSync(directory,0o700);t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const controlsPath=join(directory,'controls.sqlite'),journalPath=join(directory,'journal.sqlite');
 const controls=openPerpsAutomationControls(controlsPath,{now:()=>now});controls.provision({ownerAccountHash:owner,walletAddress:wallet,settings:{capital:100,loss:50,positions:2,margin:10,leverage:3,dailyTrades:5}});controls.close();
 const journal=openPerpsExecutionJournal(journalPath);journal.close();
 const raw=new DatabaseSync(journalPath);raw.exec('DROP TABLE perps_position_closes; DROP TABLE perps_exit_cancellations');raw.close();
 for(const file of [controlsPath,journalPath])chmodSync(file,0o600);
 const input={controlsPath,journalPath,temporaryDirectory:directory,explicitRehearsalApproval:true,allowNonPosixForTests:process.platform==='win32'};
 return {directory,controlsPath,journalPath,input};
}
function contents(path){const db=new DatabaseSync(path,{readOnly:true});try{return {schema:db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),reservations:db.prepare('SELECT * FROM perps_reservations').all()};}finally{db.close();}}
test('paused empty legacy journal is upgraded only in disposable snapshot and live schema remains unchanged',async t=>{
 const f=fixture(t),before=contents(f.journalPath),result=await rehearsePausedEmptyPerpsJournalUpgrade(f.input);
 assert.equal(result.stage,'PAUSED_EMPTY_JOURNAL_UPGRADE_REHEARSED');assert.equal(result.accounts,1);assert.equal(result.reservations,0);
 assert.equal(result.liveStoresReplaced,false);assert.equal(result.custodyKeysRead,false);assert.equal(result.tradingEnabled,false);assert.equal(result.readyForSigning,false);
 assert.notEqual(result.sourceSnapshotSha256,result.candidateSnapshotSha256);assert.deepEqual(contents(f.journalPath),before);
 assert.ok(readdirSync(f.directory).every(name=>!name.startsWith('jamd-')));
});
test('rehearsal refuses active controls, any reservation, foreign schema and absent explicit rehearsal approval',async t=>{
 for(const mode of ['active','rows','foreign','approval','alias']){
  const f=fixture(t);
  if(mode==='active'){const db=new DatabaseSync(f.controlsPath);db.exec('UPDATE perps_automation_controls SET enabled=1,paused=0');db.close();}
  if(mode==='rows'){const db=new DatabaseSync(f.journalPath);db.prepare("INSERT INTO perps_reservations(wallet,signal,reservation,day,margin,state,created,updated) VALUES(?,?,?,?,?,'CANCELLED',?,?)").run(wallet,'past','past','2026-10-20',10000000,now,now);db.close();}
  if(mode==='foreign'){const db=new DatabaseSync(f.journalPath);db.exec('CREATE TABLE foreign_data(value TEXT)');db.close();}
  const before=contents(f.journalPath),input={...f.input,...mode==='approval'?{explicitRehearsalApproval:false}:{},...mode==='alias'?{journalPath:f.controlsPath}:{}};
  await assert.rejects(()=>rehearsePausedEmptyPerpsJournalUpgrade(input),/PERPS_JOURNAL_UPGRADE_REHEARSAL_UNAVAILABLE/);
  assert.deepEqual(contents(f.journalPath),before);assert.ok(readdirSync(f.directory).every(name=>!name.startsWith('jamd-')));
 }
});
