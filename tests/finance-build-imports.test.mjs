import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
test('built finance entry has a complete browser-loadable module graph, including native navigation and authenticated controls',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 await promisify(execFile)(process.execPath,['scripts/build-web.mjs'],{cwd:root});
 const result=await build({absWorkingDir:root,entryPoints:['www/lib/terminal-layout.js'],bundle:true,write:false,format:'esm',platform:'browser',target:['es2020'],metafile:true,
  plugins:[{name:'no-bare-browser-imports',setup(builder){builder.onResolve({filter:/^[^./]/},args=>args.kind==='entry-point'?undefined:{errors:[{text:'A shipped browser module contains an unresolved package import: '+args.path}]});}}]});
 const inputs=Object.keys(result.metafile.inputs);
 for(const name of ['perps-navigation.js','perps-control-client.js','perps-control-panel.js','finance-route.js'])assert.ok(inputs.includes('www/lib/'+name),name);
 assert.equal(inputs.some(name=>name.startsWith('node_modules/')),false);
});
