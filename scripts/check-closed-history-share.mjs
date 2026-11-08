// Actual compiled UI + browser canvas. Synthetic account, no financial network.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),artifacts=resolve('.perps-build/closed-history-share-qa');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/history-fixture.html'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><head></head><body></body></html>');return;}const file=resolve(root,'.'+path);if(!file.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const viewport of [{width:1280,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport,acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/history-fixture.html');
 await page.evaluate(async()=>{
  const {setupBotManualPositionsPanel}=await import('/lib/bot-manual-positions-panel.js'),store=await import('/lib/wallet-portfolio-store.js');
  const wallet='11111111111111111111111111111112',other='11111111111111111111111111111113',host=document.createElement('main');host.style.cssText='max-width:900px;margin:24px auto';document.body.replaceChildren(host);
  const css=document.createElement('link');css.rel='stylesheet';css.href='/wallet-trading-panel.css';document.head.append(css);
  const style=document.createElement('style');style.textContent='body{margin:12px;background:#08111b;font-family:system-ui;color:#dfecfa}button,select,input{font:inherit}';document.head.append(style);
  const common={asset:'BTC',side:'SHORT',closedAt:1700000000000,state:'COMPLETED',firstLegSignature:'2'.repeat(88)};
  const perf=(received,result,bps)=>({version:1,basisUsdcUnits:'10000000',openingPlatformFeeUsdcUnits:'20000',resultUsdcUnits:result,returnBps:bps,excludesSolNetworkCosts:true});
  const items=[{...common,id:'gain',receivedUsdcUnits:'11020000',performance:perf('11020000','1000000','1000')},{...common,id:'loss',receivedUsdcUnits:'9980434',performance:perf('9980434','-39566','-40')},{...common,id:'pending',state:'CLOSED_PENDING_ACCOUNTING',receivedUsdcUnits:'9980434',performance:null}];
  window.__shareCalls=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shareCalls.push({count:data.files.length,type:data.files[0].type,name:data.files[0].name,size:data.files[0].size});if(window.__cancelShare)throw new DOMException('cancelled','AbortError');}});
  store.selectWalletAccount(document,{source:'watch',address:wallet});window.__history=setupBotManualPositionsPanel(host,{doc:document,language:'es',client:{history:async address=>({items:address===wallet?items:[],hasMore:false})}});
  window.__changeWallet=()=>store.selectWalletAccount(document,{source:'watch',address:other});
 });
 await page.waitForSelector('.bch-trade');assert.equal(await page.locator('.bch-trade').count(),3);assert.match(await page.locator('.bch-positive').innerText(),/\+10,00%/);assert.match(await page.locator('.bch-negative').innerText(),/-0,40%/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('.bot-closed-history').screenshot({path:resolve(artifacts,'history-'+viewport.width+'.png')});
 await page.locator('.bch-trade').first().getByRole('button',{name:'Compartir resultado'}).click();const dialog=page.locator('.trade-share-dialog');await dialog.waitFor();
 assert.equal(await dialog.locator('[data-share-option=amount]').isChecked(),false);assert.equal(await dialog.locator('[data-share-option=percentage]').isChecked(),true);assert.equal(await dialog.locator('[data-share-option=margin]').isChecked(),false);
 const before=await dialog.locator('canvas').evaluate(c=>c.toDataURL());await dialog.locator('[data-share-option=amount]').check();assert.notEqual(await dialog.locator('canvas').evaluate(c=>c.toDataURL()),before);
 await dialog.locator('[data-share-option=margin]').check();await dialog.locator('[data-share-option=date]').check();await dialog.screenshot({path:resolve(artifacts,'share-options-'+viewport.width+'.png')});
 const pendingDownload=page.waitForEvent('download');await dialog.getByRole('button',{name:'Descargar PNG',exact:true}).click();const download=await pendingDownload,file=resolve(artifacts,'shared-'+viewport.width+'.png');await download.saveAs(file);const bytes=await readFile(file);assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),675);
 await dialog.getByRole('combobox',{name:'Formato'}).selectOption('square');assert.equal(await dialog.locator('canvas').evaluate(c=>c.height),1080);
 await dialog.getByRole('button',{name:'Compartir imagen',exact:true}).click();await page.waitForFunction(()=>window.__shareCalls.length===1);assert.equal((await page.evaluate(()=>window.__shareCalls[0])).type,'image/png');
 await page.evaluate(()=>window.__cancelShare=true);await dialog.getByRole('button',{name:'Compartir imagen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.trade-share-dialog [role=status]')?.textContent==='Compartir cancelado.');
 // Unsupported native file sharing falls back to PNG, without posting anywhere.
 await page.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));const fallback=page.waitForEvent('download');await dialog.getByRole('button',{name:'Compartir imagen',exact:true}).click();await fallback;assert.equal(await page.evaluate(()=>window.__shareCalls.length),2);
 // Delayed PNG cannot export after the selected wallet changes.
 await page.evaluate(()=>{const c=document.querySelector('.trade-share-dialog canvas'),original=c.toBlob.bind(c);c.toBlob=callback=>original(blob=>{window.__releasePng=()=>callback(blob);},'image/png');});
 await dialog.getByRole('button',{name:'Compartir imagen',exact:true}).click();await page.waitForFunction(()=>!!window.__releasePng);await page.evaluate(()=>{window.__changeWallet();window.__releasePng();});
 assert.equal(await page.locator('.trade-share-dialog').count(),0);assert.equal(await page.locator('.bch-trade').count(),0);assert.equal(await page.evaluate(()=>window.__shareCalls.length),2);
 await page.evaluate(()=>window.__history.dispose());assert.deepEqual(errors,[]);await page.close();
 console.log('PASS history/share canvas '+viewport.width+'px: colors, privacy defaults, toggles, PNG download, native share/cancel and wallet-race guard');
}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
