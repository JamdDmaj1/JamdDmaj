// Built-browser regression with a synthetic public account. Never signs or sends.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {swapFixture} from '../tests/fixtures/web-swap.mjs';
import {transferFixture,recipient} from '../tests/fixtures/wallet-transfer.mjs';
const {chromium}=await import('file:///C:/Users/JamdDmaj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve('www'),server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'\\'))throw Error();const body=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.route('https://solana-rpc.publicnode.com/**',route=>route.abort());
 const base=process.argv[2]||'http://127.0.0.1:'+server.address().port;
 if(!/^https:\/\/www\.jamddmaj\.com$/.test(base)&&!base.startsWith('http://127.0.0.1:'))throw Error('Unexpected QA origin');
 await page.goto(base+'/private-simulator.html?inlineSwap=20261026#lang=en');
 await page.locator('#tab-assets').click();
 await page.evaluate(async()=>{
  const store=await import('/lib/wallet-portfolio-store.js'),session=await import('/lib/perps-web-wallet-session.js');
  const address='7cZzabJQqgWR6yg5jSZZZA5Af5JhrMZaQ32XsKZVxfLy';
  // This deterministic public account is display-only until a provider is bound.
  store.selectWalletAccount(document,{address,source:'external',name:'Phantom fixture'});
  window.fixtureSigningCalls=0;
  window.fixtureBind=()=>session.readWebPerpsWalletSession(document);
 });
 const portfolio=page.locator('#wallet-portfolio-overview');await portfolio.getByRole('button',{name:'Swap',exact:true}).click();
 const panel=portfolio.locator('.wallet-inline-swap').first();await panel.waitFor({state:'visible'});
 assert.equal(await panel.getByRole('button',{name:'Review swap',exact:true}).isDisabled(),true);
 assert.match(await panel.innerText(),/Reconnect this external wallet/);
 assert.equal(await page.locator('#tab-assets').getAttribute('aria-selected'),'true');
 const publicKey=ed25519.getPublicKey(new Uint8Array(32).fill(91)),address=bs58.encode(publicKey),fixture=await swapFixture(address,{slippageBps:50});
 await page.route('**/api/swap-build?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,preparation:fixture.preparation})}));
 await page.route('https://solana-rpc.publicnode.com/**',async route=>{const request=route.request().postDataJSON();if(['sendTransaction'].includes(request.method))throw Error('Browser QA must never send');const result=await fixture.rpc(request.method,request.params);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:request.id,result})});});
 await page.evaluate(async({address,key})=>{
  const store=await import('/lib/wallet-portfolio-store.js'),session=await import('/lib/perps-web-wallet-session.js');
  store.selectWalletAccount(document,{address,source:'external',name:'Phantom fixture'});
  const account={address,publicKey:Uint8Array.from(key),chains:['solana:mainnet'],features:['solana:signTransaction']};
  session.bindWebPerpsWalletSession(document,{name:'Phantom fixture',chains:['solana:mainnet'],accounts:[account],features:{'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:[0,'legacy'],signTransaction(){window.fixtureSigningCalls++;throw Error('No signing in browser QA');}}}},account);
 },{address,key:Array.from(publicKey)});
 await panel.getByRole('textbox',{name:'Amount of the token you pay'}).fill('0.1');
 await panel.getByRole('button',{name:'Review swap',exact:true}).click();
 await panel.getByText(/Minimum received: 9.950000 USDC/).waitFor();
 assert.equal(await page.evaluate(()=>window.fixtureSigningCalls),0);
 assert.equal(await panel.getByRole('button',{name:'Approve in wallet and submit'}).isDisabled(),true);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'.perps-build/inline-assets-swap-mobile.png'});
 await panel.getByRole('button',{name:'Close',exact:true}).click();await panel.waitFor({state:'hidden'});
 const transfer=await transferFixture(address);
 await page.route('https://solana-rpc.publicnode.com/**',async route=>{const request=route.request().postDataJSON();if(request.method==='sendTransaction')throw Error('No real send in browser QA');const result=await transfer.rpc(request.method,request.params);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:request.id,result})});});
 await portfolio.getByRole('button',{name:'Send',exact:true}).click();const sendPanel=portfolio.locator('.wallet-inline-send');await sendPanel.waitFor({state:'visible'});
 await sendPanel.getByRole('textbox',{name:'Amount to send',exact:true}).fill('0.08');await sendPanel.getByRole('textbox',{name:'Solana recipient address',exact:true}).fill(recipient);
 await sendPanel.getByRole('button',{name:'Review send',exact:true}).click();await sendPanel.getByText(/Send: 0.080000000 SOL/).waitFor();assert.equal(await page.evaluate(()=>window.fixtureSigningCalls),0);
 assert.equal(await sendPanel.getByRole('button',{name:'Confirm this real send',exact:true}).isDisabled(),true);
 await sendPanel.getByRole('textbox',{name:'Solana recipient address',exact:true}).fill(address);assert.equal(await sendPanel.getByRole('checkbox').isDisabled(),true);
 await sendPanel.getByRole('button',{name:'Close',exact:true}).click();
 let botSends=0,botPrepares=0;const botAddress='3AXFGU5ErJB46YT6oCFbYh7fq54an1TmFsV5fNWmbQ5T',botId='d'.repeat(64);
 await page.route('https://157.230.54.133/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST'}});return;}
  const request=route.request(),body=request.postDataJSON();let botSwap;
  if(body.action==='botSwapPrepare'&&botPrepares++===0){await route.fulfill({status:409,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({error:{code:'bot-swap-simulation-failed'}})});return;}
  if(body.action==='botTransferPrepare'){assert.equal(body.recipient,recipient);assert.equal(body.mint,'SOL');botSwap={id:botId,stage:'BOT_TRANSFER_REVIEW',walletAddress:botAddress,controlRevision:'revision',recipient,mint:'SOL',decimals:9,inputUnits:'80000000',networkFeeLamports:'5000',accountRentLamports:'0',expiresAt:Date.now()+60000,submitted:false};}
  else if(body.action==='botTransferConfirm'){botSends++;botSwap={id:botId,walletAddress:botAddress,state:'UNKNOWN',signature:'1'.repeat(64),readyForRetry:false};}
  else if(body.action==='botTransferRecover')botSwap={id:botId,walletAddress:botAddress,state:'FINALIZED',signature:'1'.repeat(64),readyForRetry:false};
  else if(['botSwapStatus','botTransferStatus'].includes(body.action))botSwap={stage:'EXCLUSIVE_BOT_WALLET_OPERATIONS',walletAddress:botAddress,swapAvailable:true,reason:null,paused:true,operations:[],readyForSigning:false};
  else if(body.action==='botSwapPrepare')botSwap={id:botId,stage:'BOT_SWAP_REVIEW',walletAddress:botAddress,controlRevision:'00000000-0000-4000-8000-000000000000',direction:'SOL_TO_USDC',inputUnits:'100000000',minimumOutputUnits:'9950000',simulatedOutputUnits:'10000000',networkFeeLamports:'5000',accountRentLamports:'2039280',slippageBps:50,expiresAt:Date.now()+15000,submitted:false};
  else if(body.action==='botSwapConfirm'){botSends++;botSwap={id:botId,walletAddress:botAddress,state:'UNKNOWN',signature:'1'.repeat(64),readyForRetry:false};}
  else if(body.action==='botSwapRecover')botSwap={id:botId,walletAddress:botAddress,state:'FINALIZED',signature:'1'.repeat(64),readyForRetry:false};
  else throw Error('Unexpected bot QA action');
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type'},body:JSON.stringify({ok:true,botSwap})});
 });
 await page.evaluate(async address=>{window.JamdTrial={getToken:()=> 'a'.repeat(64)};const store=await import('/lib/wallet-portfolio-store.js');store.selectWalletAccount(document,{address,source:'watch',name:'Fixture watch-only account'});},botAddress);
 await portfolio.getByRole('button',{name:'Swap',exact:true}).click();
 const botPanel=portfolio.locator('.wallet-inline-swap').filter({has:page.getByRole('heading',{name:'Bot wallet swap',exact:true})});
 await botPanel.getByText(/Bot wallet verified/).waitFor();assert.match(await portfolio.locator('h2').innerText(),/Bot wallet/);
 await botPanel.getByRole('textbox',{name:'Bot input amount'}).fill('0.1');await botPanel.getByRole('button',{name:'Review bot swap',exact:true}).click();
 await botPanel.getByText(/Solana rejected the proposed route simulation/).waitFor();assert.equal(botSends,0);
 assert.doesNotMatch(await botPanel.innerText(),/could not verify access/);
 await botPanel.getByRole('button',{name:'Review bot swap',exact:true}).click();
 await botPanel.getByText(/Minimum received: 9.950000 USDC/).waitFor();assert.equal(botSends,0);
 assert.equal(await botPanel.getByRole('button',{name:'Confirm this real swap',exact:true}).isDisabled(),true);
 await botPanel.getByRole('checkbox').check();await botPanel.getByRole('button',{name:'Confirm this real swap',exact:true}).click();
 await botPanel.getByText(/Submission recorded/).waitFor();assert.equal(botSends,1);
 await botPanel.getByRole('button',{name:'Check pending result',exact:true}).click();await botPanel.getByText(/Swap finalized/).waitFor();
 assert.equal(await page.locator('#tab-assets').getAttribute('aria-selected'),'true');
 await botPanel.scrollIntoViewIfNeeded();await page.screenshot({path:'.perps-build/bot-assets-swap-mobile.png'});
 await botPanel.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(async address=>{const s=await import('/lib/wallet-portfolio-store.js');s.publishWalletPortfolio(document,{ok:true,address,network:'solana:mainnet',updatedAt:new Date().toISOString(),sol:{amount:0.06},tokens:[{symbol:'USDC',mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',amount:13}],partial:false,estimatedValueUsd:19,valuationCoverage:1},s.selectedWalletAccount(document));},botAddress);
 await portfolio.getByRole('button',{name:'Send',exact:true}).click();await sendPanel.getByText(/Bot wallet verified/).waitFor();assert.match(await sendPanel.getByRole('combobox').innerText(),/USDC · 13/);
 await sendPanel.getByRole('textbox',{name:'Amount to send',exact:true}).fill('0.08');await sendPanel.getByRole('textbox',{name:'Solana recipient address',exact:true}).fill(recipient);
 await sendPanel.getByRole('button',{name:'Review send',exact:true}).click();await sendPanel.getByText(/Send: 0.080000000 SOL/).waitFor();assert.equal(botSends,1);
 assert.equal(await sendPanel.getByRole('button',{name:'Confirm this real send',exact:true}).isDisabled(),true);await sendPanel.getByRole('checkbox').check();await sendPanel.getByRole('button',{name:'Confirm this real send',exact:true}).click();
 await sendPanel.getByText(/Submission recorded/).waitFor();assert.equal(botSends,2);await sendPanel.getByRole('button',{name:'Check pending result',exact:true}).click();await sendPanel.getByText(/Send finalized/).waitFor();
 assert.equal(await page.locator('#tab-assets').getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await sendPanel.scrollIntoViewIfNeeded();await page.screenshot({path:'.perps-build/bot-assets-send-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS: built Assets inline swap opens/closes without navigation; remembered wallet requires reconnect; bound provider reviews a simulated quote without signing; no overflow or page errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
