// Actual compiled browser panel; every financial/network dependency is mocked.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www');
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/private-simulator.html#lang=es');
 const result=await page.evaluate(async()=>{
  const {setupManualPerpsPolicyPanel}=await import('/lib/perps-manual-policy-panel.js');
  const {selectWalletAccount}=await import('/lib/wallet-portfolio-store.js');
  const wallet='11111111111111111111111111111112',calls=[],host=document.createElement('div');document.body.replaceChildren(host);host.style.cssText='padding:16px;max-width:680px;box-sizing:border-box';
  selectWalletAccount(document,{source:'watch',address:wallet,name:'Bot fixture'});
  const limits={capitalUsd:'11',dailyLossUsd:'4',positions:1,dailyTrades:4};
  const panel=setupManualPerpsPolicyPanel(host,{doc:document,client:{read:async()=>({policy:{revision:'fixture-old',limits},executionAvailable:false}),save:async v=>{calls.push(v);return {policy:{revision:'fixture-new',limits:v.limits},executionAvailable:false};}}});
  panel.panel.open=true;await panel.read.onclick();
  const noAutomaticSave=calls.length===0,advanced=panel.fields.capitalUsd.closest('details'),advancedClosed=!advanced.open;
  const button=panel.perOrder.getBoundingClientRect(),fits=button.left>=0&&button.right<=innerWidth;
  await panel.perOrder.onclick();
  const verified=panel.status.textContent.includes('Modo manual por orden verificado');
  advanced.open=true;const checkbox=panel.approval.getBoundingClientRect();
  return {noAutomaticSave,advancedClosed,fits,verified,calls,checkboxWidth:checkbox.width,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 assert.equal(result.noAutomaticSave,true);assert.equal(result.advancedClosed,true);assert.equal(result.fits,true);assert.equal(result.verified,true);assert.equal(result.calls.length,1);assert.equal(result.calls[0].explicitApproval,true);assert.deepEqual(result.calls[0].limits,{mode:'perOrder'});assert.ok(result.checkboxWidth<=24);assert.equal(result.overflow,false);assert.deepEqual(errors,[]);
 await page.screenshot({path:resolve('.perps-build/per-order-policy-'+viewport.width+'.png'),fullPage:true});await page.close();
 console.log(JSON.stringify({viewport:viewport.width,compiledPanelVerified:true,financialRequests:0}));
}}finally{await browser.close();await new Promise(r=>server.close(r));}
