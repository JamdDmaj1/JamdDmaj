// Exact binary update; never edits policies, controls, balances or schema.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,lstatSync,copyFileSync,chmodSync,renameSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const units=['jamddmaj-perps-worker','jamddmaj-perps-web','jamddmaj-perps-https'];
const binaries=[
 ['worker','/opt/jamddmaj-perps/worker/perps-server-worker.mjs','1804229f6783a8a61c8a0897b11ac04bb21173e6291fcff48d5240bce7b25b02','61fe8f1e03ebf435f3b8c312c83bc25144c9c856728ea451e7ee678a538de540'],
 ['web','/opt/jamddmaj-perps/web/perps-web-service.mjs','e1421ef4b6215cfcdfb57110a68968744d6d55a47d38b1f65d7dd7609e646bb6','fa287cadf5ec929bddd90af4c2178643a19dfde81dc7e1ca3547ad77f0c00ee5']
].map(([name,target,oldHash,newHash])=>({target,oldHash,newHash,candidate:'/opt/jamddmaj-perps/checks/manual-per-order-'+name+'-13821.mjs',backup:'/opt/jamddmaj-perps/backups/manual-per-order-13821-'+name+'.mjs',staged:target+'.13821-staged'}));
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const ctl=(...args)=>execFileSync('systemctl',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fail(){throw Error('MANUAL_PER_ORDER_INSTALL_REFUSED');}
function idle(){
 for(const [path,sql]of [
  ['/var/lib/private/jamddmaj-perps-controls/controls.sqlite','SELECT COUNT(*) AS n FROM perps_automation_controls WHERE enabled<>0 OR paused<>1'],
  ['/var/lib/private/jamddmaj-perps-runtime/journal.sqlite','SELECT COUNT(*) AS n FROM perps_reservations'],
  ['/var/lib/private/jamddmaj-perps-runtime/swaps.sqlite',"SELECT COUNT(*) AS n FROM bot_wallet_swaps WHERE state NOT IN ('ABORTED','FAILED','FINALIZED')"]]){
  const d=new DatabaseSync(path,{readOnly:true});try{if(d.prepare(sql).get().n!==0)fail();}finally{d.close();}
 }
 const d=new DatabaseSync('/var/lib/private/jamddmaj-perps-runtime/manual-policy.sqlite',{readOnly:true});
 try{return JSON.stringify(d.prepare('SELECT * FROM perps_manual_policies ORDER BY owner,wallet').all());}finally{d.close();}
}
async function healthy(){for(let i=0;i<25;i++){
 try{for(const unit of units)if(ctl('is-active',unit)!=='active')fail();
  for(const port of [8788,8789]){const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1000)}),h=await r.json();if(!r.ok||h.ok!==true||h.tradingEnabled!==false)fail();}return;
 }catch{}await new Promise(resolve=>setTimeout(resolve,250));
}fail();}
let stopped=false,done=false;const installed=[];
try{
 if(process.platform!=='linux'||process.getuid()!==0||process.argv.slice(2).join(' ')!=='--apply-reviewed-per-order-update')fail();
 const policy=idle();
 for(const b of binaries){for(const path of [b.target,b.candidate]){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0)fail();}
  if(digest(b.target)!==b.oldHash||digest(b.candidate)!==b.newHash)fail();
  execFileSync('/usr/bin/node',['--check',b.candidate],{stdio:'pipe'});
  copyFileSync(b.target,b.backup,constants.COPYFILE_EXCL);chmodSync(b.backup,0o600);
 }
 ctl('stop',...units.slice().reverse());stopped=true;
 for(const unit of units)if(ctl('show',unit,'--property=MainPID','--value')!=='0')fail();
 if(idle()!==policy)fail();
 for(const b of binaries){copyFileSync(b.candidate,b.staged,constants.COPYFILE_EXCL);chmodSync(b.staged,0o644);renameSync(b.staged,b.target);installed.push(b);}
 ctl('start',...units);await healthy();if(idle()!==policy)fail();
 for(const b of binaries)if(digest(b.target)!==b.newHash)fail();done=true;
 console.log(JSON.stringify({stage:'MANUAL_PER_ORDER_13821_INSTALLED',allServicesHealthy:true,policiesChanged:false,controlsChanged:false,schemaChanged:false,financialSends:0}));
}catch{console.error('MANUAL_PER_ORDER_INSTALL_REFUSED');process.exitCode=1;}
finally{if(stopped&&!done){try{ctl('stop',...units.slice().reverse());for(const b of installed){if(digest(b.target)!==b.newHash||digest(b.backup)!==b.oldHash)fail();copyFileSync(b.backup,b.target);chmodSync(b.target,0o644);}ctl('start',...units);await healthy();console.error('PREVIOUS_BINARIES_RESTORED_NO_DATABASE_RESTORE');}catch{console.error('MANUAL_PER_ORDER_OPERATOR_REVIEW_REQUIRED');}}}
