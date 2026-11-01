import {build} from 'esbuild';
await build({entryPoints:['scripts/perps-server-worker.mjs'],bundle:true,platform:'node',format:'esm',
 banner:{js:'import {createRequire as __jamdCreateRequire} from "node:module";const require=__jamdCreateRequire(import.meta.url);'},
 outfile:'../bot-manual-worker-candidate.mjs'});
