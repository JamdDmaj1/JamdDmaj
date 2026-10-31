// Secret-free prebuilt packaging for the existing Edge deployment. No login,
// env pull, remote install/build, deploy, alias, cron or financial invocation.
import {mkdir,cp,readdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,relative,join,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));
const PROJECT={projectId:'prj_MDNgTRQMQhZHy0Np4HuKiqTKbsjd',orgId:'team_JORXYGzaQKli6kcSkgcGRU33',projectName:'jamd-dmaj'};
function fail(){throw Error('VERCEL_CANDIDATE_UNVERIFIED');}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function candidateRouting(config){
 if(Object.keys(config).sort().join(',')!=='$schema,buildCommand,headers,outputDirectory'||config.buildCommand!=='npm run build'||config.outputDirectory!=='www'
  ||config.headers?.length!==3||config.headers[0].source!=='/firebase-messaging-sw.js'||config.headers[1].source!=='/wallet-web(.*)'||config.headers[2].source!=='/(.*)')fail();
 const workerHeaders=Object.fromEntries(config.headers[0].headers.map(row=>[row.key,row.value]));
 if(workerHeaders['Service-Worker-Allowed']!=='/'||workerHeaders['Cache-Control']!=='no-cache, no-store, must-revalidate'||workerHeaders['Content-Type']!=='application/javascript; charset=utf-8')fail();
 const routes=[...config.headers].reverse().map(rule=>{
  const headers={};for(const row of rule.headers){if(typeof row.key!=='string'||typeof row.value!=='string'||headers[row.key]!==undefined)fail();headers[row.key]=row.value;}
  return {src:rule.source,headers,continue:true};
 });
 return {version:3,routes:[...routes,{src:'/',dest:'/index.html'},{handle:'filesystem'}]};
}
export function candidateEnvironmentNames(code){
 if(/process\.env\s*\[/.test(code))fail();
 return [...new Set([...code.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g)].map(row=>row[1]))].sort();
}
async function regularTree(directory){
 const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name),stat=await lstat(path);if(stat.isSymbolicLink())fail();
  if(stat.isDirectory())files.push(...await regularTree(path));else if(stat.isFile()&&stat.nlink===1)files.push(path);else fail();
 }return files.sort();
}
export async function buildVercelCandidate(destination){
 if(!isAbsolute(destination))fail();destination=resolve(destination);
 const allowed=resolve(root,'.perps-build'),inside=relative(allowed,destination);
 if(!inside||inside.startsWith('..')||isAbsolute(inside))fail();
 // Packaging can include only committed public/Edge inputs. Native platform
 // edits belonging to the owner are not overwritten, copied or committed here.
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const tracked=new Set(execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean));
 const changed=execFileSync('git',['diff','--name-only','HEAD','--','*.js','*.mjs','*.css','*.html','*.json'],{cwd:root,encoding:'utf8'}).trim();
 if(changed)fail();
 for(const file of ['scripts/build-web.mjs','scripts/build-vercel-candidate.mjs','package.json','package-lock.json','vercel.json'])if(!tracked.has(file))fail();
 await mkdir(destination,{recursive:false,mode:0o700}); // Never overwrite an earlier candidate.
 const output=join(destination,'.vercel','output');await mkdir(output,{recursive:true});
 const config=candidateRouting(JSON.parse(await readFile(join(root,'vercel.json'),'utf8')));
 // The public web build receives no inherited service/auth/provider variables.
 const env=Object.fromEntries(['PATH','SystemRoot','TEMP','TMP'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
 execFileSync(process.execPath,[join(root,'scripts','build-web.mjs')],{cwd:root,env,stdio:['ignore','pipe','pipe'],timeout:60000});
 const staticFiles=await regularTree(join(root,'www'));
 if(!staticFiles.length)fail();
 await cp(join(root,'www'),join(output,'static'),{recursive:true,errorOnExist:true,force:false});
 const entries=await readdir(join(root,'api'),{withFileTypes:true});
 if(entries.some(row=>!row.isFile()||!/^[-a-z0-9]+\.js$/.test(row.name)))fail();
 const manifest={version:1,sourceCommit,project:PROJECT,environment:'production',secretFreeBuild:true,functions:[],files:[]};
 for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
  const source=join(root,'api',entry.name),sourceText=await readFile(source,'utf8');
  if(!/export const config\s*=\s*\{\s*runtime:\s*["']edge["']\s*\}/.test(sourceText))fail();
  const result=await build({entryPoints:[source],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',metafile:true,logLevel:'silent'});
  for(const input of Object.keys(result.metafile.inputs)){
   const file=relative(root,resolve(input)).replaceAll('\\','/');if(!file.startsWith('node_modules/')&&!tracked.has(file))fail();
  }
  const bytes=result.outputFiles[0].contents,code=new TextDecoder().decode(bytes);if(gzipSync(bytes).length>1000000)fail();
  const envVarsInUse=candidateEnvironmentNames(code),name=entry.name.slice(0,-3),directory=join(output,'functions','api',name+'.func');
  await mkdir(directory,{recursive:true});await writeFile(join(directory,'index.js'),bytes,{flag:'wx'});
  await writeFile(join(directory,'.vc-config.json'),JSON.stringify({runtime:'edge',entrypoint:'index.js',envVarsInUse}),{flag:'wx'});
  manifest.functions.push({path:'/api/'+name,sha256:hash(bytes),envVarsInUse});
 }
 await writeFile(join(output,'config.json'),JSON.stringify(config),{flag:'wx'});
 await writeFile(join(destination,'.vercel','project.json'),JSON.stringify(PROJECT),{flag:'wx'});
 for(const path of await regularTree(output))manifest.files.push({path:relative(output,path).replaceAll('\\','/'),sha256:hash(await readFile(path))});
 // Provenance is private packaging metadata, never a public static asset.
 await writeFile(join(destination,'candidate-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
 return {destination,sourceCommit,functions:manifest.functions.length,staticFiles:staticFiles.length,manifestSha256:hash(Buffer.from(JSON.stringify(manifest,null,2)))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{if(process.argv.length!==3)fail();console.log(JSON.stringify(await buildVercelCandidate(process.argv[2])));}
 catch{console.error('VERCEL_CANDIDATE_UNVERIFIED');process.exitCode=1;}
}
