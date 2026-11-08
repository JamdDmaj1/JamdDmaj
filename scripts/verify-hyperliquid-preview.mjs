// Authenticated read-only byte comparison of the exact preview. Never promotes.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const deployment=process.argv[2];if(!/^https:\/\/jamd-dmaj-[a-z0-9-]+\.vercel\.app$/.test(deployment||''))throw Error('PREVIEW_REQUIRED');
const cli='C:/Users/JamdDmaj/AppData/Local/npm-cache/_npx/3b18615b9ad4807e/node_modules/vercel/dist/vc.js';
// Vercel appends this exact opt-in preview Toolbar tag after HTML responses.
// No application script/body differences are ignored.
const normalize=(value,path)=>{let result=value.replace(/\r\n/g,'\n').replace(/(?:\.\.\/)+node_modules\//g,'node_modules/');if(path.endsWith('.html'))result=result.replace(/<script async data-explicit-opt-in="true" data-deployment-id="dpl_[A-Za-z0-9]+" src="https:\/\/vercel\.live\/_next-live\/feedback\/feedback\.js"><\/script>$/,'');return result;};
for(const path of ['hyperliquid-testnet.html','hyperliquid-testnet-ui.js','lib/hyperliquid-public.js','lib/hyperliquid-panel.js','lib/terminal-layout.js','discover.html','discover.js','discover.css','discover-tour.css']){
 const result=spawnSync(process.execPath,[cli,'curl','/'+path,'--deployment',deployment,'--scope','jamd-dmaj-s-projects','--silent','--show-error','--fail'],{cwd:resolve('.perps-build/hyperliquid-testnet-preview'),encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
 if(result.status!==0||normalize(result.stdout,path)!==normalize(readFileSync(resolve('www',path),'utf8'),path))throw Error('PREVIEW_ASSET_MISMATCH:'+path);console.log('VERIFIED '+path);
}
