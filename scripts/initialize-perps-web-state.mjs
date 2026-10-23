// Explicit operator-only creation of NEW empty manual stores. Never a startup
// migration, reset, wallet creation or financial approval.
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {checkPrivateRecoveryPath as check,writePrivateRecoveryFile as write,syncPrivateRecoveryDirectory as sync} from '../lib/perps-recovery-private-files.js';
import {inspectExistingPerpsRuntimeDatabases} from '../lib/perps-runtime-recovery.js';
import {openWebPerpsSubmissionJournal} from '../lib/perps-web-submission-journal.js';
import {openManualPerpsPolicyStore} from '../lib/perps-manual-policy-store.js';
import {openWebPerpsReviewDb} from '../lib/perps-web-review-db.js';
try{
 if(process.argv.slice(2).join(' ')!=='--create-empty-manual-stores')throw Error();
 const directory=check(process.env.JAMDDMAJ_PERPS_RUNTIME_DIRECTORY,true).path,controls=check(process.env.JAMDDMAJ_PERPS_CONTROLS_DIRECTORY,true).path;
 inspectExistingPerpsRuntimeDatabases({controlsPath:join(controls,'controls.sqlite'),journalPath:join(directory,'journal.sqlite')});
 const files=['web-submissions.sqlite','manual-policy.sqlite','web-reviews.sqlite'],marker=join(directory,'manual-stores-initializing');
 if(existsSync(marker)||files.some(name=>existsSync(join(directory,name))))throw Error();
 write(marker,'Explicit initialization in progress; never delete partial financial stores to retry.');
 openWebPerpsSubmissionJournal({filename:join(directory,files[0])}).close();
 openManualPerpsPolicyStore(join(directory,files[1]),{initialize:true}).close();
 openWebPerpsReviewDb(join(directory,files[2]),{initialize:true}).close();
 sync(directory);
 // Marker remains as an initialization audit, including on partial failure.
 console.log('MANUAL_STORES_INITIALIZED_EXECUTION_DISABLED');
}catch{console.error('MANUAL_STORE_INITIALIZATION_REFUSED');process.exitCode=1;}
