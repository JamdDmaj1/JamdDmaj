// Binary-only reviewed update. No database migration, key access, trade,
// policy mutation or activation. Original close-fix installer is NOT invoked.
import {readReviewedBinaryFinancialState} from './reviewed-financial-state.mjs';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,copyFileSync,chmodSync,renameSync,constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root='/opt/jamddmaj-perps',candidate=root+'/checks/entry-freshness-20261107';
const old={worker:'158fa791910425f0ad2e8f64e19c9eada4b06c5eb33bfafd2833391aa9fce561',web:'270050d9b4c3ff38a670de275326f2065b5cb67f290e6fd58ceaeaa1ea27dffe'};
const units=['jamddmaj-perps-worker','jamddmaj-perps-web','jamddmaj-perps-https'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Error('ENTRY_FIX_UPDATE_REFUSED');};
const ctl=(...args)=>execFileSync('systemctl',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}).trim();
const state=()=>readReviewedBinaryFinancialState();
function regular(path){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0)fail();}
async function healthy(){for(let attempt=0;attempt<30;attempt++){
 try{for(const unit of units)if(ctl('is-active',unit)!=='active')fail();
  for(const port of [8788,8789]){const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1000)}),v=await r.json();if(!r.ok||v.ok!==true||v.tradingEnabled!==false)fail();}return;
 }catch{}await new Promise(resolve=>setTimeout(resolve,250));
}fail();}
const action=process.argv.slice(2).join(' ');if(process.platform!=='linux'||process.getuid()!==0||!['--preflight','--apply-reviewed-entry-fix'].includes(action))fail();
const manifest=JSON.parse(readFileSync(candidate+'/manifest.json','utf8'));
if(Object.keys(manifest).sort().join(',')!=='sourceCommit,web,worker'||!/^[a-f0-9]{40}$/.test(manifest.sourceCommit)||!['worker','web'].every(k=>/^[a-f0-9]{64}$/.test(manifest[k])))fail();
const binaries=['worker','web'].map(name=>({name,target:root+'/'+name+'/'+(name==='worker'?'perps-server-worker':'perps-web-service')+'.mjs',source:candidate+'/'+name+'.mjs',backup:root+'/backups/entry-freshness-20261107-'+name+'.mjs'}));
let phase='preflight',stopped=false,done=false;const installed=[];
try{
 await healthy();const baseline=state();
 for(const b of binaries){regular(b.target);regular(b.source);if(hash(readFileSync(b.target))!==old[b.name]||hash(readFileSync(b.source))!==manifest[b.name])fail();execFileSync('/usr/bin/node',['--check',b.source],{stdio:'pipe'});}
 if(action==='--preflight'){console.log(JSON.stringify({stage:'ENTRY_FIX_PREFLIGHT_OK',noPendingSigning:true,allAutomationPaused:true}));done=true;}
 else{
  phase='backup';for(const b of binaries){copyFileSync(b.target,b.backup,constants.COPYFILE_EXCL);chmodSync(b.backup,0o600);}
  phase='stop';stopped=true;for(const unit of [...units].reverse())ctl('stop',unit);
  for(const unit of units)if(ctl('show',unit,'--property=MainPID','--value')!=='0')fail();
  phase='state-recheck';if(state().digest!==baseline.digest)fail();
  phase='replace';for(const b of binaries){const staged=b.target+'.entry-fix-staged';copyFileSync(b.source,staged,constants.COPYFILE_EXCL);chmodSync(staged,0o644);renameSync(staged,b.target);installed.push(b);}
  phase='start';for(const unit of units)ctl('start',unit);await healthy();
  phase='verify';for(const b of binaries)if(hash(readFileSync(b.target))!==manifest[b.name])fail();if(state().digest!==baseline.digest)fail();
  done=true;console.log(JSON.stringify({stage:'ENTRY_FIX_INSTALLED',sourceCommit:manifest.sourceCommit,allServicesHealthy:true,financialStateUnchanged:true,policiesChanged:false,financialSends:0}));
 }
}catch{console.error(JSON.stringify({stage:'ENTRY_FIX_UPDATE_REFUSED',phase}));process.exitCode=1;}
finally{if(stopped&&!done){try{
 for(const unit of [...units].reverse())ctl('stop',unit);
 for(const b of installed){if(hash(readFileSync(b.target))!==manifest[b.name]||hash(readFileSync(b.backup))!==old[b.name])fail();copyFileSync(b.backup,b.target);chmodSync(b.target,0o644);}
 for(const unit of units)ctl('start',unit);await healthy();console.error('PREVIOUS_BINARIES_RESTORED_NO_DATABASE_RESTORE');
}catch{console.error('ENTRY_FIX_OPERATOR_REVIEW_REQUIRED');}}}
