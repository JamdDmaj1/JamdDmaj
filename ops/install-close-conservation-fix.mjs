// Reviewed binary-only update with OPEN positions retained. No keys, state
// migrations, journal writes, policy changes, activation or financial calls.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,copyFileSync,chmodSync,renameSync,constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root='/opt/jamddmaj-perps',candidate=root+'/checks/close-conservation-20261107';
const runtime='/var/lib/private/jamddmaj-perps-runtime',controls='/var/lib/private/jamddmaj-perps-controls';
const files={controls:controls+'/controls.sqlite',journal:runtime+'/journal.sqlite',policy:runtime+'/manual-policy.sqlite',swaps:runtime+'/swaps.sqlite',fees:runtime+'/fees.sqlite',payments:runtime+'/payments.sqlite',backup:runtime+'/backup.sqlite'};
const units=['jamddmaj-perps-worker','jamddmaj-perps-web','jamddmaj-perps-https'];
const old={worker:'61fe8f1e03ebf435f3b8c312c83bc25144c9c856728ea451e7ee678a538de540',web:'fa287cadf5ec929bddd90af4c2178643a19dfde81dc7e1ca3547ad77f0c00ee5'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?{$integer:String(x)}:x);
const fail=()=>{throw Error('CLOSE_FIX_INSTALL_REFUSED');};
function regular(path){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())fail();}
export function databaseFingerprint(path,excluded=[]){
 regular(path);const db=new DatabaseSync(path,{readOnly:true});
 try{
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail();
  const schema=db.prepare("SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const rows=schema.filter(v=>v.type==='table'&&!excluded.includes(v.name)).map(v=>{
   if(!/^[a-z_][a-z0-9_]*$/.test(v.name))fail();const statement=db.prepare('SELECT * FROM "'+v.name+'"');statement.setReadBigInts(true);
   return [v.name,statement.all().map(encode).sort()];
  });return hash(encode([schema,rows]));
 }finally{db.close();}
}
function count(path,sql){const db=new DatabaseSync(path,{readOnly:true});try{return Number(db.prepare(sql).get().n);}finally{db.close();}}
function state(){
 for(const [file,sql]of [
  ['controls','SELECT COUNT(*) n FROM perps_automation_controls WHERE enabled<>0 OR paused<>1'],
  ['journal',"SELECT COUNT(*) n FROM perps_reservations WHERE state NOT IN ('OPEN','CLOSED','CANCELLED')"],
  ['journal',"SELECT COUNT(*) n FROM perps_position_closes WHERE state='PREPARED'"],
  ['journal',"SELECT COUNT(*) n FROM perps_close_conversions WHERE state!='FINALIZED'"],
  ['journal',"SELECT COUNT(*) n FROM perps_exit_cancellations WHERE state IN ('PREPARED','SIGNING','UNCERTAIN')"],
  ['journal',"SELECT COUNT(*) n FROM perps_platform_fee_locks WHERE state='HELD'"],
  ['journal',"SELECT COUNT(*) n FROM perps_entry_conversion_holds WHERE state='HELD'"],
  ['swaps',"SELECT COUNT(*) n FROM bot_wallet_swaps WHERE state NOT IN ('ABORTED','FAILED','FINALIZED')"],
  ['payments',"SELECT COUNT(*) n FROM perps_platform_fee_payments WHERE state IN ('SIGNING','UNKNOWN')"]])if(count(files[file],sql)!==0)fail();
 const fees=new DatabaseSync(files.fees,{readOnly:true}),payments=new DatabaseSync(files.payments,{readOnly:true});
 try{for(const row of fees.prepare('SELECT id FROM perps_platform_fee_assessments').all())if(payments.prepare("SELECT 1 FROM perps_platform_fee_payments WHERE assessment_id=? AND state='PAID'").get(row.id)===undefined)fail();}
 finally{fees.close();payments.close();}
 const digests=Object.entries(files).map(([name,path])=>[name,databaseFingerprint(path,name==='controls'?['perps_control_request_quota']:[])]);
 return {digest:hash(encode(digests)),open:count(files.journal,"SELECT COUNT(*) n FROM perps_reservations WHERE state='OPEN'")};
}
const ctl=(...args)=>execFileSync('systemctl',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}).trim();
async function healthy(){for(let i=0;i<30;i++){
 try{for(const unit of units)if(ctl('is-active',unit)!=='active')fail();
  for(const port of [8788,8789]){const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1000)}),v=await r.json();if(!r.ok||v.ok!==true||v.tradingEnabled!==false)fail();}return;
 }catch{}await new Promise(r=>setTimeout(r,250));
}fail();}
async function main(){
 const action=process.argv.slice(2).join(' ');if(process.platform!=='linux'||process.getuid()!==0||!['--preflight','--apply-reviewed-close-fix'].includes(action))fail();
 let phase='preflight',stopped=false,done=false;const installed=[];
 const manifest=JSON.parse(readFileSync(candidate+'/manifest.json','utf8'));
 if(Object.keys(manifest).sort().join(',')!=='sourceCommit,web,worker'||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit)||!['worker','web'].every(k=>/^[a-f0-9]{64}$/.test(manifest[k])))fail();
 const binaries=['worker','web'].map(name=>({name,target:root+'/'+name+'/'+(name==='worker'?'perps-server-worker':'perps-web-service')+'.mjs',candidate:candidate+'/'+name+'.mjs',backup:root+'/backups/close-conservation-20261107-'+name+'.mjs'}));
 try{
  await healthy();const baseline=state();
  for(const b of binaries){for(const path of [b.target,b.candidate]){regular(path);if(lstatSync(path).uid!==0)fail();}if(hash(readFileSync(b.target))!==old[b.name]||hash(readFileSync(b.candidate))!==manifest[b.name])fail();execFileSync('/usr/bin/node',['--check',b.candidate],{stdio:'pipe'});}
  if(action==='--preflight'){console.log(JSON.stringify({stage:'CLOSE_FIX_PREFLIGHT_OK',openPositionsPreserved:true,noPendingActions:true,allAutomationPaused:true}));return;}
  phase='backup';for(const b of binaries){copyFileSync(b.target,b.backup,constants.COPYFILE_EXCL);chmodSync(b.backup,0o600);}
  phase='stop';stopped=true;for(const unit of [...units].reverse())ctl('stop',unit);
  for(const unit of units)if(ctl('show',unit,'--property=MainPID','--value')!=='0')fail();
  phase='state-recheck';if(state().digest!==baseline.digest)fail();
  phase='replace';for(const b of binaries){const staged=b.target+'.close-fix-staged';copyFileSync(b.candidate,staged,constants.COPYFILE_EXCL);chmodSync(staged,0o644);renameSync(staged,b.target);installed.push(b);}
  phase='start';for(const unit of units)ctl('start',unit);await healthy();
  phase='verify';for(const b of binaries)if(hash(readFileSync(b.target))!==manifest[b.name])fail();if(state().digest!==baseline.digest)fail();
  done=true;console.log(JSON.stringify({stage:'CLOSE_FIX_INSTALLED',sourceCommit:manifest.sourceCommit,allServicesHealthy:true,financialStateUnchanged:true,openPositionsPreserved:true,policiesChanged:false,financialSends:0}));
 }catch{console.error(JSON.stringify({stage:'CLOSE_FIX_INSTALL_REFUSED',phase}));process.exitCode=1;}
 finally{if(stopped&&!done){try{
  for(const unit of [...units].reverse())ctl('stop',unit);
  for(const b of installed){if(hash(readFileSync(b.target))!==manifest[b.name]||hash(readFileSync(b.backup))!==old[b.name])fail();copyFileSync(b.backup,b.target);chmodSync(b.target,0o644);}
  for(const unit of units)ctl('start',unit);await healthy();console.error('PREVIOUS_BINARIES_RESTORED_NO_DATABASE_RESTORE');
 }catch{console.error('CLOSE_FIX_OPERATOR_REVIEW_REQUIRED');}}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
