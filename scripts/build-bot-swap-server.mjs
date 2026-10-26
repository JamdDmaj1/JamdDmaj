import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
const output='.perps-build/bot-swap-server-20261026';await mkdir(output,{recursive:true});
const entries={worker:'scripts/perps-server-worker.mjs',web:'scripts/perps-web-service.mjs',recovery:'scripts/perps-recovery-operator.mjs',upgrade:'scripts/upgrade-paused-perps-journal.mjs',rehearsal:'scripts/rehearse-perps-journal-upgrade.mjs',initialize:'scripts/initialize-bot-swap-journal.mjs',linuxTests:'tests/perps-bot-swap-service.test.mjs'};
for(const [name,entry]of Object.entries(entries))await build({entryPoints:[entry],outfile:output+'/'+name+'.mjs',bundle:true,platform:'node',format:'esm',target:'node24',external:['node:sqlite'],banner:{js:"import {createRequire as __jamdCreateRequire} from 'node:module';const require=__jamdCreateRequire(import.meta.url);"}});
console.log('Built isolated bot swap server artifacts:',Object.keys(entries).join(', '));
