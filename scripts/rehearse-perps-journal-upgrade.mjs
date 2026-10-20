// Explicit read-only/live-store rehearsal, not a migration or worker command.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {rehearsePausedEmptyPerpsJournalUpgrade} from '../lib/perps-journal-upgrade-rehearsal.js';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [controlsPath,journalPath,temporaryDirectory,approval,...extra]=process.argv.slice(2);
  if(approval!=='--explicit-rehearsal-approval'||extra.length)throw Error();
  console.log(JSON.stringify(await rehearsePausedEmptyPerpsJournalUpgrade({controlsPath,journalPath,temporaryDirectory,explicitRehearsalApproval:true})));
 }catch(error){console.error(JSON.stringify({code:'PERPS_JOURNAL_UPGRADE_REHEARSAL_UNAVAILABLE',phase:error?.phase??'INPUT'}));process.exitCode=1;}
}
