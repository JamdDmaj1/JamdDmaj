// Export a new, private, key-free-by-file-policy handoff from committed HEAD.
// No .git history, runtime state, environment values, deployments or network.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const target='C:/Users/JamdDmaj/Desktop/JamdDmaj-TRASPASO-2026-11-07';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(args,options={})=>execFileSync('git',args,{cwd:root,maxBuffer:256*1024*1024,...options});
const commit=git(['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tree=git(['ls-tree','-rz','--full-tree',commit],{encoding:'utf8'}).split('\0').filter(Boolean).map(line=>{const [meta,path]=line.split('\t');const [mode,type,object]=meta.split(' ');return {mode,type,object,path};});
const excluded=[],selected=tree.filter(row=>{
 const deny=row.type!=='blob'||!['100644','100755'].includes(row.mode)||/(^|\/)(\.git|\.vercel|\.perps-build|node_modules)(\/|$)/.test(row.path)
  ||/(^|\/)\.env(?:\.|$)/.test(row.path)||/\.(?:sqlite(?:-wal|-shm)?|db|key|pem|pfx|p12|jks|keystore|zip|age|apk|aab)$/i.test(row.path)
  ||/(^|\/)(?:google-services\.json|GoogleService-Info\.plist|key\.properties|local\.properties|auth\.json|credentials\.json)$/i.test(row.path);
 if(deny)excluded.push({path:row.path,reason:'credential-state-generated-or-nonregular-file policy'});return !deny;
});
const batch=git(['cat-file','--batch'],{input:selected.map(row=>row.object+'\n').join('')});
let offset=0;const files=[];
for(const row of selected){const end=batch.indexOf(10,offset);if(end<0)throw Error('INVALID_GIT_BATCH');const header=batch.subarray(offset,end).toString('utf8'),match=/^([a-f0-9]{40}) blob ([0-9]+)$/.exec(header);if(!match||match[1]!==row.object)throw Error('INVALID_GIT_BLOB');const size=Number(match[2]),data=batch.subarray(end+1,end+1+size);if(data.length!==size||batch[end+1+size]!==10)throw Error('INVALID_GIT_BLOB_SIZE');offset=end+2+size;files.push({path:row.path,data,provenance:'committed-head'});}
const optional=['build-entry-confirm-diagnostic.mjs','check-closed-history-server.mjs','diagnose-entry-authorization-isolated.mjs','diagnose-entry-confirm-readonly.mjs','verify-entry-history-deployment.mjs','verify-recorded-history-readonly.mjs'];
const extras=optional.map(name=>({path:'scripts/'+name,data:readFileSync(join(root,'scripts',name)),provenance:'untracked-local-diagnostic-not-published'}));
const signatures=[['private-key-pem',/-----BEGIN (?:OPENSSH |RSA |EC |ENCRYPTED )?PRIVATE KEY-----/],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],['aws-access-key',/\bAKIA[A-Z0-9]{16}\b/],['provider-secret-token',/\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/]];
const findings=[];
for(const file of [...files,...extras]){if(!/\.(?:js|mjs|json|txt|md|ps1|yml|yaml|gradle|java|kt|swift|html|properties|conf|sh)$/.test(file.path))continue;const text=file.data.toString('utf8');for(const [rule,pattern]of signatures)if(pattern.test(text))findings.push({path:file.path,rule});}
console.log(JSON.stringify({stage:'HANDOFF_SCAN',commit,files:files.length,optionalDiagnostics:extras.length,excluded:excluded.map(v=>v.path),findings}));
if(findings.length)throw Error('SECRET_REVIEW_REQUIRED_NO_PACKAGE_WRITTEN');
if(process.argv.includes('--scan-only'))process.exit(0);
if(existsSync(target))throw Error('HANDOFF_TARGET_ALREADY_EXISTS');
mkdirSync(target,{mode:0o700});
function put(base,path,data){const filename=resolve(base,path),inside=relative(resolve(base),filename);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('HANDOFF_PATH_REFUSED');mkdirSync(dirname(filename),{recursive:true});writeFileSync(filename,data,{flag:'wx'});}
const inventory=[];
for(const file of files){put(join(target,'PROYECTO'),file.path,file.data);inventory.push({path:'PROYECTO/'+file.path,bytes:file.data.length,sha256:hash(file.data),provenance:file.provenance});}
for(const file of extras){put(join(target,'DIAGNOSTICOS_OPCIONALES'),file.path,file.data);inventory.push({path:'DIAGNOSTICOS_OPCIONALES/'+file.path,bytes:file.data.length,sha256:hash(file.data),provenance:file.provenance});}
for(const name of ['00_LEEME_PRIMERO.txt','01_MENSAJE_PARA_LA_OTRA_IA.txt','02_ESTADO_Y_GUIA_TECNICA.txt'])put(target,name,readFileSync(join(root,'handoff',name)));
const variables=new Set();
for(const file of files)if(/\.(?:js|mjs|ps1|conf)$/.test(file.path))for(const m of file.data.toString('utf8').matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g))variables.add(m[1]);
for(const m of git(['show',commit+':.env.example'],{encoding:'utf8'}).matchAll(/^([A-Z][A-Z0-9_]*)=/gm))variables.add(m[1]);
put(target,'05_VARIABLES_SIN_VALORES.env.example',Buffer.from('# Inventario de nombres; NO es una configuracion lista para ejecutar.\n# Autorizar servicios por canales seguros. No activar operaciones por defecto.\n'+[...variables].sort().map(name=>name+'=\n').join('')));
put(join(target,'DIAGNOSTICOS_OPCIONALES'),'LEEME.txt',Buffer.from('Herramientas locales NO publicadas y NO necesarias para npm run build:web. Revisar antes de usar. Para conservar sus imports relativos, copiar solo las elegidas a PROYECTO/scripts, sin sobrescribir nada. Las rutas Windows, SSH, PIDs y destinos temporales deben revisarse. Algunas leen configuracion privada y crean copias aisladas de SQLite; no ejecutarlas ni subir sus resultados por rutina. No contienen las credenciales necesarias para acceder a produccion.\n'));
put(target,'03_INVENTARIO.json',Buffer.from(JSON.stringify({snapshotCommit:commit,branch:'codex/bot-wallet-manual-futures',origin:'https://github.com/JamdDmaj1/JamdDmaj.git',remoteContainsSnapshot:'not-verified',gitHistoryIncluded:false,files:inventory},null,2)));
put(target,'04_REVISION_DE_SECRETOS.json',Buffer.from(JSON.stringify({date:'2026-11-07',scope:'HEAD snapshot plus six allowlisted local diagnostic sources; no git history',credentialFilesExcluded:true,runtimeDatabasesIncluded:false,privateWalletMaterialIncluded:false,environmentValuesIncluded:false,publicClientConfigurationRetained:true,patterns:signatures.map(v=>v[0]),findings,excluded,limitations:'Automatic pattern and file-policy review, NOT an independent audit or exhaustive guarantee. Private operational source; review before redistribution.'},null,2)));
for(const file of inventory)if(hash(readFileSync(join(target,file.path)))!==file.sha256)throw Error('HANDOFF_INTEGRITY_CHECK_FAILED');
console.log(JSON.stringify({stage:'HANDOFF_EXPORTED',destination:target,sourceFiles:files.length,diagnostics:extras.length,sourceBytes:files.reduce((sum,v)=>sum+v.data.length,0)}));
