import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const target=resolve(process.argv[2]||'');
if(!target.startsWith(resolve('.perps-build')+'\\')||existsSync(target))throw Error('New build directory required');
const files=execFileSync('git',['ls-tree','-r','--name-only','HEAD'],{encoding:'utf8'}).trim().split('\n');
const selected=files.filter(p=>/^(api|lib|scripts|\.well-known)\//.test(p)||(!p.includes('/')&&(/\.(html|css|js|png)$/.test(p)||['package.json','package-lock.json','vercel.json','manifest.json','robots.txt','sitemap.xml'].includes(p))));
for(const p of selected){const out=resolve(target,p);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,execFileSync('git',['show','HEAD:'+p],{maxBuffer:20000000}));}
mkdirSync(resolve(target,'.vercel'),{recursive:true});
copyFileSync('.perps-build/release-1383-web/.vercel/project.json',resolve(target,'.vercel/project.json'));
console.log('Exported',selected.length,'committed public files to',target);
