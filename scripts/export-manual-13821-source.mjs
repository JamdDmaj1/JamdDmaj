// Export committed public build inputs only; never copy working secrets/state.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
const root=resolve(import.meta.dirname,'..'),destination=resolve(root,'.perps-build/manual-futures-13821-candidate');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
execFileSync('git',['diff','--exit-code','HEAD','--','*.js','*.mjs','*.json','*.html','*.css'],{cwd:root,stdio:'pipe'});
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).filter(path=>
 /^(api|lib|scripts|\.well-known)\//.test(path)||!path.includes('/')&&/\.(html|css|js|json|svg|png|ico|webmanifest)$/.test(path));
if(files.some(path=>/(^|\/)(\.env|node_modules|\.vercel|\.perps-build)(\/|\.|$)/.test(path)))throw Error('SOURCE_EXPORT_REFUSED');
mkdirSync(destination,{mode:0o700});
for(const path of files){const target=resolve(destination,path),inside=relative(destination,target);if(inside.startsWith('..')||isAbsolute(inside))throw Error('SOURCE_EXPORT_REFUSED');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,execFileSync('git',['show',commit+':'+path],{cwd:root,maxBuffer:16*1024*1024}),{flag:'wx'});}
mkdirSync(resolve(destination,'.vercel'));writeFileSync(resolve(destination,'.vercel/project.json'),JSON.stringify({projectId:'prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd',orgId:'team_JORXYGzaQKli6kcSkgcGRU33',projectName:'jamd-dmaj'}),{flag:'wx'});
console.log(JSON.stringify({sourceCommit:commit,files:files.length,destination}));
