// Compiled design QA with fixture data. No real wallet session or financial calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/__wallet-design.html'){res.setHeader('Content-Type','text/html');res.end((await readFile(resolve(root,'private-simulator.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));return;}const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.request().url().startsWith('https://perps-api.jup.ag/v1/market-stats?')?route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({price:'74000'})}):route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/__wallet-design.html');
 await page.evaluate(async()=>{
  const {setupWalletTradingPanel}=await import('/lib/wallet-trading-panel.js');
  const {selectWalletAccount,selectedWalletAccount}=await import('/lib/wallet-portfolio-store.js');
  const {publishWalletTradingState}=await import('/lib/wallet-trading-state.js');
  const {setupBotManualPositionsPanel}=await import('/lib/bot-manual-positions-panel.js');
  document.body.replaceChildren();document.body.style.padding='16px';const host=document.createElement('div');host.style.cssText='max-width:1020px;margin:24px auto';document.body.append(host);
  const wallet='11111111111111111111111111111112',position='11111111111111111111111111111113';
  selectWalletAccount(document,{source:'watch',address:wallet,name:'Cuenta de demostración'});
  const account=selectedWalletAccount(document),snapshot={stage:'PUBLIC_WALLET_TRADING_STATE',walletAddress:wallet,network:'solana-mainnet',readOnly:true,observedAt:Date.now(),observedSlot:123,availableUsdcUnits:'12500000',allocatedUsdUnits:'10000000',payerLamports:'100000000',positions:[{address:position,asset:'BTC',side:'SHORT',sizeUsdUnits:'30000000',collateralUsdUnits:'10000000',priceUsdUnits:'75000000000'}],orders:[],ordersComplete:true,history:[],historyComplete:false};
  const dispose=setupWalletTradingPanel(host,'es',document);publishWalletTradingState(document,snapshot,account,{pendingKnown:false});
  const closeCalls={read:0,prepare:0,confirm:0};const closePanel=setupBotManualPositionsPanel(host,{doc:document,language:'es',client:{positions:async()=>{closeCalls.read++;return {positions:[{...snapshot.positions[0],tracked:true}],closes:[]};},prepareClose:async()=>{closeCalls.prepare++;throw Error('No financial preparation in display test');},confirmClose:async()=>{closeCalls.confirm++;throw Error('No financial confirmation in display test');}}});
  window.__design={dispose,closePanel,closeCalls,account,snapshot,publishWalletTradingState,refreshes:0};document.addEventListener('jamd-wallet-refresh',()=>window.__design.refreshes++);
 });
 await page.locator('link#wallet-trading-panel-style').evaluate(el=>new Promise((resolve,reject)=>{if(el.sheet)resolve();else{el.onload=resolve;el.onerror=reject;}}));
 const initial=await page.evaluate(()=>({metrics:document.querySelectorAll('.wt-metric').length,positions:document.querySelectorAll('.wt-position').length,open:document.querySelector('.wt-positions').open,short:!!document.querySelector('.wt-short'),overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(document.querySelector('.wt-position')).fontFamily,phantomHidden:getComputedStyle(document.querySelector('.web-close-panel')).display==='none',text:document.querySelector('.wallet-trading-state').textContent}));
 assert.equal(initial.metrics,3);assert.equal(initial.positions,1);assert.equal(initial.open,true);assert.equal(initial.short,true);assert.equal(initial.overflow,false);assert.equal(initial.phantomHidden,true);assert.match(initial.text,/Se verifica al revisar/);
 await page.waitForFunction(()=>document.querySelector('.wt-pnl strong')?.textContent.includes('0,40'));
 assert.match(await page.locator('.wt-pnl').textContent(),/4% sobre/);assert.match(await page.locator('.wt-pnl-note').textContent(),/antes de comisiones/);
 await page.screenshot({path:resolve('.perps-build/trading-design-'+viewport.width+'.png'),fullPage:true});
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('jamd-manage-bot-position',{detail:{walletAddress:'foreign',positionAddress:'foreign'}})));
 assert.equal(await page.evaluate(()=>window.__design.closeCalls.read),0);
 await page.locator('.wt-manage').click();await page.waitForFunction(()=>window.__design.closeCalls.read===1);
 const management=await page.evaluate(()=>({open:document.querySelector('.bot-manual-positions').open,price:document.querySelector('.bot-manual-positions input[type=number]').value,calls:window.__design.closeCalls,selected:document.querySelector('.bot-manual-positions select').value,checked:document.querySelector('.bot-manual-positions input[type=checkbox]').checked}));
 assert.equal(management.open,true);assert.equal(management.price,'74000.000000');assert.equal(management.calls.prepare,0);assert.equal(management.calls.confirm,0);assert.equal(management.selected,'11111111111111111111111111111113');assert.equal(management.checked,false);
 await page.evaluate(()=>{document.querySelector('.wt-refresh').click();const p=document.querySelector('.wt-positions');p.open=false;const d=window.__design;d.publishWalletTradingState(document,{...d.snapshot,observedAt:Date.now(),observedSlot:124},d.account,{pendingKnown:false});});
 assert.equal(await page.locator('.wt-positions').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>window.__design.refreshes),1);
 await page.evaluate(()=>{const d=window.__design;d.publishWalletTradingState(document,null,d.account);});
 assert.equal(await page.locator('.wt-position').count(),0);assert.match(await page.locator('.wt-notice').textContent(),/Sin datos recientes/);assert.deepEqual(errors,[]);
 await page.evaluate(()=>{window.__design.closePanel.dispose();window.__design.dispose();});await page.close();console.log(JSON.stringify({viewport:viewport.width,designVerified:true,refreshEventOnly:true,noFinancialCalls:true,pnlAndManageReadOnly:true}));
}}finally{await browser.close();await new Promise(r=>server.close(r));}
