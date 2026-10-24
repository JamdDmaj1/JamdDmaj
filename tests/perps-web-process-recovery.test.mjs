import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {openPerpsAutomationControls} from '../lib/perps-automation-controls.js';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {openWebPerpsSubmissionJournal} from '../lib/perps-web-submission-journal.js';
import {openManualPerpsPolicyStore} from '../lib/perps-manual-policy-store.js';
import {openWebPerpsReviewDb} from '../lib/perps-web-review-db.js';
import {fixtureWallet as walletAddress} from './helpers/perps-history-fixture.mjs';
test('Linux manual CLI drains SIGTERM, preserves policy across process restart and refuses a crash-stale lease without resetting stores',{skip:process.platform==='win32'},async t=>{
 const directory=mkdtempSync(join(tmpdir(),'jamd-web-process-fixture-'));chmodSync(directory,0o700);const locks=join(directory,'locks');mkdirSync(locks,{mode:0o700});
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 openPerpsAutomationControls(join(directory,'controls.sqlite')).close();openPerpsExecutionJournal(join(directory,'journal.sqlite')).close();
 openWebPerpsSubmissionJournal({filename:join(directory,'web-submissions.sqlite')}).close();
 const policyPath=join(directory,'manual-policy.sqlite'),policy=openManualPerpsPolicyStore(policyPath,{initialize:true});
 const who={ownerAccountHash:'a'.repeat(64),walletAddress},saved=policy.save({...who,limits:{capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5},expectedRevision:null,explicitApproval:true});policy.close();
 openWebPerpsReviewDb(join(directory,'web-reviews.sqlite'),{initialize:true}).close();
 for(const name of ['controls.sqlite','journal.sqlite','web-submissions.sqlite','manual-policy.sqlite','web-reviews.sqlite'])chmodSync(join(directory,name),0o600);
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const cli=process.env.JAMDDMAJ_TEST_WEB_SERVICE_CLI||fileURLToPath(new URL('../scripts/perps-web-service.mjs',import.meta.url));let child=null;
 t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill('SIGKILL');await exit;}});
 const start=()=>{child=spawn(process.execPath,[cli],{stdio:['ignore','ignore','pipe'],env:{PATH:process.env.PATH,JAMDDMAJ_PERPS_RUNTIME_DIRECTORY:directory,JAMDDMAJ_PERPS_CONTROLS_DIRECTORY:directory,RUNTIME_DIRECTORY:locks,JAMDDMAJ_PERPS_WEB_PORT:String(port),JAMDDMAJ_PERPS_WEB_EXECUTION_APPROVED:'false'}});child.stderr.resume();return child;};
 async function ready(){for(let n=0;n<100;n++){
  if(child.exitCode!==null)throw Error('FIXTURE_SERVICE_EXITED');
  try{const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(300)});if(r.ok){const body=await r.json();assert.equal(body.tradingEnabled,false);assert.equal(body.executionAvailable,false);return;}}catch{}
  await delay(25);
 }throw Error('FIXTURE_SERVICE_NOT_READY');}
 function unchanged(){const store=openManualPerpsPolicyStore(policyPath);try{assert.deepEqual(store.read(who),saved);}finally{store.close();}
  const journal=openWebPerpsSubmissionJournal({filename:join(directory,'web-submissions.sqlite'),requireExisting:true});try{assert.equal(journal.pending(walletAddress),null);}finally{journal.close();}}
 start();await ready();const firstExit=once(child,'exit');child.kill('SIGTERM');assert.deepEqual(await firstExit,[0,null]);assert.equal(existsSync(join(locks,'web-service.lock')),false);unchanged();
 start();await ready();unchanged();const crash=once(child,'exit');child.kill('SIGKILL');assert.equal((await crash)[1],'SIGKILL');assert.equal(existsSync(join(locks,'web-service.lock')),true);
 start();const [code]=await once(child,'exit');assert.equal(code,1);unchanged();assert.equal(existsSync(join(locks,'web-service.lock')),true);
 assert.equal(existsSync(join(directory,'keys')),false);assert.equal(existsSync(join(directory,'wallets')),false);
});
