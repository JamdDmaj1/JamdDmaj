// Revalidate the real recorded close on an isolated SQLite copy. No network,
// custody keys, signatures, recovery, policy changes or live database writes.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdtempSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {openPerpsExecutionJournal} from '../lib/perps-execution-journal.js';
import {closedTradePerformance} from '../lib/closed-trade-performance.js';
const directory=mkdtempSync('/opt/jamddmaj-perps/checks/history-verification-');chmodSync(directory,0o700);
const source=new DatabaseSync('/var/lib/private/jamddmaj-perps-runtime/journal.sqlite',{readOnly:true});let wallet;
try{wallet=source.prepare("SELECT wallet FROM perps_position_closes WHERE state='COMPLETED' ORDER BY updated DESC LIMIT 1").get()?.wallet;await backup(source,join(directory,'journal.sqlite'));}finally{source.close();}
if(!wallet)throw Error('NO_COMPLETED_HISTORY_TO_VERIFY');chmodSync(join(directory,'journal.sqlite'),0o600);
const journal=openPerpsExecutionJournal(join(directory,'journal.sqlite'));
try{const history=journal.finalizedPositionCloseHistory(wallet);if(!history.snapshots.length||history.snapshots.some(v=>v.execution.state!=='FIRST_LEG_FINALIZED'))throw Error('HISTORY_VERIFICATION_FAILED');const results=history.snapshots.map(snapshot=>{const final=snapshot.completion?JSON.parse(snapshot.completion.record_json):null;return closedTradePerformance(snapshot,final?.receivedUsdcUnits??null);});console.log(JSON.stringify({stage:'RECORDED_HISTORY_VERIFIED',count:history.snapshots.length,completed:history.snapshots.filter(v=>v.close.state==='COMPLETED').length,performanceAvailable:results.filter(Boolean).length,liveStateChanged:false,financialSends:0}));}finally{journal.close();}
