// Operator-approved read-RPC configuration only. Never signs or sends a trade.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,lstatSync,realpathSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const input='/root/jamddmaj-helius-rpc-20261107.input';
const envFile='/etc/jamddmaj-perps/helius-read-rpc.env';
const dropin='/etc/systemd/system/jamddmaj-perps-worker.service.d/80-read-rpc.conf';
const unit='jamddmaj-perps-worker';
const made=[];
let stopped=false,done=false;
function fail(){throw Error('HELIUS_READ_RPC_SETUP_REFUSED');}
function systemctl(...args){return execFileSync('systemctl',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function privateFile(path){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o777)!==0o600||s.nlink!==1||s.size>2048)fail();}
function safeParent(path){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o022)!==0||realpathSync(path)!==path)fail();}
function idle(){
 const paths={controls:'/var/lib/private/jamddmaj-perps-controls/controls.sqlite',journal:'/var/lib/private/jamddmaj-perps-runtime/journal.sqlite',swaps:'/var/lib/private/jamddmaj-perps-runtime/swaps.sqlite'};
 const opened=[];try{
  for(const path of Object.values(paths)){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600)fail();}
  const db=kind=>{const d=new DatabaseSync(paths[kind],{readOnly:true});opened.push(d);return d;};
  const rows=db('controls').prepare('SELECT enabled,paused FROM perps_automation_controls').all();
  if(!rows.length||rows.some(r=>r.enabled!==0||r.paused!==1))fail();
  if(db('journal').prepare('SELECT COUNT(*) AS n FROM perps_reservations').get().n!==0)fail();
  if(db('swaps').prepare("SELECT COUNT(*) AS n FROM bot_wallet_swaps WHERE state NOT IN ('ABORTED','FAILED','FINALIZED')").get().n!==0)fail();
 }finally{for(const d of opened)d.close();}
}
try {
 if(process.platform!=='linux'||process.getuid()!==0||process.argv.slice(2).join(' ')!=='--apply-reviewed-read-rpc')fail();
 privateFile(input);safeParent('/etc/jamddmaj-perps');safeParent('/etc/systemd/system/jamddmaj-perps-worker.service.d');
 const raw=readFileSync(input,'utf8').replace(/^\uFEFF/,'').trim();
 let valid=false;try{const u=new URL(raw);valid=u.protocol==='https:'&&u.hostname==='mainnet.helius-rpc.com'&&u.pathname==='/'&&!u.username&&!u.password&&!u.hash&&/^[a-zA-Z0-9_-]{20,200}$/.test(u.searchParams.get('api-key')||'')&&[...u.searchParams.keys()].every(k=>k==='api-key');}catch{}
 if(!valid)fail();
 // Refuse overwriting any existing operator configuration.
 for(const path of [envFile,dropin]){try{lstatSync(path);fail();}catch(e){if(e.code!=='ENOENT')throw e;}}
 idle();if(systemctl('is-active',unit)!=='active')fail();
 systemctl('stop',unit);stopped=true;
 if(systemctl('show',unit,'--property=MainPID','--value')!=='0')fail();idle();
 for(const [path,content,mode] of [[envFile,'JAMDDMAJ_PERPS_RPC_URL='+raw+'\n',0o600],[dropin,'[Service]\nEnvironmentFile='+envFile+'\n',0o644]]){
  writeFileSync(path,content,{flag:'wx',mode});made.push({path,ino:lstatSync(path).ino});
 }
 systemctl('daemon-reload');systemctl('start',unit);
 let healthy=false;
 for(let i=0;i<20;i++){
  try{const r=await fetch('http://127.0.0.1:8788/health',{signal:AbortSignal.timeout(1000)});const h=await r.json();if(r.ok&&h.ok===true&&h.tradingEnabled===false&&systemctl('is-active',unit)==='active'){healthy=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 if(!healthy)fail();idle();
 // These boundaries bind their lifetime to the worker and stop with it.
 systemctl('start','jamddmaj-perps-web','jamddmaj-perps-https');
 for(const dependent of ['jamddmaj-perps-web','jamddmaj-perps-https'])if(systemctl('is-active',dependent)!=='active')fail();
 const pid=systemctl('show',unit,'--property=MainPID','--value');
 if(!readFileSync('/proc/'+pid+'/environ','utf8').split('\0').includes('JAMDDMAJ_PERPS_RPC_URL='+raw))fail();
 done=true;
 console.log(JSON.stringify({stage:'HELIUS_READ_RPC_CONFIGURED',healthy:true,tradingEnabled:false,credentialsPrinted:false,sendTransportChanged:false,storesChanged:false}));
}catch{console.error('HELIUS_READ_RPC_SETUP_REFUSED');process.exitCode=1;}
finally{
 if(stopped&&!done){
  try{systemctl('stop',unit);for(const file of made.reverse()){const s=lstatSync(file.path);if(s.ino!==file.ino||s.isSymbolicLink())fail();unlinkSync(file.path);}systemctl('daemon-reload');systemctl('start',unit);systemctl('start','jamddmaj-perps-web','jamddmaj-perps-https');console.error('PREVIOUS_READ_RPC_CONFIGURATION_RESTORED');}
  catch{console.error('READ_RPC_OPERATOR_RECOVERY_REQUIRED');}
 }
}
