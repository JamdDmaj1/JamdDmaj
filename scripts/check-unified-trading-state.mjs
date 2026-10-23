// Built browser -> actual HTTP handler -> deterministic read-only native bank.
// No production services, provider connection, keys, signatures or transactions.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createHandler} from '../api/wallet-trading-state.js';
import {PERPS_CUSTODIES} from '../lib/perps-server-custody.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.JAMD_PLAYWRIGHT_MODULE||'playwright');
const root=resolve(import.meta.dirname,'../www'),wallet=bs58.encode(Buffer.alloc(32,1));let calls=0;
const handler=createHandler({limit:async()=>{},diagnostic(){},request:async(m,p)=>{
 if(m==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
 if(m==='getMultipleAccounts'){
  const b=Buffer.alloc(165);Buffer.from(bs58.decode(PERPS_CUSTODIES.USDC.mint)).copy(b);Buffer.from(bs58.decode(p[0][0])).copy(b,32);b[108]=1;b.writeBigUInt64LE(5000000n,64);
  return {context:{slot:123},value:[{owner:'11111111111111111111111111111111',executable:false,lamports:180000000,data:['','base64']},{owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',executable:false,lamports:2039280,data:[b.toString('base64'),'base64']},...Array(6).fill(null)]};
 }
 if(m==='getProgramAccounts')return {context:{slot:123},value:[]};
 if(m==='getSignaturesForAddress')return [];
 throw Error('NO_FINANCIAL_METHOD:'+m);
}});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/api/wallet-trading-state'){calls++;const response=await handler(new Request(url));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end('{}');return;}
 const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+sep))throw Error();
 res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.JAMD_BROWSER_EXECUTABLE?{executablePath:process.env.JAMD_BROWSER_EXECUTABLE}:{})});const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/private-simulator.html#lang=en');
 await page.locator('#tab-assets').click();
 await page.evaluate(async address=>{
  const store=await import('/lib/wallet-portfolio-store.js');store.selectWalletAccount(document,{source:'external',address,name:'Fixture wallet'});
  const account=store.selectedWalletAccount(document);store.publishWalletPortfolio(document,{ok:true,address,network:'solana:mainnet',updatedAt:new Date().toISOString(),partial:false,valuationCoverage:1,estimatedValueUsd:23,sol:{amount:0.18,priceUsd:100,valueUsd:18},tokens:[{mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',symbol:'USDC',amount:5,priceUsd:1,valueUsd:5}]},account);
 },wallet);
 await page.waitForFunction(()=>[...document.querySelectorAll('.wallet-trading-state')].length===3&&[...document.querySelectorAll('.wallet-trading-state')].every(n=>n.textContent.includes('5 USDC')));
 assert.match(await page.locator('.wallet-total-usd').innerText(),/23/);
 await page.locator('#tab-futures').click();await page.waitForFunction(()=>!document.getElementById('jupiter-range-margin').disabled);
 await page.locator('#jupiter-range-margin').fill('50');assert.equal(await page.locator('#jupiter-ticket-margin').inputValue(),'2.500000');
 await page.locator('#tab-trade').click();assert.match(await page.locator('.wallet-trading-state').nth(0).textContent(),/5 USDC/);
 await page.evaluate(async()=>{
  const account=(await import('/lib/wallet-portfolio-store.js')).selectedWalletAccount(document);
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('jamddmaj-web-perps-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
  await new Promise((resolve,reject)=>{const tx=db.transaction('operations','readwrite');tx.objectStore('operations').put({operationId:'fixture-corrupt-pending',activeWallet:account.address});tx.oncomplete=resolve;tx.onerror=reject;});db.close();
  // Unknown storage for the selected wallet must withhold availability rather
  // than trusting an invalid row as a terminal failure or clearing it.
  window.dispatchEvent(new Event('jamd-wallet-operations'));
 });
 await page.waitForFunction(()=>[...document.querySelectorAll('.wallet-trading-state')].every(n=>n.textContent.includes('Pending or unverified reservations')));
 assert.equal(await page.locator('#jupiter-range-margin').isDisabled(),true);
 // Verify explicit refresh invalidation synchronously, independent of RPC time.
 await page.evaluate(()=>document.dispatchEvent(new Event('jamd-wallet-refresh')));
 await page.evaluate(async()=>{const store=await import('/lib/wallet-portfolio-store.js');store.selectWalletAccount(document,null);});
 await page.waitForFunction(()=>[...document.querySelectorAll('.wallet-trading-state')].every(n=>n.textContent.includes('Select a wallet')));
 assert.equal(await page.locator('#jupiter-range-margin').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert(calls>0);
 console.log('PASS built Assets/Trade/Futures -> shared controller -> HTTP handler -> native bank -> all three account panels and exact slider; disconnect clears every view; no browser errors or mobile overflow.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
