// Read-only operational readiness; never prints identities, credentials or balances.
import {DatabaseSync} from 'node:sqlite';
const paths={controls:'/var/lib/private/jamddmaj-perps-controls/controls.sqlite',journal:'/var/lib/private/jamddmaj-perps-runtime/journal.sqlite',swaps:'/var/lib/private/jamddmaj-perps-runtime/swaps.sqlite',policy:'/var/lib/private/jamddmaj-perps-runtime/manual-policy.sqlite'};
const stores=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,new DatabaseSync(p,{readOnly:true})]));
try{
 const count=(db,sql)=>db.prepare(sql).get().n;
 const result={activeAccounts:count(stores.controls,'SELECT COUNT(*) AS n FROM perps_automation_controls WHERE enabled=1 OR paused=0'),
  pendingEntries:count(stores.journal,"SELECT COUNT(*) AS n FROM perps_reservations WHERE state IN ('RESERVED','SIGNING','UNCERTAIN')"),
  openEntries:count(stores.journal,"SELECT COUNT(*) AS n FROM perps_reservations WHERE state='OPEN'"),
  pendingCloses:count(stores.journal,"SELECT COUNT(*) AS n FROM perps_position_closes WHERE state='PREPARED'"),
  pendingSwaps:count(stores.swaps,"SELECT COUNT(*) AS n FROM bot_wallet_swaps WHERE state IN ('SIGNING','UNKNOWN')"),
  manualPolicyRows:count(stores.policy,'SELECT COUNT(*) AS n FROM perps_manual_policies')};
 console.log(JSON.stringify(result));if(result.activeAccounts||result.pendingEntries||result.openEntries||result.pendingCloses||result.pendingSwaps)process.exitCode=1;
}finally{Object.values(stores).forEach(d=>d.close());}
