// Read-only, authenticated artifact comparison; never print headers or bodies.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const deployment=process.argv[2];if(!/^https:\/\/(jamd-dmaj-[a-z0-9-]+\.vercel\.app|www\.jamddmaj\.com)$/.test(deployment||''))throw Error('DEPLOYMENT_TARGET_REQUIRED');
const cli='C:/Users/JamdDmaj/AppData/Local/npm-cache/_npx/3b18615b9ad4807e/node_modules/vercel/dist/vc.js';
const normalize=text=>text.replace(/\r\n/g,'\n').replace(/(?:\.\.\/)+node_modules\//g,'node_modules/');
for(const path of ['index.html','discover.html','discover.js','discover.css','discover-tour.css','wallet-trading-panel.css','assets-wallet-ui.js','lib/bot-manual-perps-panel.js','lib/bot-manual-positions-panel.js']){
 const r=spawnSync(process.execPath,[cli,'curl','/'+path,'--deployment',deployment,'--scope','jamd-dmaj-s-projects','--silent','--show-error','--fail'],{cwd:resolve('.perps-build/history-share-13826-candidate'),encoding:'utf8',maxBuffer:8*1024*1024,timeout:45000});
 if(r.status!==0||normalize(r.stdout)!==normalize(readFileSync(resolve('www',path),'utf8')))throw Error('DEPLOYED_ASSET_MISMATCH:'+path);console.log('VERIFIED '+path);
}
