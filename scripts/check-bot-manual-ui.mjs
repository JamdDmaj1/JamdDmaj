// Real compiled browser modules and DOM, all financial network requests mocked.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'\\'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/private-simulator.html#lang=en');
 const result=await page.evaluate(async()=>{
  const {setupBotManualPerpsPanel}=await import('/lib/bot-manual-perps-panel.js');
  const {setupBotManualPositionsPanel}=await import('/lib/bot-manual-positions-panel.js');
  const {selectWalletAccount}=await import('/lib/wallet-portfolio-store.js');
  const wallet='11111111111111111111111111111112',calls=[],host=document.createElement('div');document.body.replaceChildren(host);
  selectWalletAccount(document,{source:'watch',address:wallet,name:'Bot fixture'});
  const client={positions:async()=>({positions:[{address:wallet,asset:'SOL',side:'LONG',sizeUsdUnits:'30000000',collateralUsdUnits:'10000000',tracked:true}],closes:[]}),
   prepareClose:async()=>({id:'fixture',walletAddress:wallet,positionAddress:wallet,asset:'SOL',side:'LONG',expiresAt:Date.now()+15000,protection:{priceLimitUsdUnits:'99500000',receiveAsset:'SOL',estimatedTokenUnits:'100',maximumNetworkFeeLamports:'5000'}}),
   confirmClose:async()=>{calls.push('confirm');return {state:'PREPARED',phase:'UNCERTAIN'};}};
  const panel=setupBotManualPositionsPanel(host,{doc:document,language:'en',client});const buttons=()=>[...host.querySelectorAll('button')];
  await buttons().find(n=>n.textContent==='Read bot positions').onclick();const input=host.querySelector('input[type=number]');input.value='100';input.oninput();
  await buttons().find(n=>n.textContent==='Review full close').onclick();const confirm=buttons().find(n=>n.textContent==='Confirm bot wallet close');
  const disabledBeforeConsent=confirm.disabled,consent=host.querySelector('input[type=checkbox]');consent.checked=true;consent.onchange();const enabledAfterConsent=!confirm.disabled;
  await confirm.onclick();const text=host.textContent;panel.dispose();host.replaceChildren();
  const entry=setupBotManualPerpsPanel(host,{doc:document,language:'en',client:{
   status:async()=>({available:true,operations:[]}),prepare:async(_wallet,draft)=>({walletAddress:wallet,draft,expiresAt:Date.now()+15000,marginUsdcUnits:'10000000',networkFeeLamports:'5000',rentLockedLamports:'1000000',fee:{feeUnits:'20000',recipient:wallet},limits:{capitalUsd:'50',dailyLossUsd:'5',positions:1,dailyTrades:5}}),
   confirm:async(_r,order,fee)=>{if(order!==true||fee!==true)throw Error('Both approvals required');calls.push('entry');return {state:'UNCERTAIN'};}
  }});
  // Client's public API is prepare(wallet,draft).
  await entry.prepare({asset:'SOL',side:'LONG',margin:'10',leverage:'3',referencePrice:'100'});
  const entryConfirm=buttons().find(n=>n.textContent==='Confirm manual bot order'),entrySection=entryConfirm.closest('section');
  const approvals=entrySection.querySelectorAll('input[type=checkbox]'),entryBlocked=entryConfirm.disabled;
  approvals[0].checked=true;approvals[0].onchange();const entryEnabled=!entryConfirm.disabled;
  const combined=entrySection.textContent.includes('10.02 USDC');await entryConfirm.onclick();entry.dispose();
  return {disabledBeforeConsent,enabledAfterConsent,calls,text,approvalCount:approvals.length,entryBlocked,entryEnabled,combined};
 });
 assert.equal(result.disabledBeforeConsent,true);assert.equal(result.enabledAfterConsent,true);assert.deepEqual(result.calls,['confirm','entry']);assert.equal(result.approvalCount,1);assert.equal(result.entryBlocked,true);assert.equal(result.entryEnabled,true);assert.equal(result.combined,true);assert.match(result.text,/UNCERTAIN/);assert.deepEqual(errors,[]);await page.close();
}console.log('PASS: compiled manual close UI desktop/mobile, separate consent, one mocked confirmation, pending recovery. No financial network calls.');}
finally{await browser.close();await new Promise(r=>server.close(r));}
