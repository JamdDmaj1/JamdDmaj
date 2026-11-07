import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const output='.perps-build/close-conservation-20261107';await mkdir(output,{recursive:true});
const manifest={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
execFileSync('git',['diff','--exit-code','HEAD','--','lib','scripts','ops/install-close-conservation-fix.mjs'],{stdio:'pipe'});
for(const [name,entry]of Object.entries({worker:'scripts/perps-server-worker.mjs',web:'scripts/perps-web-service.mjs'})){
 const file=output+'/'+name+'.mjs';
 await build({entryPoints:[entry],outfile:file,bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:'import {createRequire as __jamdCreateRequire} from "node:module";const require=__jamdCreateRequire(import.meta.url);'}});
 manifest[name]=createHash('sha256').update(await readFile(file)).digest('hex');
}
await writeFile(output+'/manifest.json',JSON.stringify(manifest));console.log(JSON.stringify(manifest));
