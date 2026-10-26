// Built-browser regression with a synthetic public account. Never signs or sends.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {ed25519} from '@noble/curves/ed25519.js';
import {swapFixture} from '../tests/fixtures/web-swap.mjs';
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
 const panel=portfolio.locator('.wallet-inline-swap');await panel.waitFor({state:'visible'});
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
 assert.deepEqual(errors,[]);console.log('PASS: built Assets inline swap opens/closes without navigation; remembered wallet requires reconnect; bound provider reviews a simulated quote without signing; no overflow or page errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
