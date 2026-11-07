// Exact reviewed bundle replacement only; no database migration or financial I/O.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,lstatSync,copyFileSync,chmodSync,renameSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const target='/opt/jamddmaj-perps/worker/perps-server-worker.mjs';
const candidate='/opt/jamddmaj-perps/checks/manual-helius-paced-worker-final-20261107.mjs';
const backup='/opt/jamddmaj-perps/backups/read-pacing-20261107-worker.mjs';
const staged='/opt/jamddmaj-perps/worker/read-pacing-20261107-staged.mjs';
const oldHash='d5e4825e56bc8623f3fca65c9510e06d988f07d9281d3d8f7ead5e3e1c3ec469';
const newHash='1804229f6783a8a61c8a0897b11ac04bb21173e6291fcff48d5240bce7b25b02';
const units=['jamddmaj-perps-worker','jamddmaj-perps-web','jamddmaj-perps-https'];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const ctl=(...args)=>execFileSync('systemctl',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fail(){throw Error('READ_PACING_INSTALL_REFUSED');}
function idle(){
 for(const [path,sql]of [
  ['/var/lib/private/jamddmaj-perps-controls/controls.sqlite','SELECT COUNT(*) AS n FROM perps_automation_controls WHERE enabled<>0 OR paused<>1'],
  ['/var/lib/private/jamddmaj-perps-runtime/journal.sqlite','SELECT COUNT(*) AS n FROM perps_reservations'],
  ['/var/lib/private/jamddmaj-perps-runtime/swaps.sqlite',"SELECT COUNT(*) AS n FROM bot_wallet_swaps WHERE state NOT IN ('ABORTED','FAILED','FINALIZED')"]]){
  const d=new DatabaseSync(path,{readOnly:true});try{if(d.prepare(sql).get().n!==0)fail();}finally{d.close();}
 }
}
async function healthy(){
 for(let i=0;i<25;i++){
  try{for(const unit of units)if(ctl('is-active',unit)!=='active')fail();
   for(const port of [8788,8789]){const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1000)}),h=await r.json();if(!r.ok||h.ok!==true||h.tradingEnabled!==false)fail();}return;
  }catch{}await new Promise(resolve=>setTimeout(resolve,250));
 }fail();
}
let stopped=false,installed=false,done=false;
try{
 if(process.platform!=='linux'||process.getuid()!==0||process.argv.slice(2).join(' ')!=='--apply-reviewed-read-pacing')fail();
 for(const path of [target,candidate]){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0)fail();}
 if(hash(target)!==oldHash||hash(candidate)!==newHash)fail();idle();
 execFileSync('/usr/bin/node',['--check',candidate],{stdio:'pipe'});
 copyFileSync(target,backup,constants.COPYFILE_EXCL);chmodSync(backup,0o600);
 ctl('stop',...units.slice().reverse());stopped=true;
 for(const unit of units)if(ctl('show',unit,'--property=MainPID','--value')!=='0')fail();idle();
 copyFileSync(candidate,staged,constants.COPYFILE_EXCL);chmodSync(staged,0o644);renameSync(staged,target);installed=true;
 ctl('start',...units);await healthy();idle();
 if(hash(target)!==newHash)fail();done=true;
 console.log(JSON.stringify({stage:'READ_PACING_INSTALLED',allServicesHealthy:true,tradingEnabled:false,storesChanged:false,sendsPerformed:0}));
}catch{console.error('READ_PACING_INSTALL_REFUSED');process.exitCode=1;}
finally{if(stopped&&!done){try{ctl('stop',...units.slice().reverse());if(installed){if(hash(target)!==newHash||hash(backup)!==oldHash)fail();copyFileSync(backup,target);chmodSync(target,0o644);}ctl('start',...units);await healthy();console.error('PREVIOUS_BUNDLE_RESTORED');}catch{console.error('READ_PACING_OPERATOR_REVIEW_REQUIRED');}}}
